import { type Clock } from '../../shared/kernel/clock';
import { UserId } from '../../shared/kernel/user-id';
import { type RecoveryCode } from '../domain/recovery-code';
import { type RecoveryCodesRepository } from '../domain/ports/recovery-codes-repository';
import { type TokenGenerator } from '../domain/ports/token-generator';
import { RecoveryCodeIssuer } from './recovery-code-issuer';

const now = new Date('2026-07-19T00:00:00.000Z');
const clock: Clock = { now: () => now };
const userId = UserId.generate();

const tokens: TokenGenerator = {
  generate: () => ({ raw: 'x', hash: 'x' }),
  hash: (raw) => `h:${raw}`,
};

class RecordingRecovery implements RecoveryCodesRepository {
  saved: RecoveryCode[] = [];
  replaceForUser(_userId: UserId, codes: RecoveryCode[]): Promise<void> {
    this.saved = codes;
    return Promise.resolve();
  }
  findByHash(): Promise<RecoveryCode | null> {
    return Promise.resolve(null);
  }
  consume(): Promise<boolean> {
    return Promise.resolve(true);
  }
  countActive(): Promise<number> {
    return Promise.resolve(this.saved.length);
  }
}

describe('RecoveryCodeIssuer', () => {
  it('mints a batch of formatted codes, stores their hashes and returns the plaintext once', async () => {
    const recovery = new RecordingRecovery();
    let id = 0;
    const issuer = new RecoveryCodeIssuer(
      recovery,
      tokens,
      clock,
      () => `rc-${(id += 1)}`,
      () => new Uint8Array(10).fill(5),
      3,
    );

    const plaintext = await issuer.issue(userId);

    expect(plaintext).toHaveLength(3);
    expect(plaintext[0]).toMatch(/^[2-9A-Z]{5}-[2-9A-Z]{5}$/);
    expect(recovery.saved).toHaveLength(3);
    expect(recovery.saved[0]?.codeHash).toBe(`h:${plaintext[0]}`);
    expect(recovery.saved[0]?.isConsumed()).toBe(false);
  });

  it('defaults to a batch of ten', async () => {
    const recovery = new RecordingRecovery();
    await new RecoveryCodeIssuer(recovery, tokens, clock).issue(userId);
    expect(recovery.saved).toHaveLength(10);
  });
});
