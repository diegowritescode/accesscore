import { Logger } from '@nestjs/common';
import { type OrgId } from '../../shared/kernel/org-id';
import { type Revision } from '../../shared/kernel/revision';
import { type RevisionsRepository } from '../../shared/persistence/revisions-repository';
import { type Tx, type UnitOfWork } from '../../shared/persistence/unit-of-work';
import { formatEntityRef } from '../domain/entity-ref';
import { flatten, type EvaluationSnapshot } from '../domain/evaluate';
import { NamespaceRegistry } from '../domain/namespace-registry';
import { type MembershipIndexStore, type MembershipSetRef } from '../domain/ports/membership-index';
import { type NamespaceDefinitionsRepository } from '../domain/ports/namespace-definitions-repository';
import { type RelationTupleChangelog } from '../domain/ports/relation-tuple-changelog';
import { type RelationTupleStore } from '../domain/ports/relation-tuple-store';
import { TupleIndex } from '../domain/tuple-index';

export interface MembershipIndexerOptions {
  readonly changePageSize: number;
  readonly maxTuplesPerOrg: number;
  readonly intervalMs: number;
}

export interface IndexerRun {
  readonly indexed: number;
  readonly removed: number;
  readonly skippedOrgs: number;
  readonly cursor: Revision;
}

export const MEMBERSHIP_INDEXER = Symbol('MEMBERSHIP_INDEXER');

const setKey = (set: MembershipSetRef): string => `${formatEntityRef(set.object)}#${set.relation}`;

const idle = (cursor: Revision): IndexerRun => ({
  indexed: 0,
  removed: 0,
  skippedOrgs: 0,
  cursor,
});

export class MembershipIndexer {
  private readonly logger = new Logger('MembershipIndexer');
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly changelog: RelationTupleChangelog,
    private readonly index: MembershipIndexStore,
    private readonly tuples: RelationTupleStore,
    private readonly namespaces: NamespaceDefinitionsRepository,
    private readonly revisions: RevisionsRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly options: MembershipIndexerOptions,
  ) {}

  start(): void {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => {
      void this.runOnce().catch((error: unknown) => {
        this.logger.error('membership index refresh failed', error as Error);
      });
    }, this.options.intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async runOnce(): Promise<IndexerRun> {
    return this.unitOfWork.withTransaction(async (tx) => {
      const cursor = await this.index.readCursor(tx);
      if (!(await this.index.tryLock(tx))) {
        return idle(cursor);
      }
      const high = await this.revisions.current(tx);
      const changes = await this.changelog.sinceAll(
        { afterRevision: cursor, limit: this.options.changePageSize },
        tx,
      );
      if (changes.length === 0) {
        return idle(cursor);
      }
      const orgs = new Map<string, OrgId>();
      let reached = cursor;
      for (const change of changes) {
        orgs.set(change.orgId.value, change.orgId);
        reached = change.revision;
      }

      let indexed = 0;
      let removed = 0;
      let skippedOrgs = 0;
      for (const orgId of orgs.values()) {
        const result = await this.reindexOrg(orgId, high, tx);
        if (result === null) {
          skippedOrgs += 1;
          continue;
        }
        indexed += result.indexed;
        removed += result.removed;
      }
      await this.index.writeCursor(reached, tx);
      return { indexed, removed, skippedOrgs, cursor: reached };
    });
  }

  private async reindexOrg(
    orgId: OrgId,
    validAt: Revision,
    tx: Tx,
  ): Promise<{ indexed: number; removed: number } | null> {
    const tuples = await this.tuples.list(
      { orgId, limit: this.options.maxTuplesPerOrg + 1, offset: 0 },
      tx,
    );
    if (tuples.length > this.options.maxTuplesPerOrg) {
      this.logger.warn(
        `organization ${orgId.value} exceeds the flattening bound of ${this.options.maxTuplesPerOrg} tuples; its membership index is left stale`,
      );
      return null;
    }
    const snapshot: EvaluationSnapshot = {
      namespaces: NamespaceRegistry.of(await this.namespaces.listByOrg(orgId, tx)),
      tuples: TupleIndex.of(orgId, tuples),
    };

    const wanted = new Map<string, MembershipSetRef>();
    for (const userset of await this.tuples.listReferencedUsersets(orgId, tx)) {
      const set: MembershipSetRef = { object: userset.ref, relation: userset.relation };
      wanted.set(setKey(set), set);
    }

    let removed = 0;
    for (const existing of await this.index.listSets(orgId, tx)) {
      if (!wanted.has(setKey(existing))) {
        await this.index.remove(orgId, existing, tx);
        removed += 1;
      }
    }

    let indexed = 0;
    for (const set of wanted.values()) {
      const members = flatten(set.object, set.relation, snapshot);
      await this.index.replace(orgId, set, members, validAt, tx);
      indexed += 1;
    }
    return { indexed, removed };
  }
}
