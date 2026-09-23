import { type Clock } from '../../shared/kernel/clock';
import { type UsersRepository } from '../domain/ports/users-repository';
import { Email } from '../domain/value-objects/email';

const RESOLUTION_TTL_MS = 60_000;

export class DemoAccountPolicy {
  private resolution: { userId: string | null; resolvedAt: number } | null = null;

  constructor(
    private readonly users: UsersRepository,
    private readonly clock: Clock,
    private readonly demoEmail: string | undefined,
  ) {}

  async isDemoAccount(userId: string): Promise<boolean> {
    if (!this.demoEmail) {
      return false;
    }
    return (await this.demoUserId(this.demoEmail)) === userId;
  }

  private async demoUserId(address: string): Promise<string | null> {
    const now = this.clock.now().getTime();
    if (this.resolution && now - this.resolution.resolvedAt < RESOLUTION_TTL_MS) {
      return this.resolution.userId;
    }
    const email = Email.create(address);
    const user = email.ok ? await this.users.findByEmail(email.value) : null;
    this.resolution = { userId: user?.id.value ?? null, resolvedAt: now };
    return this.resolution.userId;
  }
}

export const DEMO_ACCOUNT_POLICY = Symbol('DEMO_ACCOUNT_POLICY');
