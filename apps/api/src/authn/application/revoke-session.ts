import { err, ok, type Result } from '../../shared/result';
import { type SessionsRepository } from '../domain/ports/sessions-repository';
import { SessionId } from '../domain/value-objects/session-id';
import { type SessionTerminator } from './session-terminator';

export interface RevokeSessionCommand {
  callerUserId: string;
  sessionId: string;
}

export type RevokeSessionError = 'not_found';

export const REVOKE_SESSION_HANDLER = Symbol('REVOKE_SESSION_HANDLER');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class RevokeSessionHandler {
  constructor(
    private readonly sessions: SessionsRepository,
    private readonly terminator: SessionTerminator,
  ) {}

  async execute(command: RevokeSessionCommand): Promise<Result<void, RevokeSessionError>> {
    if (!UUID.test(command.sessionId)) {
      return err('not_found');
    }

    const session = await this.sessions.findById(SessionId.fromString(command.sessionId));
    if (!session || session.userId.value !== command.callerUserId) {
      return err('not_found');
    }

    await this.terminator.terminateSessionById(command.sessionId);
    return ok(undefined);
  }
}
