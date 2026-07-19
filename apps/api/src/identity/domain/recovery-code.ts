import { type UserId } from '../../shared/kernel/user-id';

export interface RecoveryCodeProps {
  id: string;
  userId: UserId;
  codeHash: string;
  consumedAt: Date | null;
  createdAt: Date;
}

export interface IssueRecoveryCodeInput {
  id: string;
  userId: UserId;
  codeHash: string;
  now: Date;
}

export class RecoveryCode {
  private constructor(private readonly props: RecoveryCodeProps) {}

  static issue(input: IssueRecoveryCodeInput): RecoveryCode {
    return new RecoveryCode({
      id: input.id,
      userId: input.userId,
      codeHash: input.codeHash,
      consumedAt: null,
      createdAt: input.now,
    });
  }

  static reconstitute(props: RecoveryCodeProps): RecoveryCode {
    return new RecoveryCode(props);
  }

  isConsumed(): boolean {
    return this.props.consumedAt !== null;
  }

  consume(now: Date): void {
    if (this.props.consumedAt !== null) {
      throw new Error('recovery code already consumed');
    }
    this.props.consumedAt = now;
  }

  get id(): string {
    return this.props.id;
  }

  get userId(): UserId {
    return this.props.userId;
  }

  get codeHash(): string {
    return this.props.codeHash;
  }

  get consumedAt(): Date | null {
    return this.props.consumedAt;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }
}
