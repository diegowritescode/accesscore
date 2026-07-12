import { Logger } from '@nestjs/common';
import { type Mailer } from '../../domain/ports/mailer';
import { type Email } from '../../domain/value-objects/email';

export class LogMailer implements Mailer {
  private readonly logger = new Logger('LogMailer');

  async sendEmailVerification(email: Email, _token: string): Promise<void> {
    this.logger.log(`email verification queued for ${email.value}`);
  }

  async sendPasswordReset(email: Email, _token: string): Promise<void> {
    this.logger.log(`password reset queued for ${email.value}`);
  }
}
