import { Module } from '@nestjs/common';
import { DB, type Database } from '../db/db.module';
import { CLOCK, type Clock } from '../shared/kernel/clock';
import { SystemClock } from '../shared/kernel/system-clock';
import { UNIT_OF_WORK, type UnitOfWork } from '../shared/persistence/unit-of-work';
import { TENANCY_SERVICE, TenancyService } from './application/tenancy-service';
import {
  MEMBERSHIPS_REPOSITORY,
  type MembershipsRepository,
} from './domain/ports/memberships-repository';
import { ORG_ROLE_READER } from './domain/ports/org-role-reader';
import {
  ORGANIZATIONS_REPOSITORY,
  type OrganizationsRepository,
} from './domain/ports/organizations-repository';
import { DrizzleMembershipsRepository } from './infrastructure/persistence/drizzle-memberships.repository';
import { DrizzleOrganizationsRepository } from './infrastructure/persistence/drizzle-organizations.repository';

@Module({
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    {
      provide: ORGANIZATIONS_REPOSITORY,
      inject: [DB],
      useFactory: (db: Database): DrizzleOrganizationsRepository =>
        new DrizzleOrganizationsRepository(db),
    },
    {
      provide: MEMBERSHIPS_REPOSITORY,
      inject: [DB],
      useFactory: (db: Database): DrizzleMembershipsRepository =>
        new DrizzleMembershipsRepository(db),
    },
    {
      provide: TENANCY_SERVICE,
      inject: [ORGANIZATIONS_REPOSITORY, MEMBERSHIPS_REPOSITORY, UNIT_OF_WORK, CLOCK],
      useFactory: (
        organizations: OrganizationsRepository,
        memberships: MembershipsRepository,
        unitOfWork: UnitOfWork,
        clock: Clock,
      ): TenancyService => new TenancyService(organizations, memberships, unitOfWork, clock),
    },
    { provide: ORG_ROLE_READER, useExisting: MEMBERSHIPS_REPOSITORY },
  ],
  exports: [TENANCY_SERVICE, ORGANIZATIONS_REPOSITORY, MEMBERSHIPS_REPOSITORY, ORG_ROLE_READER],
})
export class TenancyModule {}
