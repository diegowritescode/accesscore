import * as argon2 from 'argon2';
import { type Hasher } from '../../domain/ports/hasher';
import { type Password } from '../../domain/value-objects/password';
import { PasswordHash } from '../../domain/value-objects/password-hash';

const OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

export class Argon2Hasher implements Hasher {
  private readonly decoy: Promise<string>;

  constructor() {
    this.decoy = argon2.hash('decoy-secret-for-constant-time-verification', OPTIONS);
  }

  async hash(password: Password): Promise<PasswordHash> {
    const encoded = await argon2.hash(password.value, OPTIONS);
    return PasswordHash.fromEncoded(encoded);
  }

  async verify(password: Password, hash: PasswordHash): Promise<boolean> {
    return argon2.verify(hash.value, password.value);
  }

  async dummyVerify(password: Password): Promise<void> {
    const decoy = await this.decoy;
    await argon2.verify(decoy, password.value).catch(() => false);
  }
}
