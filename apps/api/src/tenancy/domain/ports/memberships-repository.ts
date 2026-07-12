import { type UserId } from '../../../shared/kernel/user-id';
import { type Tx } from '../../../shared/persistence/unit-of-work';
import { type Membership } from '../membership';

export interface MembershipsRepository {
  create(membership: Membership, tx?: Tx): Promise<void>;
  findActiveByUser(userId: UserId): Promise<Membership[]>;
}

export const MEMBERSHIPS_REPOSITORY = Symbol('MEMBERSHIPS_REPOSITORY');
