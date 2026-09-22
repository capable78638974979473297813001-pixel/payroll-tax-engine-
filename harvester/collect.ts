import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Repo side of the harvester. Walks the committed data tree and pulls out
 * every official source URL the data already cites (the `url` fields inside
 * each file's `sources[]`, `source`, `localAggregators[]`, etc.), plus a
 * lightweight freshness read of each file. Nothing here touches the network —
 * it only reads what is in the repo, so it is fully deterministic.
 */

export interface CitedSource {
  url: string;
  /** Repo-relative paths of the data files that cite this URL. */
  citedBy: string[];
  /** A human title if one sat next to the URL. */
  title?: string;
}

export interface FileScan {
  path: string;
  ok: boolean;
  parseError?: string;
  /** asOf / generatedOn / verifiedOn / year — whatever freshness marker exists. */
  asOf?: string;
  year?: number;
  urlCount: number;
}

export interface RepoScan {
  files: FileScan[];
  sources: CitedSource[];
}

const isHttpUrl = (v: unknown): v is string =>
  typeof v === 'string' && /^https?:\/\/\S+$/i.test(v);

const DATE_KEYS = ['asOf', 'generatedOn', 'verifiedOn', 'effectiveFrom'];

/** Recursively list every *.json under a directory (repo-relative-safe). */
export function listJsonFiles(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir, { recursive: true }) as string[];
  } catch {
    return out;
  }
  for (const e of entries) if (e.endsWith('.json')) out.push(join(dir, e));
  return out;
}

/**
 * Deep-walk a parsed JSON value, collecting every http(s) URL string and, when
 * a sibling `title`/`name` sits in the same object, pairing it. Also reports
 * the newest freshness date and a year seen anywhere in the object.
 */
function walk(
  node: unknown,
  onUrl: (url: string, title?: string) => void,
  freshness: { date?: string; year?: number },
): void {
  if (Array.isArray(node)) {
    for (const v of node) walk(v, onUrl, freshness);
    return;
  }
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    const title = typeof obj.title === 'string' ? obj.title : typeof obj.name === 'string' ? obj.name : undefined;
    for (const [k, v] of Object.entries(obj)) {
      if (isHttpUrl(v)) onUrl(v, title);
      else if (DATE_KEYS.includes(k) && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) {
        if (!freshness.date || v > freshness.date) freshness.date = v.slice(0, 10);
      } else if (k === 'year' && typeof v === 'number') {
        freshness.year = v;
      } else {
        walk(v, onUrl, freshness);
      }
    }
  }
}

/**
 * Scan the whole data tree: validate each JSON file parses, read its freshness
 * marker, and build the deduped list of cited source URLs.
 */
export function scanRepo(dataDir: string): RepoScan {
  const files: FileScan[] = [];
  const byUrl = new Map<string, CitedSource>();

  for (const abs of listJsonFiles(dataDir)) {
    const rel = relative(process.cwd(), abs);
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(abs, 'utf8'));
    } catch (e) {
      files.push({ path: rel, ok: false, parseError: (e as Error).message.slice(0, 120), urlCount: 0 });
      continue;
    }
    const freshness: { date?: string; year?: number } = {};
    let urlCount = 0;
    walk(parsed, (url, title) => {
      urlCount++;
      const existing = byUrl.get(url);
      if (existing) {
        if (!existing.citedBy.includes(rel)) existing.citedBy.push(rel);
        if (!existing.title && title) existing.title = title;
      } else {
        byUrl.set(url, { url, citedBy: [rel], title });
      }
    }, freshness);
    files.push({ path: rel, ok: true, asOf: freshness.date, year: freshness.year, urlCount });
  }

  const sources = [...byUrl.values()].sort((a, b) => a.url.localeCompare(b.url));
  return { files, sources };
}
