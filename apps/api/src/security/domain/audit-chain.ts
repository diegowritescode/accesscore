import { createHash } from 'node:crypto';
import { type ChainVerification } from './audit-event';

export const GENESIS_HASH = '0'.repeat(64);

export interface HashableRecord {
  type: string;
  orgId: string | null;
  subject: string | null;
  payload: Record<string, unknown>;
  recordedAt: Date;
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value ?? null);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`);
  return `{${entries.join(',')}}`;
}

export function hashRecord(prevHash: string, record: HashableRecord): string {
  const canonical = canonicalize({
    type: record.type,
    orgId: record.orgId,
    subject: record.subject,
    payload: record.payload,
    recordedAt: record.recordedAt.toISOString(),
  });
  return createHash('sha256').update(`${prevHash}\n${canonical}`).digest('hex');
}

export function verifyChain(records: (HashableRecord & { hash: string })[]): ChainVerification {
  let previous = GENESIS_HASH;
  for (const [index, record] of records.entries()) {
    if (hashRecord(previous, record) !== record.hash) {
      return { ok: false, length: records.length, brokenAt: index };
    }
    previous = record.hash;
  }
  return { ok: true, length: records.length, brokenAt: null };
}
