import { type User } from '../user';
import { type Email } from '../value-objects/email';
import { type UserId } from '../../../shared/kernel/user-id';

export interface UsersRepository {
  save(user: User): Promise<void>;
  findByEmail(email: Email): Promise<User | null>;
  findById(id: UserId): Promise<User | null>;
}

export const USERS_REPOSITORY = Symbol('USERS_REPOSITORY');
