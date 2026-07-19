import { type Clock } from '../../shared/kernel/clock';
import { type UserId } from '../../shared/kernel/user-id';
import { err, ok, type Result } from '../../shared/result';
import { type MfaCredentialsRepository } from '../domain/ports/mfa-credentials-repository';

export interface DisableMfaInput {
  userId: UserId;
}

export type DisableMfaError = 'not_enabled';

export class DisableMfaHandler {
  constructor(
    private readonly credentials: MfaCredentialsRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: DisableMfaInput): Promise<Result<void, DisableMfaError>> {
    const active = await this.credentials.findActiveTotpByUser(input.userId);
    if (!active) {
      return err('not_enabled');
    }
    active.revoke(this.clock.now());
    await this.credentials.save(active);
    return ok(undefined);
  }
}

export const DISABLE_MFA_HANDLER = Symbol('DISABLE_MFA_HANDLER');
