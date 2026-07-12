import { type SessionRevoker } from '../../../identity/domain/ports/session-revoker';
import { type UserId } from '../../../shared/kernel/user-id';
import { type SessionTerminator } from '../../application/session-terminator';

export class AuthnSessionRevoker implements SessionRevoker {
  constructor(private readonly terminator: SessionTerminator) {}

  async revokeAllForUser(userId: UserId): Promise<void> {
    await this.terminator.terminateAllForUser(userId);
  }
}
