import { Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { AuthnModule } from '../authn/authn.module';
import { AccessTokenGuard } from '../authn/interface/access-token.guard';
import { MeteredDecisionLog } from '../observability/metered-decision-log';
import { MetricsModule } from '../observability/metrics.module';
import { MetricsService } from '../observability/metrics.service';
import { SecurityModule } from '../security/security.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { DB, type Database } from '../db/db.module';
import { type Env } from '../config/env';
import { ENV } from '../config/env.module';
import { REDIS } from '../redis/redis.module';
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
import { TUPLE_CHANGE_STREAM, TupleChangeStream } from './application/tuple-change-stream';
import { POLICY_WRITER, PolicyWriter } from './application/policy-writer';
import { RELATION_TUPLE_WRITER, RelationTupleWriter } from './application/relation-tuple-writer';
import { POLICY_DECISION_POINT } from './domain/policy-decision-point';
import { DECISION_CACHE, type DecisionCache } from './domain/ports/decision-cache';
import { DECISION_LOG, type DecisionLog } from './domain/ports/decision-log';
import {
  RELATION_TUPLE_CHANGELOG,
  type RelationTupleChangelog,
} from './domain/ports/relation-tuple-changelog';
import {
  NAMESPACE_DEFINITIONS_REPOSITORY,
  type NamespaceDefinitionsRepository,
} from './domain/ports/namespace-definitions-repository';
import { POLICIES_REPOSITORY, type PoliciesRepository } from './domain/ports/policies-repository';
import { RELATION_TUPLE_STORE, type RelationTupleStore } from './domain/ports/relation-tuple-store';
import { NoopDecisionCache, RedisDecisionCache } from './infrastructure/cache/redis-decision-cache';
import {
  BufferedDecisionLog,
  DECISION_LOG_WRITER,
  type FlushableDecisionLog,
  ImmediateDecisionLog,
} from './infrastructure/persistence/buffered-decision-log';
import { DrizzleDecisionLog } from './infrastructure/persistence/drizzle-decision-log';
import { DrizzleRelationTupleChangelog } from './infrastructure/persistence/drizzle-relation-tuple-changelog';
import { DrizzleNamespaceDefinitionsRepository } from './infrastructure/persistence/drizzle-namespace-definitions.repository';
import { DrizzlePoliciesRepository } from './infrastructure/persistence/drizzle-policies.repository';
import { DrizzleRelationTupleStore } from './infrastructure/persistence/drizzle-relation-tuple.store';
import { AuthzController } from './interface/authz.controller';
import { DirectoryController } from './interface/directory.controller';
import { PapAdminGuard } from './interface/pap-admin.guard';
import { PapController } from './interface/pap.controller';
import { PermissionGuard } from './interface/permission.guard';
import { WatchController } from './interface/watch.controller';

@Module({
  imports: [AuthnModule, TenancyModule, SecurityModule, MetricsModule],
  controllers: [AuthzController, PapController, DirectoryController, WatchController],
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
      provide: RELATION_TUPLE_CHANGELOG,
      inject: [DB],
      useFactory: (db: Database): DrizzleRelationTupleChangelog =>
        new DrizzleRelationTupleChangelog(db),
    },
    {
      provide: TUPLE_CHANGE_STREAM,
      inject: [RELATION_TUPLE_CHANGELOG, REVISIONS_REPOSITORY, CLOCK, ENV],
      useFactory: (
        changelog: RelationTupleChangelog,
        revisions: RevisionsRepository,
        clock: Clock,
        env: Env,
      ): TupleChangeStream =>
        new TupleChangeStream(changelog, revisions, clock, {
          pollIntervalMs: env.WATCH_POLL_INTERVAL_MS,
          pageSize: env.WATCH_PAGE_SIZE,
          heartbeatSeconds: env.WATCH_HEARTBEAT_SECONDS,
          maxStreamSeconds: env.WATCH_MAX_STREAM_SECONDS,
        }),
    },
    {
      provide: RELATION_TUPLE_WRITER,
      inject: [
        RELATION_TUPLE_STORE,
        REVISIONS_REPOSITORY,
        UNIT_OF_WORK,
        CLOCK,
        RELATION_TUPLE_CHANGELOG,
      ],
      useFactory: (
        tuples: RelationTupleStore,
        revisions: RevisionsRepository,
        unitOfWork: UnitOfWork,
        clock: Clock,
        changelog: RelationTupleChangelog,
      ): RelationTupleWriter =>
        new RelationTupleWriter(tuples, revisions, unitOfWork, clock, changelog),
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
      provide: DECISION_LOG_WRITER,
      inject: [DB, MetricsService, CLOCK, ENV],
      useFactory: (
        db: Database,
        metrics: MetricsService,
        clock: Clock,
        env: Env,
      ): FlushableDecisionLog => {
        const sink = new DrizzleDecisionLog(db);
        return env.DECISION_LOG_ASYNC
          ? new BufferedDecisionLog(sink, metrics, clock, {
              maxBufferSize: env.DECISION_LOG_BUFFER_SIZE,
              flushBatchSize: env.DECISION_LOG_FLUSH_BATCH_SIZE,
              flushIntervalMs: env.DECISION_LOG_FLUSH_INTERVAL_MS,
            })
          : new ImmediateDecisionLog(sink);
      },
    },
    {
      provide: DECISION_LOG,
      inject: [DECISION_LOG_WRITER, MetricsService],
      useFactory: (writer: FlushableDecisionLog, metrics: MetricsService): DecisionLog =>
        new MeteredDecisionLog(writer, metrics),
    },
    {
      provide: DECISION_CACHE,
      inject: [REDIS, ENV],
      useFactory: (redis: Redis, env: Env): DecisionCache =>
        env.DECISION_CACHE_ENABLED
          ? new RedisDecisionCache(redis, 'authz:dec:v1', env.DECISION_CACHE_TTL_SECONDS)
          : new NoopDecisionCache(),
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
        DECISION_CACHE,
      ],
      useFactory: (
        namespaces: NamespaceDefinitionsRepository,
        tuples: RelationTupleStore,
        policies: PoliciesRepository,
        revisions: RevisionsRepository,
        decisionLog: DecisionLog,
        unitOfWork: UnitOfWork,
        clock: Clock,
        decisionCache: DecisionCache,
      ): PdpService =>
        new PdpService(
          namespaces,
          tuples,
          policies,
          revisions,
          decisionLog,
          unitOfWork,
          clock,
          decisionCache,
        ),
    },
  ],
  exports: [
    POLICY_DECISION_POINT,
    RELATION_TUPLE_STORE,
    RELATION_TUPLE_WRITER,
    RELATION_TUPLE_CHANGELOG,
    NAMESPACE_DEFINITIONS_REPOSITORY,
    NAMESPACE_CONFIG_WRITER,
    POLICIES_REPOSITORY,
    POLICY_WRITER,
    AUTHZ_DIRECTORY,
    DECISION_LOG,
    DECISION_LOG_WRITER,
    TUPLE_CHANGE_STREAM,
  ],
})
export class AuthzModule implements OnApplicationShutdown {
  constructor(
    @Inject(DECISION_LOG_WRITER) private readonly decisionLog: FlushableDecisionLog,
    @Inject(TUPLE_CHANGE_STREAM) private readonly changeStream: TupleChangeStream,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    this.changeStream.close();
    await this.decisionLog.close();
  }
}
