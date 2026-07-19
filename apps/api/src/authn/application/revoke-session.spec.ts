import { UserId } from '../../shared/kernel/user-id';
import { type SessionsRepository } from '../domain/ports/sessions-repository';
import { type Session } from '../domain/session';
import { SessionId } from '../domain/value-objects/session-id';
import { type SessionTerminator } from './session-terminator';
import { RevokeSessionHandler } from './revoke-session';

const now = new Date('2026-07-12T12:00:00.000Z');
const OWNED = '11111111-1111-1111-1111-111111111111';

const session = (id: string, ownerId: string): Session => ({
  id: SessionId.fromString(id),
  userId: UserId.fromString(ownerId),
  orgId: null,
  aal: 1,
  authTime: now,
  status: 'active',
  deviceLabel: null,
  userAgent: null,
  ip: null,
  createdAt: now,
  lastSeenAt: now,
  expiresAt: new Date(now.getTime() + 1000),
  revokedAt: null,
});

class FakeTerminator {
  readonly terminated: string[] = [];
  terminateSessionById(sessionId: string): Promise<void> {
    this.terminated.push(sessionId);
    return Promise.resolve();
  }
}

const setup = (found: Session | null) => {
  const sessions: SessionsRepository = {
    create: () => Promise.resolve(),
    findById: () => Promise.resolve(found),
    listActiveByUser: () => Promise.resolve([]),
    touch: () => Promise.resolve(),
    elevate: () => Promise.resolve(true),
    revoke: () => Promise.resolve(),
    revokeAllForUser: () => Promise.resolve([]),
  };
  const terminator = new FakeTerminator();
  const handler = new RevokeSessionHandler(sessions, terminator as unknown as SessionTerminator);
  return { handler, terminator };
};

describe('RevokeSessionHandler', () => {
  it('revokes a session the caller owns', async () => {
    const { handler, terminator } = setup(session(OWNED, 'user-1'));

    const result = await handler.execute({ callerUserId: 'user-1', sessionId: OWNED });

    expect(result.ok).toBe(true);
    expect(terminator.terminated).toEqual([OWNED]);
  });

  it('returns not_found for a session owned by another user (no cross-user enumeration)', async () => {
    const { handler, terminator } = setup(session(OWNED, 'user-2'));

    const result = await handler.execute({ callerUserId: 'user-1', sessionId: OWNED });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('not_found');
    expect(terminator.terminated).toHaveLength(0);
  });

  it('returns not_found for a missing session', async () => {
    const { handler } = setup(null);

    const result = await handler.execute({ callerUserId: 'user-1', sessionId: OWNED });

    expect(result.ok).toBe(false);
  });

  it('returns not_found for a malformed session id without touching the store', async () => {
    const { handler, terminator } = setup(session(OWNED, 'user-1'));

    const result = await handler.execute({ callerUserId: 'user-1', sessionId: 'not-a-uuid' });

    expect(result.ok).toBe(false);
    expect(terminator.terminated).toHaveLength(0);
  });
});
