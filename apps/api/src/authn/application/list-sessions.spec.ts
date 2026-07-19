import { UserId } from '../../shared/kernel/user-id';
import { type SessionsRepository } from '../domain/ports/sessions-repository';
import { type Session } from '../domain/session';
import { SessionId } from '../domain/value-objects/session-id';
import { ListSessionsHandler } from './list-sessions';

const now = new Date('2026-07-12T12:00:00.000Z');
const userId = UserId.fromString('user-1');

const session = (id: string): Session => ({
  id: SessionId.fromString(id),
  userId,
  orgId: null,
  aal: 1,
  authTime: now,
  status: 'active',
  deviceLabel: 'iPhone 15',
  userAgent: 'AccessCore/1.0',
  ip: '203.0.113.7',
  createdAt: now,
  lastSeenAt: now,
  expiresAt: new Date(now.getTime() + 1000),
  revokedAt: null,
});

const sessionsRepo = (active: Session[]): SessionsRepository => ({
  create: () => Promise.resolve(),
  findById: () => Promise.resolve(null),
  listActiveByUser: () => Promise.resolve(active),
  touch: () => Promise.resolve(),
  elevate: () => Promise.resolve(true),
  revoke: () => Promise.resolve(),
  revokeAllForUser: () => Promise.resolve([]),
});

describe('ListSessionsHandler', () => {
  it('maps the caller active sessions to views and flags the current one', async () => {
    const handler = new ListSessionsHandler(sessionsRepo([session('sid-1'), session('sid-2')]));

    const views = await handler.execute('user-1', 'sid-2');

    expect(views.map((view) => view.id)).toEqual(['sid-1', 'sid-2']);
    expect(views.find((view) => view.id === 'sid-2')?.current).toBe(true);
    expect(views.find((view) => view.id === 'sid-1')?.current).toBe(false);
    expect(views[0]?.deviceLabel).toBe('iPhone 15');
    expect(views[0]?.createdAt).toBe(now.toISOString());
  });
});
