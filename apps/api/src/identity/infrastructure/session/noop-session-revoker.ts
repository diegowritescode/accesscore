import { Logger } from '@nestjs/common';
import { type SessionRevoker } from '../../domain/ports/session-revoker';
import { type UserId } from '../../domain/value-objects/user-id';

export class NoopSessionRevoker implements SessionRevoker {
  private readonly logger = new Logger('SessionRevoker');

  async revokeAllForUser(userId: UserId): Promise<void> {
    this.logger.log(`session revocation requested for ${userId.value} (no-op until Slice 2)`);
  }
}
