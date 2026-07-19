import { type Hasher } from '../../../identity/domain/ports/hasher';
import { type MfaCredentialsRepository } from '../../../identity/domain/ports/mfa-credentials-repository';
import { type UsersRepository } from '../../../identity/domain/ports/users-repository';
import { Email } from '../../../identity/domain/value-objects/email';
import { Password } from '../../../identity/domain/value-objects/password';
import { type CredentialCheck, type Credentials } from '../../domain/ports/credentials';

export class IdentityCredentials implements Credentials {
  constructor(
    private readonly users: UsersRepository,
    private readonly hasher: Hasher,
    private readonly mfaCredentials: MfaCredentialsRepository,
  ) {}

  async verify(email: string, password: string): Promise<CredentialCheck | null> {
    const attempt = Password.forVerification(password);
    const emailResult = Email.create(email);
    if (!emailResult.ok) {
      await this.hasher.dummyVerify(attempt);
      return null;
    }

    const user = await this.users.findByEmail(emailResult.value);
    if (!user) {
      await this.hasher.dummyVerify(attempt);
      return null;
    }

    const matches = await this.hasher.verify(attempt, user.passwordHash);
    if (!matches || user.status !== 'active') {
      return null;
    }

    const mfaRequired = (await this.mfaCredentials.findActiveTotpByUser(user.id)) !== null;
    return { userId: user.id.value, aal: 1, mfaRequired };
  }
}
