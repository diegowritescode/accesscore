import { GENESIS_HASH, hashRecord, verifyChain, type HashableRecord } from './audit-chain';

const at = (iso: string): Date => new Date(iso);

const event = (overrides: Partial<HashableRecord> = {}): HashableRecord => ({
  type: 'mfa.activated',
  orgId: 'org-1',
  subject: 'user:alice',
  payload: { credentialId: 'c1' },
  recordedAt: at('2026-07-19T00:00:00.000Z'),
  ...overrides,
});

const chain = (events: HashableRecord[]): (HashableRecord & { hash: string })[] => {
  let previous = GENESIS_HASH;
  return events.map((record) => {
    const hash = hashRecord(previous, record);
    previous = hash;
    return { ...record, hash };
  });
};

describe('hashRecord', () => {
  it('produces a stable 64-char hex digest', () => {
    const hash = hashRecord(GENESIS_HASH, event());
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRecord(GENESIS_HASH, event())).toBe(hash);
  });

  it('is independent of payload key ordering', () => {
    const a = hashRecord(GENESIS_HASH, event({ payload: { a: 1, b: 2 } }));
    const b = hashRecord(GENESIS_HASH, event({ payload: { b: 2, a: 1 } }));
    expect(a).toBe(b);
  });

  it('changes when the predecessor hash changes', () => {
    expect(hashRecord(GENESIS_HASH, event())).not.toBe(hashRecord('f'.repeat(64), event()));
  });

  it('changes when any field changes', () => {
    const base = hashRecord(GENESIS_HASH, event());
    expect(hashRecord(GENESIS_HASH, event({ type: 'mfa.disabled' }))).not.toBe(base);
    expect(hashRecord(GENESIS_HASH, event({ orgId: 'org-2' }))).not.toBe(base);
    expect(hashRecord(GENESIS_HASH, event({ subject: 'user:bob' }))).not.toBe(base);
    expect(hashRecord(GENESIS_HASH, event({ payload: { credentialId: 'c2' } }))).not.toBe(base);
    expect(
      hashRecord(GENESIS_HASH, event({ recordedAt: at('2026-07-19T00:00:01.000Z') })),
    ).not.toBe(base);
  });
});

describe('verifyChain', () => {
  it('accepts an empty chain', () => {
    expect(verifyChain([])).toEqual({ ok: true, length: 0, brokenAt: null });
  });

  it('accepts a well-formed chain', () => {
    const records = chain([
      event({ type: 'mfa.activated' }),
      event({ type: 'mfa.step_up' }),
      event({ type: 'mfa.disabled' }),
    ]);
    expect(verifyChain(records)).toEqual({ ok: true, length: 3, brokenAt: null });
  });

  it('flags the exact index of a tampered payload', () => {
    const records = chain([event({ type: 'mfa.activated' }), event({ type: 'mfa.step_up' })]);
    records[1] = { ...records[1]!, payload: { credentialId: 'forged' } };
    expect(verifyChain(records)).toEqual({ ok: false, length: 2, brokenAt: 1 });
  });

  it('flags a broken link when a record is removed from the middle', () => {
    const records = chain([
      event({ type: 'mfa.activated' }),
      event({ type: 'mfa.step_up' }),
      event({ type: 'mfa.disabled' }),
    ]);
    const spliced = [records[0]!, records[2]!];
    expect(verifyChain(spliced)).toEqual({ ok: false, length: 2, brokenAt: 1 });
  });

  it('detects tampering at every position when a single field is mutated', () => {
    const size = 12;
    const records = chain(
      Array.from({ length: size }, (_, index) => event({ payload: { seq: index } })),
    );
    for (let index = 0; index < size; index += 1) {
      const forged = records.map((record) => ({ ...record }));
      forged[index] = { ...forged[index]!, subject: 'user:mallory' };
      expect(verifyChain(forged).brokenAt).toBe(index);
    }
  });
});
