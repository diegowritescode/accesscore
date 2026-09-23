import { DemoAccountPolicy } from './demo-account';
import { type Clock } from '../../shared/kernel/clock';
import { UserId } from '../../shared/kernel/user-id';
import { type UsersRepository } from '../domain/ports/users-repository';
import { User } from '../domain/user';
import { Email } from '../domain/value-objects/email';
import { PasswordHash } from '../domain/value-objects/password-hash';

const DEMO_EMAIL = 'demo@accesscore.dev';

const userWith = (address: string): User => {
  const email = Email.create(address);
  if (!email.ok) throw new Error('invalid fixture email');
  return User.register({
    id: UserId.generate(),
    email: email.value,
    passwordHash: PasswordHash.fromEncoded('$argon2id$hash'),
    now: new Date('2026-01-01T00:00:00.000Z'),
  });
};

const buildDeps = (demo: User | null) => {
  let now = new Date('2026-01-01T00:00:00.000Z');
  const clock: Clock = { now: () => now };
  const users = {
    save: jest.fn(),
    findById: jest.fn(),
    findByEmail: jest.fn().mockResolvedValue(demo),
  } satisfies UsersRepository;
  const advance = (ms: number) => {
    now = new Date(now.getTime() + ms);
  };
  return { clock, users, advance };
};

describe('DemoAccountPolicy', () => {
  it('recognizes the configured demo account and nobody else', async () => {
    const demo = userWith(DEMO_EMAIL);
    const { clock, users } = buildDeps(demo);
    const policy = new DemoAccountPolicy(users, clock, DEMO_EMAIL);

    expect(await policy.isDemoAccount(demo.id.value)).toBe(true);
    expect(await policy.isDemoAccount(UserId.generate().value)).toBe(false);
  });

  it('is inert when no demo account is configured', async () => {
    const { clock, users } = buildDeps(userWith(DEMO_EMAIL));
    const policy = new DemoAccountPolicy(users, clock, undefined);

    expect(await policy.isDemoAccount(UserId.generate().value)).toBe(false);
    expect(users.findByEmail).not.toHaveBeenCalled();
  });

  it('treats everyone as a regular account while the demo user does not exist yet', async () => {
    const { clock, users } = buildDeps(null);
    const policy = new DemoAccountPolicy(users, clock, DEMO_EMAIL);

    expect(await policy.isDemoAccount(UserId.generate().value)).toBe(false);
  });

  it('caches the resolution and re-resolves after the TTL so a reseeded demo user is picked up', async () => {
    const first = userWith(DEMO_EMAIL);
    const reseeded = userWith(DEMO_EMAIL);
    const { clock, users, advance } = buildDeps(first);
    const policy = new DemoAccountPolicy(users, clock, DEMO_EMAIL);

    expect(await policy.isDemoAccount(first.id.value)).toBe(true);
    users.findByEmail.mockResolvedValue(reseeded);
    advance(30_000);
    expect(await policy.isDemoAccount(first.id.value)).toBe(true);
    expect(users.findByEmail).toHaveBeenCalledTimes(1);

    advance(31_000);
    expect(await policy.isDemoAccount(reseeded.id.value)).toBe(true);
    expect(await policy.isDemoAccount(first.id.value)).toBe(false);
    expect(users.findByEmail).toHaveBeenCalledTimes(2);
  });
});
