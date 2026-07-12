import { type UserId } from '../../shared/kernel/user-id';

export interface PasswordResetTokenProps {
  id: string;
  userId: UserId;
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}

export interface IssuePasswordResetTokenInput {
  id: string;
  userId: UserId;
  tokenHash: string;
  now: Date;
  ttlMinutes: number;
}

export class PasswordResetToken {
  private constructor(private readonly props: PasswordResetTokenProps) {}

  static issue(input: IssuePasswordResetTokenInput): PasswordResetToken {
    return new PasswordResetToken({
      id: input.id,
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: new Date(input.now.getTime() + input.ttlMinutes * 60_000),
      consumedAt: null,
      createdAt: input.now,
    });
  }

  static reconstitute(props: PasswordResetTokenProps): PasswordResetToken {
    return new PasswordResetToken(props);
  }

  isExpired(now: Date): boolean {
    return this.props.expiresAt.getTime() <= now.getTime();
  }

  isConsumed(): boolean {
    return this.props.consumedAt !== null;
  }

  consume(now: Date): void {
    this.props.consumedAt = now;
  }

  get id(): string {
    return this.props.id;
  }

  get userId(): UserId {
    return this.props.userId;
  }

  get tokenHash(): string {
    return this.props.tokenHash;
  }

  get expiresAt(): Date {
    return this.props.expiresAt;
  }

  get consumedAt(): Date | null {
    return this.props.consumedAt;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }
}
