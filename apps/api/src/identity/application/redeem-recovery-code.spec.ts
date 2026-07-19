import { type Clock } from '../../shared/kernel/clock';
import { UserId } from '../../shared/kernel/user-id';
import { RecoveryCode } from '../domain/recovery-code';
import { type RecoveryCodesRepository } from '../domain/ports/recovery-codes-repository';
import { type TokenGenerator } from '../domain/ports/token-generator';
import { RedeemRecoveryCodeHandler } from './redeem-recovery-code';

const now = new Date('2026-07-19T00:00:00.000Z');
const clock: Clock = { now: () => now };
const userId = UserId.generate();

const tokens: TokenGenerator = {
  generate: () => ({ raw: 'x', hash: 'x' }),
  hash: (raw) => `h:${raw}`,
};

const unconsumed = (): RecoveryCode =>
  RecoveryCode.issue({ id: 'rc-1', userId, codeHash: 'h:CODE', now });

const consumed = (): RecoveryCode => {
  const code = unconsumed();
  code.consume(now);
  return code;
};

const repo = (overrides: Partial<RecoveryCodesRepository>): RecoveryCodesRepository => ({
  replaceForUser: () => Promise.resolve(),
  findByHash: () => Promise.resolve(null),
  consume: () => Promise.resolve(true),
  countActive: () => Promise.resolve(0),
  ...overrides,
});

describe('RedeemRecoveryCodeHandler', () => {
  it('consumes a valid unused code', async () => {
    let consumeCalls = 0;
    const handler = new RedeemRecoveryCodeHandler(
      repo({
        findByHash: () => Promise.resolve(unconsumed()),
        consume: () => {
          consumeCalls += 1;
          return Promise.resolve(true);
        },
      }),
      tokens,
      clock,
    );
    expect(await handler.execute({ userId, code: 'CODE' })).toBe(true);
    expect(consumeCalls).toBe(1);
  });

  it('rejects an unknown code', async () => {
    const handler = new RedeemRecoveryCodeHandler(repo({}), tokens, clock);
    expect(await handler.execute({ userId, code: 'nope' })).toBe(false);
  });

  it('rejects an already consumed code without a second write', async () => {
    let consumeCalls = 0;
    const handler = new RedeemRecoveryCodeHandler(
      repo({
        findByHash: () => Promise.resolve(consumed()),
        consume: () => {
          consumeCalls += 1;
          return Promise.resolve(true);
        },
      }),
      tokens,
      clock,
    );
    expect(await handler.execute({ userId, code: 'CODE' })).toBe(false);
    expect(consumeCalls).toBe(0);
  });

  it('fails when the atomic consume loses the race', async () => {
    const handler = new RedeemRecoveryCodeHandler(
      repo({
        findByHash: () => Promise.resolve(unconsumed()),
        consume: () => Promise.resolve(false),
      }),
      tokens,
      clock,
    );
    expect(await handler.execute({ userId, code: 'CODE' })).toBe(false);
  });
});
