import { UserId } from '../../identity/domain/value-objects/user-id';
import { type Clock } from '../domain/ports/clock';
import { type RevocationStore } from '../domain/ports/revocation-store';
import { type SessionsRepository } from '../domain/ports/sessions-repository';
import { type TokenFamiliesRepository } from '../domain/ports/token-families-repository';
import { SessionId } from '../domain/value-objects/session-id';
import { SessionTerminator } from './session-terminator';

const now = new Date('2026-07-12T12:00:00.000Z');
const nowSec = Math.floor(now.getTime() / 1000);
const clock: Clock = { now: () => now };

class FakeSessions implements SessionsRepository {
  readonly revoked: string[] = [];
  revokeAllSids: string[] = [];
  create(): Promise<void> {
    return Promise.resolve();
  }
  findById(): Promise<null> {
    return Promise.resolve(null);
  }
  revoke(id: SessionId): Promise<void> {
    this.revoked.push(id.value);
    return Promise.resolve();
  }
  revokeAllForUser(): Promise<string[]> {
    return Promise.resolve(this.revokeAllSids);
  }
}

class FakeFamilies implements TokenFamiliesRepository {
  readonly bySession: string[] = [];
  allForUserCalls = 0;
  create(): Promise<void> {
    return Promise.resolve();
  }
  findById(): Promise<null> {
    return Promise.resolve(null);
  }
  revoke(): Promise<void> {
    return Promise.resolve();
  }
  revokeForReuse(): Promise<void> {
    return Promise.resolve();
  }
  revokeBySession(sessionId: SessionId): Promise<void> {
    this.bySession.push(sessionId.value);
    return Promise.resolve();
  }
  revokeAllForUser(): Promise<void> {
    this.allForUserCalls += 1;
    return Promise.resolve();
  }
}

class FakeRevocation implements RevocationStore {
  readonly blocked: { subject: string; ttl: number }[] = [];
  revoke(subject: string, ttlSeconds: number): Promise<void> {
    this.blocked.push({ subject, ttl: ttlSeconds });
    return Promise.resolve();
  }
  isRevoked(): Promise<boolean> {
    return Promise.resolve(false);
  }
}

const setup = () => {
  const sessions = new FakeSessions();
  const families = new FakeFamilies();
  const revocation = new FakeRevocation();
  const terminator = new SessionTerminator(sessions, families, revocation, clock, {
    accessTokenTtlSeconds: 900,
  });
  return { sessions, families, revocation, terminator };
};

describe('SessionTerminator', () => {
  it('terminateSession revokes the session family, the session, and blocklists the sid', async () => {
    const { sessions, families, revocation, terminator } = setup();

    await terminator.terminateSession('session-1', nowSec + 300);

    expect(families.bySession).toEqual(['session-1']);
    expect(sessions.revoked).toEqual(['session-1']);
    expect(revocation.blocked).toEqual([{ subject: 'sid:session-1', ttl: 300 }]);
  });

  it('terminateAllForUser revokes all families and sessions and blocklists every sid', async () => {
    const { sessions, families, revocation, terminator } = setup();
    sessions.revokeAllSids = ['session-1', 'session-2'];

    await terminator.terminateAllForUser(UserId.fromString('user-1'));

    expect(families.allForUserCalls).toBe(1);
    expect(revocation.blocked).toEqual([
      { subject: 'sid:session-1', ttl: 900 },
      { subject: 'sid:session-2', ttl: 900 },
    ]);
  });
});
