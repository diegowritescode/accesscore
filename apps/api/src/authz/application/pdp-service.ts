import { randomUUID } from 'node:crypto';
import { type Clock } from '../../shared/kernel/clock';
import { OrgId } from '../../shared/kernel/org-id';
import { Revision } from '../../shared/kernel/revision';
import { type RevisionsRepository } from '../../shared/persistence/revisions-repository';
import { type Tx, type UnitOfWork } from '../../shared/persistence/unit-of-work';
import { type Action } from '../domain/action';
import {
  type Principal,
  type RequestContext,
  type Resource,
} from '../domain/authorization-request';
import { ConsistencyToken } from '../domain/consistency-token';
import { type Decision } from '../domain/decision';
import { type EntityRef, formatEntityRef } from '../domain/entity-ref';
import {
  evaluate,
  expand as expandMembers,
  type EvaluationSnapshot,
  MAX_USERSET_DEPTH,
} from '../domain/evaluate';
import { NamespaceRegistry } from '../domain/namespace-registry';
import { type BatchCheckRequest, type PolicyDecisionPoint } from '../domain/policy-decision-point';
import { type DecisionLog } from '../domain/ports/decision-log';
import { type NamespaceDefinitionsRepository } from '../domain/ports/namespace-definitions-repository';
import { type RelationTupleStore } from '../domain/ports/relation-tuple-store';
import { type RelationTuple } from '../domain/relation-tuple';
import { TupleIndex } from '../domain/tuple-index';
import { type Userset } from '../domain/userset';

const deny = (code: string, message: string): Decision => ({
  effect: 'deny',
  reasons: [{ code, message }],
});

interface EvaluationResult {
  readonly decision: Decision;
  readonly revisionUsed: Revision;
}

export class PdpService implements PolicyDecisionPoint {
  constructor(
    private readonly namespaces: NamespaceDefinitionsRepository,
    private readonly tuples: RelationTupleStore,
    private readonly revisions: RevisionsRepository,
    private readonly decisionLog: DecisionLog,
    private readonly unitOfWork: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  async check(
    principal: Principal,
    action: Action,
    resource: Resource,
    context: RequestContext,
  ): Promise<Decision> {
    const startedAt = this.clock.now();

    if (!principal.orgId) {
      return this.log(startedAt, null, principal, action, resource, {
        decision: deny('no_org_context', 'The principal is not scoped to an organization.'),
        revisionUsed: Revision.fromValue(0),
      });
    }

    const orgId = OrgId.fromString(principal.orgId);
    const requiredRevision =
      context.consistency.mode === 'at-least'
        ? ConsistencyToken.decode(context.consistency.token).revision
        : null;

    const result = await this.unitOfWork.withTransaction<EvaluationResult>(
      async (tx) => {
        const revisionUsed = await this.revisions.current(tx);
        if (requiredRevision && !revisionUsed.isAtLeast(requiredRevision)) {
          return {
            decision: deny(
              'consistency_unavailable',
              'The store has not caught up to the requested consistency token.',
            ),
            revisionUsed,
          };
        }
        const namespace = await this.namespaces.findByNamespace(orgId, resource.type, tx);
        const registry = NamespaceRegistry.of(namespace ? [namespace] : []);
        const relations = namespace ? namespace.requiredRelationsFor(action) : [];
        const tuples = await this.loadClosure(orgId, resource, relations, registry, tx);
        const snapshot: EvaluationSnapshot = {
          namespaces: registry,
          tuples: TupleIndex.of(orgId, tuples),
        };
        return {
          decision: evaluate({ orgId, subject: principal.subject, action, resource }, snapshot),
          revisionUsed,
        };
      },
      { readOnly: true, isolationLevel: 'repeatable read' },
    );

    return this.log(startedAt, orgId, principal, action, resource, result);
  }

  batchCheck(requests: readonly BatchCheckRequest[]): Promise<Decision[]> {
    return Promise.all(
      requests.map((request) =>
        this.check(request.principal, request.action, request.resource, request.context),
      ),
    );
  }

  async expand(principal: Principal, resource: Resource, relation: string): Promise<EntityRef[]> {
    if (!principal.orgId) {
      return [];
    }
    const orgId = OrgId.fromString(principal.orgId);
    return this.unitOfWork.withTransaction<EntityRef[]>(
      async (tx) => {
        const namespace = await this.namespaces.findByNamespace(orgId, resource.type, tx);
        const registry = NamespaceRegistry.of(namespace ? [namespace] : []);
        const tuples = await this.loadClosure(orgId, resource, [relation], registry, tx);
        const snapshot: EvaluationSnapshot = {
          namespaces: registry,
          tuples: TupleIndex.of(orgId, tuples),
        };
        return expandMembers(orgId, resource, relation, snapshot);
      },
      { readOnly: true, isolationLevel: 'repeatable read' },
    );
  }

  private async loadClosure(
    orgId: OrgId,
    resource: Resource,
    relations: readonly string[],
    registry: NamespaceRegistry,
    tx: Tx,
  ): Promise<RelationTuple[]> {
    const rows = new Map<string, RelationTuple[]>();
    const walked = new Set<string>();

    const rowsOf = async (object: EntityRef, relation: string): Promise<RelationTuple[]> => {
      const key = `${formatEntityRef(object)}#${relation}`;
      const cached = rows.get(key);
      if (cached) {
        return cached;
      }
      const loaded = await this.tuples.listByObject({ orgId, object, relation }, tx);
      rows.set(key, loaded);
      return loaded;
    };

    const walkRewrite = async (
      object: EntityRef,
      rewrite: Userset,
      node: readonly RelationTuple[],
      depth: number,
    ): Promise<void> => {
      switch (rewrite.kind) {
        case 'this':
          for (const tuple of node) {
            if (tuple.subject.kind === 'userset') {
              await walk(tuple.subject.ref, tuple.subject.relation, depth + 1);
            }
          }
          return;
        case 'computedUserset':
          await walk(object, rewrite.relation, depth);
          return;
        case 'tupleToUserset':
          for (const tuple of await rowsOf(object, rewrite.tupleset)) {
            if (tuple.subject.kind === 'subject') {
              await walk(tuple.subject.ref, rewrite.computedUserset, depth + 1);
            }
          }
          return;
        case 'union':
          for (const child of rewrite.children) {
            await walkRewrite(object, child, node, depth);
          }
          return;
      }
    };

    const walk = async (object: EntityRef, relation: string, depth: number): Promise<void> => {
      const key = `${formatEntityRef(object)}#${relation}`;
      if (walked.has(key) || depth > MAX_USERSET_DEPTH) {
        return;
      }
      walked.add(key);
      const node = await rowsOf(object, relation);
      await walkRewrite(object, registry.rewritesFor(object.type, relation), node, depth);
    };

    for (const relation of relations) {
      await walk(resource, relation, 0);
    }
    return [...rows.values()].flat();
  }

  private async log(
    startedAt: Date,
    orgId: OrgId | null,
    principal: Principal,
    action: Action,
    resource: Resource,
    result: EvaluationResult,
  ): Promise<Decision> {
    const finishedAt = this.clock.now();
    await this.decisionLog.record({
      id: randomUUID(),
      orgId,
      subject: formatEntityRef(principal.subject),
      action: action.name,
      resource: formatEntityRef(resource),
      effect: result.decision.effect,
      reasons: result.decision.reasons,
      revisionUsed: result.revisionUsed,
      latencyMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
      createdAt: finishedAt,
    });
    return result.decision;
  }
}
