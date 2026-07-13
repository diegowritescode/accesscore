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
import { evaluate, type EvaluationSnapshot } from '../domain/evaluate';
import { type NamespaceDefinition } from '../domain/namespace-definition';
import { type PolicyDecisionPoint } from '../domain/policy-decision-point';
import { type DecisionLog } from '../domain/ports/decision-log';
import { type NamespaceDefinitionsRepository } from '../domain/ports/namespace-definitions-repository';
import { type RelationTupleStore } from '../domain/ports/relation-tuple-store';
import { type RelationTuple } from '../domain/relation-tuple';
import { TupleIndex } from '../domain/tuple-index';

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
        const tuples = await this.loadTuples(orgId, resource, action, namespace, tx);
        const snapshot: EvaluationSnapshot = { namespace, tuples: TupleIndex.of(orgId, tuples) };
        return {
          decision: evaluate({ orgId, subject: principal.subject, action, resource }, snapshot),
          revisionUsed,
        };
      },
      { readOnly: true, isolationLevel: 'repeatable read' },
    );

    return this.log(startedAt, orgId, principal, action, resource, result);
  }

  private async loadTuples(
    orgId: OrgId,
    resource: Resource,
    action: Action,
    namespace: NamespaceDefinition | null,
    tx: Tx,
  ): Promise<RelationTuple[]> {
    if (!namespace) {
      return [];
    }
    const resourceTuples: RelationTuple[] = [];
    for (const relation of namespace.requiredRelationsFor(action)) {
      resourceTuples.push(
        ...(await this.tuples.listByObject({ orgId, object: resource, relation }, tx)),
      );
    }
    const usersets = new Map<string, { ref: EntityRef; relation: string }>();
    for (const tuple of resourceTuples) {
      if (tuple.subject.kind === 'userset') {
        const key = `${formatEntityRef(tuple.subject.ref)}#${tuple.subject.relation}`;
        usersets.set(key, { ref: tuple.subject.ref, relation: tuple.subject.relation });
      }
    }
    const membershipTuples: RelationTuple[] = [];
    for (const userset of usersets.values()) {
      membershipTuples.push(
        ...(await this.tuples.listByObject(
          { orgId, object: userset.ref, relation: userset.relation },
          tx,
        )),
      );
    }
    return [...resourceTuples, ...membershipTuples];
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
