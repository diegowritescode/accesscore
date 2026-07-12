import { type UserId } from '../../identity/domain/value-objects/user-id';
import { type Clock } from '../domain/ports/clock';
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
    private readonly clock: Clock,
    private readonly config: SessionTerminatorConfig,
  ) {}

  async terminateSession(sessionId: string, accessTokenExpiresAt: number): Promise<void> {
    const at = this.clock.now();
    const sid = SessionId.fromString(sessionId);
    await this.tokenFamilies.revokeBySession(sid, 'logout', at);
    await this.sessions.revoke(sid, at);
    await this.revocation.revoke(
      `sid:${sessionId}`,
      accessTokenExpiresAt - Math.floor(at.getTime() / 1000),
    );
  }

  async terminateAllForUser(userId: UserId): Promise<void> {
    const at = this.clock.now();
    await this.tokenFamilies.revokeAllForUser(userId, 'logout_all', at);
    const sids = await this.sessions.revokeAllForUser(userId, at);
    await Promise.all(
      sids.map((sid) => this.revocation.revoke(`sid:${sid}`, this.config.accessTokenTtlSeconds)),
    );
  }
}
