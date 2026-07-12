import { type UserId } from '../../shared/kernel/user-id';
import { type UnitOfWork } from '../../shared/persistence/unit-of-work';
import { type Clock } from '../../shared/kernel/clock';
import { type RevocationStore } from '../domain/ports/revocation-store';
import { type SessionsRepository } from '../domain/ports/sessions-repository';
import { type TokenFamiliesRepository } from '../domain/ports/token-families-repository';
import { SessionId } from '../domain/value-objects/session-id';

export interface SessionTerminatorConfig {
  accessTokenTtlSeconds: number;
}

export const SESSION_TERMINATOR = Symbol('SESSION_TERMINATOR');

export class SessionTerminator {
  constructor(
    private readonly sessions: SessionsRepository,
    private readonly tokenFamilies: TokenFamiliesRepository,
    private readonly revocation: RevocationStore,
    private readonly unitOfWork: UnitOfWork,
    private readonly clock: Clock,
    private readonly config: SessionTerminatorConfig,
  ) {}

  async terminateSession(sessionId: string, accessTokenExpiresAt: number): Promise<void> {
    const at = this.clock.now();
    const sid = SessionId.fromString(sessionId);
    await this.unitOfWork.withTransaction(async (tx) => {
      await this.tokenFamilies.revokeBySession(sid, 'logout', at, tx);
      await this.sessions.revoke(sid, at, tx);
    });
    await this.revocation.revoke(
      `sid:${sessionId}`,
      accessTokenExpiresAt - Math.floor(at.getTime() / 1000),
    );
  }

  async terminateSessionById(sessionId: string): Promise<void> {
    const at = this.clock.now();
    const sid = SessionId.fromString(sessionId);
    await this.unitOfWork.withTransaction(async (tx) => {
      await this.tokenFamilies.revokeBySession(sid, 'session_revoked', at, tx);
      await this.sessions.revoke(sid, at, tx);
    });
    await this.revocation.revoke(`sid:${sessionId}`, this.config.accessTokenTtlSeconds);
  }

  async terminateAllForUser(userId: UserId): Promise<void> {
    const at = this.clock.now();
    const sids = await this.unitOfWork.withTransaction(async (tx) => {
      await this.tokenFamilies.revokeAllForUser(userId, 'logout_all', at, tx);
      return this.sessions.revokeAllForUser(userId, at, tx);
    });
    await Promise.all(
      sids.map((sid) => this.revocation.revoke(`sid:${sid}`, this.config.accessTokenTtlSeconds)),
    );
  }
}
