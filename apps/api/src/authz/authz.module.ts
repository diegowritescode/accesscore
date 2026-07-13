import { Module } from '@nestjs/common';
import { AuthnModule } from '../authn/authn.module';
import { AccessTokenGuard } from '../authn/interface/access-token.guard';
import { DB, type Database } from '../db/db.module';
import { CLOCK, type Clock } from '../shared/kernel/clock';
import { SystemClock } from '../shared/kernel/system-clock';
import {
  REVISIONS_REPOSITORY,
  type RevisionsRepository,
} from '../shared/persistence/revisions-repository';
import { UNIT_OF_WORK, type UnitOfWork } from '../shared/persistence/unit-of-work';
import {
  NAMESPACE_CONFIG_WRITER,
  NamespaceConfigWriter,
} from './application/namespace-config-writer';
import { PdpService } from './application/pdp-service';
import { RELATION_TUPLE_WRITER, RelationTupleWriter } from './application/relation-tuple-writer';
import { POLICY_DECISION_POINT } from './domain/policy-decision-point';
import { DECISION_LOG, type DecisionLog } from './domain/ports/decision-log';
import {
  NAMESPACE_DEFINITIONS_REPOSITORY,
  type NamespaceDefinitionsRepository,
} from './domain/ports/namespace-definitions-repository';
import { RELATION_TUPLE_STORE, type RelationTupleStore } from './domain/ports/relation-tuple-store';
import { DrizzleDecisionLog } from './infrastructure/persistence/drizzle-decision-log';
import { DrizzleNamespaceDefinitionsRepository } from './infrastructure/persistence/drizzle-namespace-definitions.repository';
import { DrizzleRelationTupleStore } from './infrastructure/persistence/drizzle-relation-tuple.store';
import { AuthzController } from './interface/authz.controller';

@Module({
  imports: [AuthnModule],
  controllers: [AuthzController],
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    AccessTokenGuard,
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
      provide: DECISION_LOG,
      inject: [DB],
      useFactory: (db: Database): DrizzleDecisionLog => new DrizzleDecisionLog(db),
    },
    {
      provide: POLICY_DECISION_POINT,
      inject: [
        NAMESPACE_DEFINITIONS_REPOSITORY,
        RELATION_TUPLE_STORE,
        REVISIONS_REPOSITORY,
        DECISION_LOG,
        UNIT_OF_WORK,
        CLOCK,
      ],
      useFactory: (
        namespaces: NamespaceDefinitionsRepository,
        tuples: RelationTupleStore,
        revisions: RevisionsRepository,
        decisionLog: DecisionLog,
        unitOfWork: UnitOfWork,
        clock: Clock,
      ): PdpService =>
        new PdpService(namespaces, tuples, revisions, decisionLog, unitOfWork, clock),
    },
  ],
  exports: [
    POLICY_DECISION_POINT,
    RELATION_TUPLE_STORE,
    RELATION_TUPLE_WRITER,
    NAMESPACE_DEFINITIONS_REPOSITORY,
    NAMESPACE_CONFIG_WRITER,
    DECISION_LOG,
  ],
})
export class AuthzModule {}
