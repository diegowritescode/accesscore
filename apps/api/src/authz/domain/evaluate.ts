import { type OrgId } from '../../shared/kernel/org-id';
import { type AuthorizationQuery } from './authorization-query';
import { type Decision, type Reason } from './decision';
import { type EntityRef, formatEntityRef } from './entity-ref';
import { type NamespaceDefinition } from './namespace-definition';
import { encodeSubject, type SubjectRef } from './subject-ref';
import { type TupleIndex } from './tuple-index';

const MAX_USERSET_DEPTH = 1;

export interface EvaluationSnapshot {
  readonly namespace: NamespaceDefinition | null;
  readonly tuples: TupleIndex;
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

function derive(
  object: EntityRef,
  relation: string,
  target: EntityRef,
  tuples: TupleIndex,
  depth: number,
  visited: Set<string>,
): string[] | null {
  const current = nodeKey(object, relation);
  if (visited.has(current) || depth > MAX_USERSET_DEPTH) {
    return null;
  }
  visited.add(current);
  const subjects = tuples.subjectsOf(object, relation);

  for (const subject of subjects) {
    if (subject.kind === 'subject' && refEquals(subject.ref, target)) {
      return [tupleKey(object, relation, subject)];
    }
  }

  if (depth < MAX_USERSET_DEPTH) {
    for (const subject of subjects) {
      if (subject.kind === 'userset') {
        const sub = derive(subject.ref, subject.relation, target, tuples, depth + 1, visited);
        if (sub) {
          return [tupleKey(object, relation, subject), ...sub];
        }
      }
    }
  }

  return null;
}

export function evaluate(query: AuthorizationQuery, snapshot: EvaluationSnapshot): Decision {
  if (!snapshot.tuples.orgId.equals(query.orgId)) {
    return deny([
      { code: 'org_mismatch', message: 'Tuple snapshot belongs to a different organization.' },
    ]);
  }
  if (snapshot.namespace && !snapshot.namespace.orgId.equals(query.orgId)) {
    return deny([
      {
        code: 'org_mismatch',
        message: 'Namespace definition belongs to a different organization.',
      },
    ]);
  }

  const required = snapshot.namespace ? snapshot.namespace.requiredRelationsFor(query.action) : [];
  if (required.length === 0) {
    return deny([
      { code: 'unknown_action', message: `No relation is bound to action ${query.action.name}.` },
    ]);
  }

  for (const relation of required) {
    const path = derive(query.resource, relation, query.subject, snapshot.tuples, 0, new Set());
    if (path) {
      return permit([
        {
          code: path.length === 1 ? 'grant.direct' : 'grant.userset',
          message: `Subject ${formatEntityRef(query.subject)} holds ${relation} on ${formatEntityRef(query.resource)}.`,
          relation,
          path,
        },
      ]);
    }
  }

  return deny([{ code: 'default_deny', message: 'No grant path resolved; denied by default.' }]);
}

function collectMembers(
  object: EntityRef,
  relation: string,
  tuples: TupleIndex,
  depth: number,
  visited: Set<string>,
): EntityRef[] {
  const current = nodeKey(object, relation);
  if (visited.has(current) || depth > MAX_USERSET_DEPTH) {
    return [];
  }
  visited.add(current);
  const members: EntityRef[] = [];
  for (const subject of tuples.subjectsOf(object, relation)) {
    if (subject.kind === 'subject') {
      members.push(subject.ref);
    } else if (depth < MAX_USERSET_DEPTH) {
      members.push(...collectMembers(subject.ref, subject.relation, tuples, depth + 1, visited));
    }
  }
  return members;
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
  for (const ref of collectMembers(resource, relation, snapshot.tuples, 0, new Set())) {
    const key = formatEntityRef(ref);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(ref);
    }
  }
  return out;
}
