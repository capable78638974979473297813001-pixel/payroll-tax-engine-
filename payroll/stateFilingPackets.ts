import { mkdirSync, writeFileSync, readFileSync, readdirSync, renameSync, rmSync, openSync, closeSync } from 'node:fs';
import { resolve, join, dirname, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { exportStateFiling, filingContentHash } from './stateFilingExports.ts';
import type { StateFilingInput, FilingExport } from './stateFilingExports.ts';

export interface PortalReceipt {
  status: 'submitted' | 'accepted' | 'rejected' | 'partially_accepted';
  confirmationId: string;
  recordedBy: string;
  /** ISO timestamp shown on the agency confirmation, not the time the CSV was generated. */
  occurredAt: string;
}
interface StoredReceipt extends PortalReceipt {
  sequence: number;
  recordedAt: string;
  evidenceSha256: string;
  packetSha256: string;
  source: 'operator_recorded_agency_evidence';
}
function privateWrite(path: string, content: string | Buffer): void {
  writeFileSync(path, content, { flag: 'wx', mode: 0o600 });
}
function readPacket(directory: string): { manifest: FilingExport['manifest']; packetHash: string } {
  const raw = readFileSync(join(directory, 'manifest.json'), 'utf8');
  const manifest = JSON.parse(raw);
  if (manifest.version !== 1 || !['CA', 'MI'].includes(manifest.state) ||
    !['DE9C', 'UI_WAGE'].includes(manifest.form) || manifest.year !== 2026 ||
    ![1, 2, 3, 4].includes(manifest.quarter)) throw new Error('Invalid packet manifest');
  const filename = manifest.state + '-' + manifest.form + '-' + manifest.year + '-Q' + manifest.quarter + '.csv';
  if (filingContentHash(readFileSync(join(directory, filename), 'utf8')) !== manifest.sha256) {
    throw new Error('Filing file changed after preparation');
  }
  return { manifest, packetHash: filingContentHash(raw) };
}

/** Writes an immutable upload packet to a NEW directory. Never submits or pays. */
export function writeStateFilingPacket(input: StateFilingInput, outputDirectory: string): FilingExport['manifest'] {
  const result = exportStateFiling(input);
  const target = resolve(outputDirectory);
  const staging = join(dirname(target), '.' + basename(target) + '-' + randomUUID());
  mkdirSync(staging, { mode: 0o700 });
  try {
    privateWrite(join(staging, result.filename), result.content);
    privateWrite(join(staging, 'manifest.json'), JSON.stringify(result.manifest, null, 2) + '\n');
    privateWrite(join(staging, 'instructions.txt'), result.instructions.join('\n\n') + '\n');
    // Reserve the target atomically; fail on every existing directory, including an empty one.
    mkdirSync(target, { mode: 0o700 });
    try {
      for (const filename of readdirSync(staging)) renameSync(join(staging, filename), join(target, filename));
    } catch (error) {
      // The reserved packet is incomplete; leave it visible and do not treat it as ready.
      throw new Error('Packet write incomplete; use a new output directory', { cause: error });
    }
    return result.manifest;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

/** Store portal evidence. These are operator assertions, NOT authenticated agency callbacks. */
export function recordStateFilingReceipt(
  directory: string, receipt: PortalReceipt, evidence: Buffer,
): StoredReceipt {
  if (!receipt || !['submitted', 'accepted', 'rejected', 'partially_accepted'].includes(receipt.status)) {
    throw new Error('Invalid receipt status');
  }
  for (const field of ['confirmationId', 'recordedBy'] as const) {
    const value = receipt[field];
    if (typeof value !== 'string' || !value.trim() || value.length > 200 || /[\r\n\x00]/.test(value)) {
      throw new Error('Invalid receipt ' + field);
    }
  }
  if (typeof receipt.occurredAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(receipt.occurredAt) ||
    !Number.isFinite(Date.parse(receipt.occurredAt)) || new Date(receipt.occurredAt).toISOString() !== receipt.occurredAt ||
    Date.parse(receipt.occurredAt) > Date.now()) throw new Error('Invalid receipt timestamp');
  if (!Buffer.isBuffer(evidence) || evidence.length === 0 || evidence.length > 10_000_000) {
    throw new Error('Receipt evidence must be 1 byte to 10 MB');
  }
  const root = resolve(directory);
  const lockPath = join(root, '.receipt-lock');
  const lock = openSync(lockPath, 'wx', 0o600);
  let pending: string | undefined;
  try {
    const { packetHash } = readPacket(root);
    const names = readdirSync(root).filter(name => /^receipt-\d{6}$/.test(name)).sort();
    const history: StoredReceipt[] = names.map((name, i) => {
      const item: StoredReceipt = JSON.parse(readFileSync(join(root, name, 'receipt.json'), 'utf8'));
      if (item.sequence !== i + 1 || item.packetSha256 !== packetHash ||
        filingContentHash(readFileSync(join(root, name, 'evidence.bin')).toString('base64')) !== item.evidenceSha256) {
        throw new Error('Receipt history integrity check failed');
      }
      return item;
    });
    const prior = history.at(-1);
    if (!prior && receipt.status !== 'submitted') throw new Error('Record portal submission before its result');
    if (prior && (prior.status === 'accepted' || prior.status === 'rejected' ||
      receipt.status === 'submitted')) throw new Error('Invalid receipt transition; prepare a new corrected packet for resubmission');
    if (prior && Date.parse(receipt.occurredAt) < Date.parse(prior.occurredAt)) throw new Error('Receipt timestamp precedes previous event');
    if (history.some(r => r.confirmationId === receipt.confirmationId && r.status === receipt.status)) {
      throw new Error('Duplicate receipt');
    }
    const sequence = history.length + 1;
    if (sequence > 999999) throw new Error('Receipt limit exceeded');
    const event: StoredReceipt = {
      status: receipt.status, confirmationId: receipt.confirmationId, recordedBy: receipt.recordedBy,
      occurredAt: receipt.occurredAt, sequence, recordedAt: new Date().toISOString(),
      evidenceSha256: filingContentHash(evidence.toString('base64')), packetSha256: packetHash,
      source: 'operator_recorded_agency_evidence',
    };
    pending = join(root, '.receipt-pending-' + randomUUID());
    mkdirSync(pending, { mode: 0o700 });
    privateWrite(join(pending, 'evidence.bin'), evidence);
    privateWrite(join(pending, 'receipt.json'), JSON.stringify(event, null, 2) + '\n');
    renameSync(pending, join(root, 'receipt-' + String(sequence).padStart(6, '0')));
    pending = undefined;
    return event;
  } finally {
    if (pending) rmSync(pending, { recursive: true, force: true });
    closeSync(lock);
    rmSync(lockPath);
  }
}
