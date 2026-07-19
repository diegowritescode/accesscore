import { type DomainEvent } from '../../shared/domain-event';
import { type UserId } from '../../shared/kernel/user-id';

export type MfaType = 'totp';
export type MfaStatus = 'pending' | 'active' | 'revoked';

export interface MfaCredentialProps {
  id: string;
  userId: UserId;
  type: MfaType;
  status: MfaStatus;
  secretCiphertext: string;
  algorithm: string;
  digits: number;
  period: number;
  lastUsedStep: number | null;
  createdAt: Date;
  activatedAt: Date | null;
  revokedAt: Date | null;
}

export interface EnrollMfaInput {
  id: string;
  userId: UserId;
  secretCiphertext: string;
  now: Date;
  algorithm?: string;
  digits?: number;
  period?: number;
}

export class MfaCredential {
  private readonly domainEvents: DomainEvent[] = [];

  private constructor(private readonly props: MfaCredentialProps) {}

  static enroll(input: EnrollMfaInput): MfaCredential {
    const credential = new MfaCredential({
      id: input.id,
      userId: input.userId,
      type: 'totp',
      status: 'pending',
      secretCiphertext: input.secretCiphertext,
      algorithm: input.algorithm ?? 'SHA1',
      digits: input.digits ?? 6,
      period: input.period ?? 30,
      lastUsedStep: null,
      createdAt: input.now,
      activatedAt: null,
      revokedAt: null,
    });
    credential.domainEvents.push({
      type: 'identity.mfa_enrolled',
      occurredAt: input.now,
      aggregateId: input.userId.value,
      payload: { credentialId: input.id, type: 'totp' },
    });
    return credential;
  }

  static reconstitute(props: MfaCredentialProps): MfaCredential {
    return new MfaCredential(props);
  }

  activate(now: Date): void {
    if (this.props.status !== 'pending') {
      throw new Error(`cannot activate an MFA credential in status ${this.props.status}`);
    }
    this.props.status = 'active';
    this.props.activatedAt = now;
    this.domainEvents.push({
      type: 'identity.mfa_activated',
      occurredAt: now,
      aggregateId: this.props.userId.value,
      payload: { credentialId: this.props.id },
    });
  }

  registerUse(step: number): void {
    if (this.props.status !== 'active') {
      throw new Error(`cannot use an MFA credential in status ${this.props.status}`);
    }
    if (this.props.lastUsedStep !== null && step <= this.props.lastUsedStep) {
      throw new Error('TOTP step replay rejected');
    }
    this.props.lastUsedStep = step;
  }

  revoke(now: Date): void {
    if (this.props.status === 'revoked') {
      return;
    }
    this.props.status = 'revoked';
    this.props.revokedAt = now;
    this.domainEvents.push({
      type: 'identity.mfa_revoked',
      occurredAt: now,
      aggregateId: this.props.userId.value,
      payload: { credentialId: this.props.id },
    });
  }

  get id(): string {
    return this.props.id;
  }

  get userId(): UserId {
    return this.props.userId;
  }

  get type(): MfaType {
    return this.props.type;
  }

  get status(): MfaStatus {
    return this.props.status;
  }

  get secretCiphertext(): string {
    return this.props.secretCiphertext;
  }

  get algorithm(): string {
    return this.props.algorithm;
  }

  get digits(): number {
    return this.props.digits;
  }

  get period(): number {
    return this.props.period;
  }

  get lastUsedStep(): number | null {
    return this.props.lastUsedStep;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get activatedAt(): Date | null {
    return this.props.activatedAt;
  }

  get revokedAt(): Date | null {
    return this.props.revokedAt;
  }

  pullEvents(): DomainEvent[] {
    const drained = [...this.domainEvents];
    this.domainEvents.length = 0;
    return drained;
  }
}
