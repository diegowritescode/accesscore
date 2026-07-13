import { type OrgId } from '../../shared/kernel/org-id';
import { type AuthorizationQuery } from './authorization-query';
import { type Decision, type Reason } from './decision';
import { type EntityRef, formatEntityRef } from './entity-ref';
import { type NamespaceRegistry } from './namespace-registry';
import { encodeSubject, type SubjectRef } from './subject-ref';
import { type TupleIndex } from './tuple-index';
import { type Userset } from './userset';

export const MAX_USERSET_DEPTH = 1;

export interface EvaluationSnapshot {
  readonly namespaces: NamespaceRegistry;
  readonly tuples: TupleIndex;
}

interface Grant {
  readonly code: string;
  readonly path: string[];
}

function deny(reasons: Reason[]): Decision {
  return { effect: 'deny', reasons };
}

function permit(reasons: Reason[]): Decision {
  return { effect: 'permit', reasons };
}

function refEquals(a: EntityRef, b: EntityRef): boolean {
  return a.type === b.type && a.id === b.id;
}

function nodeKey(object: EntityRef, relation: string): string {
  return `${formatEntityRef(object)}#${relation}`;
}

function tupleKey(object: EntityRef, relation: string, subject: SubjectRef): string {
  return `${nodeKey(object, relation)}@${encodeSubject(subject)}`;
}

function deriveThis(
  object: EntityRef,
  relation: string,
  target: EntityRef,
  snapshot: EvaluationSnapshot,
  depth: number,
  visited: Set<string>,
): Grant | null {
  const subjects = snapshot.tuples.subjectsOf(object, relation);
  for (const subject of subjects) {
    if (subject.kind === 'subject' && refEquals(subject.ref, target)) {
      return { code: 'grant.direct', path: [tupleKey(object, relation, subject)] };
    }
  }
  if (depth < MAX_USERSET_DEPTH) {
    for (const subject of subjects) {
      if (subject.kind === 'userset') {
        const sub = derive(subject.ref, subject.relation, target, snapshot, depth + 1, visited);
        if (sub) {
          return {
            code: 'grant.userset',
            path: [tupleKey(object, relation, subject), ...sub.path],
          };
        }
      }
    }
  }
  return null;
}

function deriveRewrite(
  object: EntityRef,
  relation: string,
  rewrite: Userset,
  target: EntityRef,
  snapshot: EvaluationSnapshot,
  depth: number,
  visited: Set<string>,
): Grant | null {
  switch (rewrite.kind) {
    case 'this':
      return deriveThis(object, relation, target, snapshot, depth, visited);
    case 'computedUserset': {
      const sub = derive(object, rewrite.relation, target, snapshot, depth, visited);
      return sub ? { code: 'grant.computed_userset', path: sub.path } : null;
    }
    case 'tupleToUserset':
      return null;
    case 'union': {
      for (const child of rewrite.children) {
        const grant = deriveRewrite(object, relation, child, target, snapshot, depth, visited);
        if (grant) return grant;
      }
      return null;
    }
  }
}

function derive(
  object: EntityRef,
  relation: string,
  target: EntityRef,
  snapshot: EvaluationSnapshot,
  depth: number,
  visited: Set<string>,
): Grant | null {
  const current = nodeKey(object, relation);
  if (visited.has(current) || depth > MAX_USERSET_DEPTH) {
    return null;
  }
  visited.add(current);
  const rewrite = snapshot.namespaces.rewritesFor(object.type, relation);
  return deriveRewrite(object, relation, rewrite, target, snapshot, depth, visited);
}

export function evaluate(query: AuthorizationQuery, snapshot: EvaluationSnapshot): Decision {
  if (!snapshot.tuples.orgId.equals(query.orgId)) {
    return deny([
      { code: 'org_mismatch', message: 'Tuple snapshot belongs to a different organization.' },
    ]);
  }
  for (const namespace of snapshot.namespaces.all()) {
    if (!namespace.orgId.equals(query.orgId)) {
      return deny([
        {
          code: 'org_mismatch',
          message: 'Namespace definition belongs to a different organization.',
        },
      ]);
    }
  }

  const namespace = snapshot.namespaces.get(query.resource.type);
  const required = namespace ? namespace.requiredRelationsFor(query.action) : [];
  if (required.length === 0) {
    return deny([
      { code: 'unknown_action', message: `No relation is bound to action ${query.action.name}.` },
    ]);
  }

  for (const relation of required) {
    const grant = derive(query.resource, relation, query.subject, snapshot, 0, new Set());
    if (grant) {
      return permit([
        {
          code: grant.code,
          message: `Subject ${formatEntityRef(query.subject)} holds ${relation} on ${formatEntityRef(query.resource)}.`,
          relation,
          path: grant.path,
        },
      ]);
    }
  }

  return deny([{ code: 'default_deny', message: 'No grant path resolved; denied by default.' }]);
}

function collectRewrite(
  object: EntityRef,
  relation: string,
  rewrite: Userset,
  snapshot: EvaluationSnapshot,
  depth: number,
  visited: Set<string>,
): EntityRef[] {
  switch (rewrite.kind) {
    case 'this': {
      const members: EntityRef[] = [];
      for (const subject of snapshot.tuples.subjectsOf(object, relation)) {
        if (subject.kind === 'subject') {
          members.push(subject.ref);
        } else if (depth < MAX_USERSET_DEPTH) {
          members.push(
            ...collectMembers(subject.ref, subject.relation, snapshot, depth + 1, visited),
          );
        }
      }
      return members;
    }
    case 'computedUserset':
      return collectMembers(object, rewrite.relation, snapshot, depth, visited);
    case 'tupleToUserset':
      return [];
    case 'union':
      return rewrite.children.flatMap((child) =>
        collectRewrite(object, relation, child, snapshot, depth, visited),
      );
  }
}

function collectMembers(
  object: EntityRef,
  relation: string,
  snapshot: EvaluationSnapshot,
  depth: number,
  visited: Set<string>,
): EntityRef[] {
  const current = nodeKey(object, relation);
  if (visited.has(current) || depth > MAX_USERSET_DEPTH) {
    return [];
  }
  visited.add(current);
  const rewrite = snapshot.namespaces.rewritesFor(object.type, relation);
  return collectRewrite(object, relation, rewrite, snapshot, depth, visited);
}

export function expand(
  orgId: OrgId,
  resource: EntityRef,
  relation: string,
  snapshot: EvaluationSnapshot,
): EntityRef[] {
  if (!snapshot.tuples.orgId.equals(orgId)) {
    return [];
  }
  const seen = new Set<string>();
  const out: EntityRef[] = [];
  for (const ref of collectMembers(resource, relation, snapshot, 0, new Set())) {
    const key = formatEntityRef(ref);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(ref);
    }
  }
  return out;
}
