import { type Clock } from '../../shared/kernel/clock';
import { err, ok, type Result } from '../../shared/result';
import { type AccessTokenIssuer } from '../domain/ports/access-token-issuer';
import { type LockoutPolicy, type LockoutStore } from '../domain/ports/lockout-store';
import { type SecondFactor, type SecondFactorProof } from '../domain/ports/second-factor';
import { type SessionsRepository } from '../domain/ports/sessions-repository';
import { SessionId } from '../domain/value-objects/session-id';

const STEP_UP_AAL = 2;

export interface StepUpCommand {
  sessionId: string;
  userId: string;
  proof: SecondFactorProof;
}

export interface StepUpResult {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

export type StepUpError = 'invalid_session' | 'invalid_factor' | 'locked';

export class StepUpHandler {
  constructor(
    private readonly sessions: SessionsRepository,
    private readonly secondFactor: SecondFactor,
    private readonly accessTokens: AccessTokenIssuer,
    private readonly lockout: LockoutStore,
    private readonly clock: Clock,
    private readonly lockoutPolicy: LockoutPolicy,
  ) {}

  async execute(command: StepUpCommand): Promise<Result<StepUpResult, StepUpError>> {
    const session = await this.sessions.findById(SessionId.fromString(command.sessionId));
    if (!session || session.status !== 'active' || session.userId.value !== command.userId) {
      return err('invalid_session');
    }

    const lockoutKey = `mfa:${session.userId.value}`;
    if (await this.lockout.isLocked(lockoutKey, this.lockoutPolicy)) {
      return err('locked');
    }

    const verified = await this.secondFactor.verify(session.userId, command.proof);
    if (!verified) {
      await this.lockout.registerFailure(lockoutKey, this.lockoutPolicy);
      return err('invalid_factor');
    }
    await this.lockout.reset(lockoutKey);

    const now = this.clock.now();
    await this.sessions.elevate(session.id, STEP_UP_AAL, now);
    const token = await this.accessTokens.issue({
      sub: session.userId.value,
      sid: session.id.value,
      org: session.orgId?.value ?? null,
      aal: STEP_UP_AAL,
      authTime: now,
    });

    return ok({
      accessToken: token.token,
      tokenType: 'Bearer',
      expiresIn: token.expiresInSeconds,
    });
  }
}

export const STEP_UP_HANDLER = Symbol('STEP_UP_HANDLER');
