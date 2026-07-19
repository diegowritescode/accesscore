import { UserId } from '../../shared/kernel/user-id';
import { RecoveryCode } from './recovery-code';

const now = new Date('2026-07-19T00:00:00.000Z');
const userId = UserId.generate();

describe('RecoveryCode', () => {
  it('issues an unconsumed code', () => {
    const code = RecoveryCode.issue({ id: 'rc-1', userId, codeHash: 'hash', now });
    expect(code.isConsumed()).toBe(false);
    expect(code.consumedAt).toBeNull();
    expect(code.codeHash).toBe('hash');
  });

  it('consumes once and rejects double consumption', () => {
    const code = RecoveryCode.issue({ id: 'rc-1', userId, codeHash: 'hash', now });
    code.consume(now);
    expect(code.isConsumed()).toBe(true);
    expect(code.consumedAt).toEqual(now);
    expect(() => code.consume(now)).toThrow('already consumed');
  });
});
