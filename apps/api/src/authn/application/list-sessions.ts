import { UserId } from '../../shared/kernel/user-id';
import { type SessionsRepository } from '../domain/ports/sessions-repository';

export interface SessionView {
  id: string;
  deviceLabel: string | null;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}

export const LIST_SESSIONS_HANDLER = Symbol('LIST_SESSIONS_HANDLER');

export class ListSessionsHandler {
  constructor(private readonly sessions: SessionsRepository) {}

  async execute(userId: string, currentSessionId: string): Promise<SessionView[]> {
    const active = await this.sessions.listActiveByUser(UserId.fromString(userId));
    return active.map((session) => ({
      id: session.id.value,
      deviceLabel: session.deviceLabel,
      userAgent: session.userAgent,
      ip: session.ip,
      createdAt: session.createdAt.toISOString(),
      lastSeenAt: session.lastSeenAt.toISOString(),
      current: session.id.value === currentSessionId,
    }));
  }
}
