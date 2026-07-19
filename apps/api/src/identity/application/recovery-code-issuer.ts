import { randomBytes, randomUUID } from 'node:crypto';
import { type Clock } from '../../shared/kernel/clock';
import { type UserId } from '../../shared/kernel/user-id';
import { type RecoveryCodesRepository } from '../domain/ports/recovery-codes-repository';
import { type TokenGenerator } from '../domain/ports/token-generator';
import { RecoveryCode } from '../domain/recovery-code';

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const CODE_LENGTH = 10;
const BATCH_SIZE = 10;

export type RandomBytes = (size: number) => Uint8Array;
export type IdFactory = () => string;

function mintCode(random: RandomBytes): string {
  const bytes = random(CODE_LENGTH);
  let body = '';
  for (let index = 0; index < CODE_LENGTH; index += 1) {
    body += ALPHABET[(bytes[index] ?? 0) % ALPHABET.length];
  }
  return `${body.slice(0, 5)}-${body.slice(5)}`;
}

export class RecoveryCodeIssuer {
  constructor(
    private readonly recovery: RecoveryCodesRepository,
    private readonly tokens: TokenGenerator,
    private readonly clock: Clock,
    private readonly newId: IdFactory = randomUUID,
    private readonly random: RandomBytes = randomBytes,
    private readonly size: number = BATCH_SIZE,
  ) {}

  async issue(userId: UserId): Promise<string[]> {
    const now = this.clock.now();
    const plaintext = Array.from({ length: this.size }, () => mintCode(this.random));
    const codes = plaintext.map((raw) =>
      RecoveryCode.issue({ id: this.newId(), userId, codeHash: this.tokens.hash(raw), now }),
    );
    await this.recovery.replaceForUser(userId, codes);
    return plaintext;
  }
}

export const RECOVERY_CODE_ISSUER = Symbol('RECOVERY_CODE_ISSUER');
