import { type Password } from '../value-objects/password';
import { type PasswordHash } from '../value-objects/password-hash';

export interface Hasher {
  hash(password: Password): Promise<PasswordHash>;
  verify(password: Password, hash: PasswordHash): Promise<boolean>;
  dummyVerify(password: Password): Promise<void>;
}

export const HASHER = Symbol('HASHER');
