import { randomUUID } from 'node:crypto';
import { type Clock } from '../../shared/kernel/clock';
import { type UserId } from '../../shared/kernel/user-id';
import { err, ok, type Result } from '../../shared/result';
import { MfaCredential } from '../domain/mfa-credential';
import { type MfaCredentialsRepository } from '../domain/ports/mfa-credentials-repository';
import { type SecretEncryptor } from '../domain/ports/secret-encryptor';
import { TotpSecret } from '../domain/value-objects/totp-secret';
import { type UsersRepository } from '../domain/ports/users-repository';

export interface EnrollMfaInput {
  userId: UserId;
}

export type EnrollMfaError = 'user_not_found';

export interface EnrollMfaResult {
  otpauthUri: string;
}

export class EnrollMfaHandler {
  constructor(
    private readonly users: UsersRepository,
    private readonly credentials: MfaCredentialsRepository,
    private readonly encryptor: SecretEncryptor,
    private readonly clock: Clock,
    private readonly issuer: string,
    private readonly newId: () => string = randomUUID,
    private readonly newSecret: () => TotpSecret = () => TotpSecret.generate(),
  ) {}

  async execute(input: EnrollMfaInput): Promise<Result<EnrollMfaResult, EnrollMfaError>> {
    const user = await this.users.findById(input.userId);
    if (!user) {
      return err('user_not_found');
    }

    const now = this.clock.now();
    const superseded = await this.credentials.findPendingTotpByUser(input.userId);
    if (superseded) {
      superseded.revoke(now);
      await this.credentials.save(superseded);
    }

    const secret = this.newSecret();
    const secretCiphertext = await this.encryptor.encrypt(secret.bytes);
    const credential = MfaCredential.enroll({
      id: this.newId(),
      userId: input.userId,
      secretCiphertext,
      now,
    });
    await this.credentials.save(credential);

    return ok({
      otpauthUri: secret.toOtpauthUri({ issuer: this.issuer, account: user.email.value }),
    });
  }
}

export const ENROLL_MFA_HANDLER = Symbol('ENROLL_MFA_HANDLER');
