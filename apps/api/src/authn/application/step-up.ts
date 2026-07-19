import { type Clock } from '../../shared/kernel/clock';
import { err, ok, type Result } from '../../shared/result';
import { type AccessTokenIssuer } from '../domain/ports/access-token-issuer';
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

export type StepUpError = 'invalid_session' | 'invalid_factor';

export class StepUpHandler {
  constructor(
    private readonly sessions: SessionsRepository,
    private readonly secondFactor: SecondFactor,
    private readonly accessTokens: AccessTokenIssuer,
    private readonly clock: Clock,
  ) {}

  async execute(command: StepUpCommand): Promise<Result<StepUpResult, StepUpError>> {
    const session = await this.sessions.findById(SessionId.fromString(command.sessionId));
    if (!session || session.status !== 'active' || session.userId.value !== command.userId) {
      return err('invalid_session');
    }

    const verified = await this.secondFactor.verify(session.userId, command.proof);
    if (!verified) {
      return err('invalid_factor');
    }

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
