import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Does each UI source actually CONTAIN the figures it is supposed to watch?
 *
 * A separate question from whether it fetches, and the more important one.
 * A page can return 200, hash stably, and sit in the registry looking
 * monitored while stating no rate and no wage base — that is what
 * Pennsylvania's search form did for weeks, and what Maryland's, Minnesota's
 * and New Mexico's sources were doing when this check was first written.
 *
 * Runs against snapshots already on disk, so it costs nothing and can be
 * re-run after any sweep. It rewrites the uiContent classification and the
 * uiCoverage.contentAudit summary in sources.json, which is what
 * `harvest:status` reports from.
 *
 * Deliberately conservative about what counts as a hit: a wage base must be
 * a wage-base PHRASE next to a dollar figure, not merely a number that
 * looks like money. Under-counting here is safe (it asks a human to look);
 * over-counting is what produced the inflated coverage claim this exists
 * to prevent.
 */

const HERE = import.meta.dirname;
const SNAPSHOTS = () => process.env.HARVESTER_SNAPSHOT_ROOT ?? join(HERE, 'snapshots');
const REGISTRY = join(HERE, 'sources.json');

const WAGE_BASE_PHRASE =
  /(taxable wage base|wage base|taxable wages are|taxable on the first|taxable wage limit|first \$?\d{1,3},\d{3})/i;
const DOLLAR_FIGURE = /\$?\s?\d{1,3},\d{3}/;
const RATE_FIGURE = /\d\.\d{1,3}\s?%/;

export type UiContent =
  | 'wage-base-and-rates'
  | 'rates-only'
  | 'wage-base-only'
  | 'neither'
  | 'unknown-no-snapshot';

export function classifyText(text: string): Exclude<UiContent, 'unknown-no-snapshot'> {
  const t = text.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  const wb = WAGE_BASE_PHRASE.test(t) && DOLLAR_FIGURE.test(t);
  const rt = RATE_FIGURE.test(t);
  return wb && rt ? 'wage-base-and-rates' : rt ? 'rates-only' : wb ? 'wage-base-only' : 'neither';
}

function latestCapture(sourceId: string): string | null {
  const dir = join(SNAPSHOTS(), sourceId);
  if (!existsSync(dir)) return null;
  const raws = readdirSync(dir).filter((f) => f.endsWith('.raw')).sort();
  if (!raws.length) return null;
  return readFileSync(join(dir, raws[raws.length - 1]), 'utf8');
}

export interface AuditResult {
  wageBaseMonitoredCount: number;
  rateMonitoredCount: number;
  carriesNeither: string[];
  noCaptureToCheck: string[];
  datedUrlRisk: string[];
}

export function auditUiSources(registryPath = REGISTRY): AuditResult {
  const reg = JSON.parse(readFileSync(registryPath, 'utf8'));

  for (const s of reg.sources) {
    if (!s.coversUI) continue;
    const raw = latestCapture(s.id);
    s.uiContent = raw === null ? 'unknown-no-snapshot' : classifyText(raw);
    if (s.uiContent === 'neither') s.monitoringGap = true;
    else delete s.monitoringGap;
  }

  const ui = reg.sources.filter((s: { coversUI?: boolean }) => s.coversUI);
  const by = (k: UiContent) =>
    [...new Set(ui.filter((s: { uiContent?: string }) => s.uiContent === k).map((s: { jurisdiction: string }) => s.jurisdiction))].sort() as string[];

  const wageBase = [...new Set([...by('wage-base-and-rates'), ...by('wage-base-only')])].sort();
  const rates = [...new Set([...by('wage-base-and-rates'), ...by('rates-only')])].sort();
  const datedUrlRisk = [
    ...new Set(ui.filter((s: { datedUrlRisk?: boolean }) => s.datedUrlRisk).map((s: { jurisdiction: string }) => s.jurisdiction)),
  ].sort() as string[];

  reg.uiCoverage.contentAudit = {
    ...reg.uiCoverage.contentAudit,
    auditedOn: new Date().toISOString().slice(0, 10),
    wageBaseAndRates: by('wage-base-and-rates'),
    ratesOnly: by('rates-only'),
    wageBaseOnly: by('wage-base-only'),
    carriesNeither: by('neither'),
    noCaptureToCheck: by('unknown-no-snapshot'),
    wageBaseMonitoredCount: wageBase.length,
    rateMonitoredCount: rates.length,
    datedUrlRisk,
  };

  writeFileSync(registryPath, JSON.stringify(reg, null, 2) + '\n');

  return {
    wageBaseMonitoredCount: wageBase.length,
    rateMonitoredCount: rates.length,
    carriesNeither: by('neither'),
    noCaptureToCheck: by('unknown-no-snapshot'),
    datedUrlRisk,
  };
}

export function describeAudit(r: AuditResult): string {
  const l: string[] = [''];
  l.push('UI SOURCE CONTENT AUDIT');
  l.push('='.repeat(72));
  l.push(`  states whose source states the taxable WAGE BASE : ${r.wageBaseMonitoredCount} / 51`);
  l.push(`  states whose source states RATES                 : ${r.rateMonitoredCount} / 51`);
  l.push('');
  if (r.carriesNeither.length) {
    l.push(`  CARRIES NEITHER (fetches clean, says nothing): ${r.carriesNeither.join(' ')}`);
  }
  if (r.noCaptureToCheck.length) {
    l.push(`  no capture to check (fetch failed last sweep): ${r.noCaptureToCheck.join(' ')}`);
  }
  if (r.datedUrlRisk.length) {
    l.push(`  DATED URL — cannot change, so reports green forever: ${r.datedUrlRisk.join(' ')}`);
  }
  if (!r.carriesNeither.length && !r.noCaptureToCheck.length) {
    l.push('  Every UI source carries at least one of the two figures.');
  }
  l.push('');
  return l.join('\n');
}
