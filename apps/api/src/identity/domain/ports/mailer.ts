import { type Email } from '../value-objects/email';

export interface Mailer {
  sendEmailVerification(email: Email, token: string): Promise<void>;
}

export const MAILER = Symbol('MAILER');
