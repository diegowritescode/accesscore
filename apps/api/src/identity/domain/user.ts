import { type DomainEvent } from '../../shared/domain-event';
import { type Email } from './value-objects/email';
import { type PasswordHash } from './value-objects/password-hash';
import { type UserId } from '../../shared/kernel/user-id';

export type UserStatus = 'pending_verification' | 'active' | 'suspended';

export interface UserProps {
  id: UserId;
  email: Email;
  passwordHash: PasswordHash;
  status: UserStatus;
  emailVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RegisterUserInput {
  id: UserId;
  email: Email;
  passwordHash: PasswordHash;
  now: Date;
}

export class User {
  private readonly domainEvents: DomainEvent[] = [];

  private constructor(private readonly props: UserProps) {}

  static register(input: RegisterUserInput): User {
    const user = new User({
      id: input.id,
      email: input.email,
      passwordHash: input.passwordHash,
      status: 'pending_verification',
      emailVerifiedAt: null,
      createdAt: input.now,
      updatedAt: input.now,
    });
    user.domainEvents.push({
      type: 'identity.user_registered',
      occurredAt: input.now,
      aggregateId: input.id.value,
      payload: { email: input.email.value },
    });
    return user;
  }

  static reconstitute(props: UserProps): User {
    return new User(props);
  }

  get id(): UserId {
    return this.props.id;
  }

  get email(): Email {
    return this.props.email;
  }

  get passwordHash(): PasswordHash {
    return this.props.passwordHash;
  }

  get status(): UserStatus {
    return this.props.status;
  }

  get emailVerifiedAt(): Date | null {
    return this.props.emailVerifiedAt;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  verifyEmail(now: Date): void {
    if (this.props.status === 'active') return;
    this.props.status = 'active';
    this.props.emailVerifiedAt = now;
    this.props.updatedAt = now;
    this.domainEvents.push({
      type: 'identity.email_verified',
      occurredAt: now,
      aggregateId: this.props.id.value,
      payload: {},
    });
  }

  changePassword(passwordHash: PasswordHash, now: Date): void {
    this.props.passwordHash = passwordHash;
    this.props.updatedAt = now;
    this.domainEvents.push({
      type: 'identity.password_changed',
      occurredAt: now,
      aggregateId: this.props.id.value,
      payload: {},
    });
  }

  pullEvents(): DomainEvent[] {
    const drained = [...this.domainEvents];
    this.domainEvents.length = 0;
    return drained;
  }
}
