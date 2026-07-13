import { Module } from '@nestjs/common';
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
import { RELATION_TUPLE_WRITER, RelationTupleWriter } from './application/relation-tuple-writer';
import { DefaultDenyPolicyDecisionPoint } from './domain/default-deny-pdp';
import { POLICY_DECISION_POINT } from './domain/policy-decision-point';
import {
  NAMESPACE_DEFINITIONS_REPOSITORY,
  type NamespaceDefinitionsRepository,
} from './domain/ports/namespace-definitions-repository';
import { RELATION_TUPLE_STORE, type RelationTupleStore } from './domain/ports/relation-tuple-store';
import { DrizzleNamespaceDefinitionsRepository } from './infrastructure/persistence/drizzle-namespace-definitions.repository';
import { DrizzleRelationTupleStore } from './infrastructure/persistence/drizzle-relation-tuple.store';

@Module({
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    { provide: POLICY_DECISION_POINT, useClass: DefaultDenyPolicyDecisionPoint },
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
  ],
  exports: [
    POLICY_DECISION_POINT,
    RELATION_TUPLE_STORE,
    RELATION_TUPLE_WRITER,
    NAMESPACE_DEFINITIONS_REPOSITORY,
    NAMESPACE_CONFIG_WRITER,
  ],
})
export class AuthzModule {}
