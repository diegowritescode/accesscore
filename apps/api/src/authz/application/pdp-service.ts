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
import { type NamespaceDefinition } from '../domain/namespace-definition';
import { NamespaceRegistry } from '../domain/namespace-registry';
import { applyBounds, type BoundaryTarget, UNBOUNDED } from '../domain/policy/boundary';
import { decide } from '../domain/policy/decide';
import { type EvaluationContext as PolicyContext } from '../domain/policy/evaluation-context';
import { ANY_ACTION, type Policy } from '../domain/policy/policy';
import {
  type BatchCheckRequest,
  type PolicyDecisionPoint,
  type SimulationResult,
} from '../domain/policy-decision-point';
import { type DecisionLog } from '../domain/ports/decision-log';
import { type NamespaceDefinitionsRepository } from '../domain/ports/namespace-definitions-repository';
import { type PoliciesRepository } from '../domain/ports/policies-repository';
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

interface EvaluationContext {
  readonly tx: Tx;
  readonly revisionUsed: Revision;
  readonly namespaces: Map<string, NamespaceDefinition | null>;
  readonly tuples: Map<string, RelationTuple[]>;
}

type Prepared =
  | { readonly outcome: 'deny'; readonly decision: Decision; readonly revisionUsed: Revision }
  | {
      readonly outcome: 'ok';
      readonly rebac: Decision;
      readonly applicable: readonly Policy[];
      readonly policyContext: PolicyContext;
      readonly target: BoundaryTarget;
      readonly subject: EntityRef;
      readonly revisionUsed: Revision;
    };

export class PdpService implements PolicyDecisionPoint {
  constructor(
    private readonly namespaces: NamespaceDefinitionsRepository,
    private readonly tuples: RelationTupleStore,
    private readonly policies: PoliciesRepository,
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
    const orgId = principal.orgId ? OrgId.fromString(principal.orgId) : null;
    const result = await this.unitOfWork.withTransaction<EvaluationResult>(
      async (tx) =>
        this.evaluateWithin(principal, action, resource, context, await this.openContext(tx)),
      { readOnly: true, isolationLevel: 'repeatable read' },
    );
    return this.log(startedAt, orgId, principal, action, resource, result);
  }

  async batchCheck(requests: readonly BatchCheckRequest[]): Promise<Decision[]> {
    if (requests.length === 0) {
      return [];
    }
    const evaluated = await this.unitOfWork.withTransaction(
      async (tx) => {
        const context = await this.openContext(tx);
        const pending: Array<{
          startedAt: Date;
          orgId: OrgId | null;
          request: BatchCheckRequest;
          result: EvaluationResult;
        }> = [];
        for (const request of requests) {
          const startedAt = this.clock.now();
          const orgId = request.principal.orgId ? OrgId.fromString(request.principal.orgId) : null;
          const result = await this.evaluateWithin(
            request.principal,
            request.action,
            request.resource,
            request.context,
            context,
          );
          pending.push({ startedAt, orgId, request, result });
        }
        return pending;
      },
      { readOnly: true, isolationLevel: 'repeatable read' },
    );

    return Promise.all(
      evaluated.map((entry) =>
        this.log(
          entry.startedAt,
          entry.orgId,
          entry.request.principal,
          entry.request.action,
          entry.request.resource,
          entry.result,
        ),
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
        const context = await this.openContext(tx);
        const namespace = await this.cachedNamespace(orgId, resource.type, context);
        const registry = NamespaceRegistry.of(namespace ? [namespace] : []);
        const tuples = await this.loadClosure(orgId, resource, [relation], registry, context);
        const snapshot: EvaluationSnapshot = {
          namespaces: registry,
          tuples: TupleIndex.of(orgId, tuples),
        };
        return expandMembers(orgId, resource, relation, snapshot);
      },
      { readOnly: true, isolationLevel: 'repeatable read' },
    );
  }

  private async openContext(tx: Tx): Promise<EvaluationContext> {
    return {
      tx,
      revisionUsed: await this.revisions.current(tx),
      namespaces: new Map<string, NamespaceDefinition | null>(),
      tuples: new Map<string, RelationTuple[]>(),
    };
  }

  async simulate(
    principal: Principal,
    action: Action,
    resource: Resource,
    request: RequestContext,
    overlay: readonly Policy[] | null,
  ): Promise<SimulationResult> {
    return this.unitOfWork.withTransaction<SimulationResult>(
      async (tx) => {
        const prepared = await this.prepare(
          principal,
          action,
          resource,
          request,
          await this.openContext(tx),
        );
        if (prepared.outcome === 'deny') {
          return { decision: prepared.decision, live: prepared.decision, changed: false };
        }
        const resolve = (policies: readonly Policy[]): Decision =>
          applyBounds(
            decide(prepared.rebac, policies, prepared.policyContext),
            prepared.target,
            prepared.subject,
            UNBOUNDED,
          );
        const live = resolve(prepared.applicable);
        const overlayPolicies = overlay
          ? overlay.filter(
              (policy) =>
                policy.resourceType === prepared.target.resourceType &&
                (policy.action === prepared.target.action || policy.action === ANY_ACTION),
            )
          : prepared.applicable;
        const proposed = resolve(overlayPolicies);
        return { decision: proposed, live, changed: proposed.effect !== live.effect };
      },
      { readOnly: true, isolationLevel: 'repeatable read' },
    );
  }

  private async evaluateWithin(
    principal: Principal,
    action: Action,
    resource: Resource,
    request: RequestContext,
    context: EvaluationContext,
  ): Promise<EvaluationResult> {
    const prepared = await this.prepare(principal, action, resource, request, context);
    if (prepared.outcome === 'deny') {
      return { decision: prepared.decision, revisionUsed: prepared.revisionUsed };
    }
    const decided = decide(prepared.rebac, prepared.applicable, prepared.policyContext);
    return {
      decision: applyBounds(decided, prepared.target, prepared.subject, UNBOUNDED),
      revisionUsed: prepared.revisionUsed,
    };
  }

  private async prepare(
    principal: Principal,
    action: Action,
    resource: Resource,
    request: RequestContext,
    context: EvaluationContext,
  ): Promise<Prepared> {
    if (!principal.orgId) {
      return {
        outcome: 'deny',
        decision: deny('no_org_context', 'The principal is not scoped to an organization.'),
        revisionUsed: Revision.fromValue(0),
      };
    }
    const requiredRevision =
      request.consistency.mode === 'at-least'
        ? ConsistencyToken.decode(request.consistency.token).revision
        : null;
    if (requiredRevision && !context.revisionUsed.isAtLeast(requiredRevision)) {
      return {
        outcome: 'deny',
        decision: deny(
          'consistency_unavailable',
          'The store has not caught up to the requested consistency token.',
        ),
        revisionUsed: context.revisionUsed,
      };
    }
    const orgId = OrgId.fromString(principal.orgId);
    const namespace = await this.cachedNamespace(orgId, resource.type, context);
    const registry = NamespaceRegistry.of(namespace ? [namespace] : []);
    const relations = namespace ? namespace.requiredRelationsFor(action) : [];
    const tuples = await this.loadClosure(orgId, resource, relations, registry, context);
    const snapshot: EvaluationSnapshot = {
      namespaces: registry,
      tuples: TupleIndex.of(orgId, tuples),
    };
    const rebac = evaluate({ orgId, subject: principal.subject, action, resource }, snapshot);
    const applicable = await this.policies.listByTarget(
      orgId,
      resource.type,
      action.verb,
      context.tx,
    );
    const policyContext: PolicyContext = {
      principal: { aal: principal.assuranceLevel, authTime: principal.authenticatedAt ?? null },
      env: { ip: request.ip, now: this.clock.now() },
      resource: {},
    };
    return {
      outcome: 'ok',
      rebac,
      applicable,
      policyContext,
      target: { resourceType: resource.type, action: action.verb },
      subject: principal.subject,
      revisionUsed: context.revisionUsed,
    };
  }

  private async cachedNamespace(
    orgId: OrgId,
    type: string,
    context: EvaluationContext,
  ): Promise<NamespaceDefinition | null> {
    const key = `${orgId.value}:${type}`;
    const cached = context.namespaces.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const namespace = await this.namespaces.findByNamespace(orgId, type, context.tx);
    context.namespaces.set(key, namespace);
    return namespace;
  }

  private async loadClosure(
    orgId: OrgId,
    resource: Resource,
    relations: readonly string[],
    registry: NamespaceRegistry,
    context: EvaluationContext,
  ): Promise<RelationTuple[]> {
    const local = new Map<string, RelationTuple[]>();
    const walked = new Set<string>();

    const rowsOf = async (object: EntityRef, relation: string): Promise<RelationTuple[]> => {
      const node = `${formatEntityRef(object)}#${relation}`;
      const localHit = local.get(node);
      if (localHit) {
        return localHit;
      }
      const cacheKey = `${orgId.value}:${node}`;
      let loaded = context.tuples.get(cacheKey);
      if (!loaded) {
        loaded = await this.tuples.listByObject({ orgId, object, relation }, context.tx);
        context.tuples.set(cacheKey, loaded);
      }
      local.set(node, loaded);
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
        case 'intersection':
          for (const child of rewrite.children) {
            await walkRewrite(object, child, node, depth);
          }
          return;
        case 'exclusion':
          await walkRewrite(object, rewrite.base, node, depth);
          await walkRewrite(object, rewrite.subtract, node, depth);
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
    return [...local.values()].flat();
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
