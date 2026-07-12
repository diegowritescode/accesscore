import { type UserId } from './value-objects/user-id';

export interface EmailVerificationTokenProps {
  id: string;
  userId: UserId;
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}

export interface IssueTokenInput {
  id: string;
  userId: UserId;
  tokenHash: string;
  now: Date;
  ttlMinutes: number;
}

export class EmailVerificationToken {
  private constructor(private readonly props: EmailVerificationTokenProps) {}

  static issue(input: IssueTokenInput): EmailVerificationToken {
    return new EmailVerificationToken({
      id: input.id,
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: new Date(input.now.getTime() + input.ttlMinutes * 60_000),
      consumedAt: null,
      createdAt: input.now,
    });
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
