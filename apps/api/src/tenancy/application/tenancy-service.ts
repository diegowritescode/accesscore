import { randomUUID } from 'node:crypto';
import { type Clock } from '../../shared/kernel/clock';
import { OrgId } from '../../shared/kernel/org-id';
import { type UserId } from '../../shared/kernel/user-id';
import { type UnitOfWork } from '../../shared/persistence/unit-of-work';
import { Organization } from '../domain/organization';
import { type MembershipsRepository } from '../domain/ports/memberships-repository';
import { type OrganizationsRepository } from '../domain/ports/organizations-repository';

export const TENANCY_SERVICE = Symbol('TENANCY_SERVICE');

export class TenancyService {
  constructor(
    private readonly organizations: OrganizationsRepository,
    private readonly memberships: MembershipsRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  async provisionPersonalOrganization(userId: UserId): Promise<OrgId> {
    const now = this.clock.now();
    const orgId = OrgId.generate();
    const organization = Organization.create({
      id: orgId,
      name: 'Personal',
      slug: `u-${userId.value}`,
      now,
    });
    await this.unitOfWork.withTransaction(async (tx) => {
      await this.organizations.create(organization, tx);
      await this.memberships.create(
        { id: randomUUID(), userId, orgId, status: 'active', role: 'owner', joinedAt: now },
        tx,
      );
    });
    return orgId;
  }

  async findActiveOrganization(userId: UserId): Promise<OrgId | null> {
    const memberships = await this.memberships.findActiveByUser(userId);
    return memberships[0]?.orgId ?? null;
  }
}
