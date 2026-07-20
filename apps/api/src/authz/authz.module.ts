import { Module } from '@nestjs/common';
import { AuthnModule } from '../authn/authn.module';
import { AccessTokenGuard } from '../authn/interface/access-token.guard';
import { MeteredDecisionLog } from '../observability/metered-decision-log';
import { MetricsModule } from '../observability/metrics.module';
import { MetricsService } from '../observability/metrics.service';
import { SecurityModule } from '../security/security.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { DB, type Database } from '../db/db.module';
import { CLOCK, type Clock } from '../shared/kernel/clock';
import { SystemClock } from '../shared/kernel/system-clock';
import {
  REVISIONS_REPOSITORY,
  type RevisionsRepository,
} from '../shared/persistence/revisions-repository';
import { UNIT_OF_WORK, type UnitOfWork } from '../shared/persistence/unit-of-work';
import { AUTHZ_DIRECTORY, AuthzDirectoryService } from './application/directory-service';
import {
  NAMESPACE_CONFIG_WRITER,
  NamespaceConfigWriter,
} from './application/namespace-config-writer';
import { PdpService } from './application/pdp-service';
import { POLICY_WRITER, PolicyWriter } from './application/policy-writer';
import { RELATION_TUPLE_WRITER, RelationTupleWriter } from './application/relation-tuple-writer';
import { POLICY_DECISION_POINT } from './domain/policy-decision-point';
import { DECISION_LOG, type DecisionLog } from './domain/ports/decision-log';
import {
  NAMESPACE_DEFINITIONS_REPOSITORY,
  type NamespaceDefinitionsRepository,
} from './domain/ports/namespace-definitions-repository';
import { POLICIES_REPOSITORY, type PoliciesRepository } from './domain/ports/policies-repository';
import { RELATION_TUPLE_STORE, type RelationTupleStore } from './domain/ports/relation-tuple-store';
import { DrizzleDecisionLog } from './infrastructure/persistence/drizzle-decision-log';
import { DrizzleNamespaceDefinitionsRepository } from './infrastructure/persistence/drizzle-namespace-definitions.repository';
import { DrizzlePoliciesRepository } from './infrastructure/persistence/drizzle-policies.repository';
import { DrizzleRelationTupleStore } from './infrastructure/persistence/drizzle-relation-tuple.store';
import { AuthzController } from './interface/authz.controller';
import { DirectoryController } from './interface/directory.controller';
import { PapAdminGuard } from './interface/pap-admin.guard';
import { PapController } from './interface/pap.controller';
import { PermissionGuard } from './interface/permission.guard';

@Module({
  imports: [AuthnModule, TenancyModule, SecurityModule, MetricsModule],
  controllers: [AuthzController, PapController, DirectoryController],
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    AccessTokenGuard,
    PermissionGuard,
    PapAdminGuard,
    {
      provide: RELATION_TUPLE_STORE,
      inject: [DB],
      useFactory: (db: Database): DrizzleRelationTupleStore => new DrizzleRelationTupleStore(db),
    },
    {
      provide: RELATION_TUPLE_WRITER,
      inject: [RELATION_TUPLE_STORE, REVISIONS_REPOSITORY, UNIT_OF_WORK, CLOCK],
      useFactory: (
        tuples: RelationTupleStore,
        revisions: RevisionsRepository,
        unitOfWork: UnitOfWork,
        clock: Clock,
      ): RelationTupleWriter => new RelationTupleWriter(tuples, revisions, unitOfWork, clock),
    },
    {
      provide: NAMESPACE_DEFINITIONS_REPOSITORY,
      inject: [DB],
      useFactory: (db: Database): DrizzleNamespaceDefinitionsRepository =>
        new DrizzleNamespaceDefinitionsRepository(db),
    },
    {
      provide: NAMESPACE_CONFIG_WRITER,
      inject: [NAMESPACE_DEFINITIONS_REPOSITORY, REVISIONS_REPOSITORY, UNIT_OF_WORK, CLOCK],
      useFactory: (
        definitions: NamespaceDefinitionsRepository,
        revisions: RevisionsRepository,
        unitOfWork: UnitOfWork,
        clock: Clock,
      ): NamespaceConfigWriter =>
        new NamespaceConfigWriter(definitions, revisions, unitOfWork, clock),
    },
    {
      provide: POLICIES_REPOSITORY,
      inject: [DB],
      useFactory: (db: Database): DrizzlePoliciesRepository => new DrizzlePoliciesRepository(db),
    },
    {
      provide: AUTHZ_DIRECTORY,
      inject: [NAMESPACE_DEFINITIONS_REPOSITORY, RELATION_TUPLE_STORE, POLICIES_REPOSITORY],
      useFactory: (
        namespaces: NamespaceDefinitionsRepository,
        tuples: RelationTupleStore,
        policies: PoliciesRepository,
      ): AuthzDirectoryService => new AuthzDirectoryService(namespaces, tuples, policies),
    },
    {
      provide: POLICY_WRITER,
      inject: [POLICIES_REPOSITORY, REVISIONS_REPOSITORY, UNIT_OF_WORK],
      useFactory: (
        policies: PoliciesRepository,
        revisions: RevisionsRepository,
        unitOfWork: UnitOfWork,
      ): PolicyWriter => new PolicyWriter(policies, revisions, unitOfWork),
    },
    {
      provide: DECISION_LOG,
      inject: [DB, MetricsService],
      useFactory: (db: Database, metrics: MetricsService): DecisionLog =>
        new MeteredDecisionLog(new DrizzleDecisionLog(db), metrics),
    },
    {
      provide: POLICY_DECISION_POINT,
      inject: [
        NAMESPACE_DEFINITIONS_REPOSITORY,
        RELATION_TUPLE_STORE,
        POLICIES_REPOSITORY,
        REVISIONS_REPOSITORY,
        DECISION_LOG,
        UNIT_OF_WORK,
        CLOCK,
      ],
      useFactory: (
        namespaces: NamespaceDefinitionsRepository,
        tuples: RelationTupleStore,
        policies: PoliciesRepository,
        revisions: RevisionsRepository,
        decisionLog: DecisionLog,
        unitOfWork: UnitOfWork,
        clock: Clock,
      ): PdpService =>
        new PdpService(namespaces, tuples, policies, revisions, decisionLog, unitOfWork, clock),
    },
  ],
  exports: [
    POLICY_DECISION_POINT,
    RELATION_TUPLE_STORE,
    RELATION_TUPLE_WRITER,
    NAMESPACE_DEFINITIONS_REPOSITORY,
    NAMESPACE_CONFIG_WRITER,
    POLICIES_REPOSITORY,
    POLICY_WRITER,
    AUTHZ_DIRECTORY,
    DECISION_LOG,
  ],
})
export class AuthzModule {}
