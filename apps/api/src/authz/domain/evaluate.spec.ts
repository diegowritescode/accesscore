import { OrgId } from '../../shared/kernel/org-id';
import { Revision } from '../../shared/kernel/revision';
import { Action } from './action';
import { type EntityRef } from './entity-ref';
import { evaluate, expand, type EvaluationSnapshot } from './evaluate';
import { NamespaceConfig } from './namespace-config';
import { NamespaceDefinition } from './namespace-definition';
import { NamespaceRegistry } from './namespace-registry';
import { RelationTuple } from './relation-tuple';
import { type SubjectRef } from './subject-ref';
import { TupleIndex } from './tuple-index';
import { type Userset } from './userset';

const orgA = OrgId.generate();
const orgB = OrgId.generate();
const now = new Date('2026-07-12T00:00:00.000Z');

const resource: EntityRef = { type: 'document', id: 'doc-1' };
const alice: EntityRef = { type: 'user', id: 'alice' };
const bob: EntityRef = { type: 'user', id: 'bob' };
const group: EntityRef = { type: 'group', id: 'eng' };

const asSubject = (ref: EntityRef): SubjectRef => ({ kind: 'subject', ref });
const userset = (ref: EntityRef, relation: string): SubjectRef => ({
  kind: 'userset',
  ref,
  relation,
});

function def(
  relations: string[],
  actions: Record<string, string[]>,
  orgId = orgA,
  namespace = 'document',
  rewrites?: Record<string, Userset>,
): NamespaceDefinition {
  const config = NamespaceConfig.create({ relations, actions, rewrites });
  if (!config.ok) {
    throw new Error(`invalid test config: ${config.error}`);
  }
  return NamespaceDefinition.define({
    orgId,
    namespace,
    config: config.value,
    revision: Revision.fromValue(1),
    createdAt: now,
  });
}

function tuple(
  object: EntityRef,
  relation: string,
  subject: SubjectRef,
  orgId = orgA,
): RelationTuple {
  return RelationTuple.write({
    orgId,
    object,
    relation,
    subject,
    revision: Revision.fromValue(0),
    createdAt: now,
  });
}

const snap = (
  namespace: NamespaceDefinition | null,
  tuples: RelationTuple[],
  orgId = orgA,
): EvaluationSnapshot => ({
  namespaces: NamespaceRegistry.of(namespace ? [namespace] : []),
  tuples: TupleIndex.of(orgId, tuples),
});

const readConfig = def(['owner', 'editor', 'viewer'], { read: ['viewer', 'editor', 'owner'] });
const read = Action.of('document.read');

const aliasConfig = def(['owner', 'editor', 'viewer'], { read: ['viewer'] }, orgA, 'document', {
  viewer: {
    kind: 'union',
    children: [{ kind: 'this' }, { kind: 'computedUserset', relation: 'editor' }],
  },
});

const inheritConfig = def(['viewer', 'parent'], { read: ['viewer'] }, orgA, 'document', {
  viewer: {
    kind: 'union',
    children: [
      { kind: 'this' },
      { kind: 'tupleToUserset', tupleset: 'parent', computedUserset: 'viewer' },
    ],
  },
});

const folder: EntityRef = { type: 'folder', id: 'f1' };

describe('evaluate', () => {
  it('permits a direct relationship and explains the derivation', () => {
    const decision = evaluate(
      { orgId: orgA, subject: alice, action: read, resource },
      snap(readConfig, [tuple(resource, 'viewer', asSubject(alice))]),
    );

    expect(decision.effect).toBe('permit');
    const [reason] = decision.reasons;
    expect(reason?.code).toBe('grant.direct');
    expect(reason?.relation).toBe('viewer');
    expect(reason?.path).toEqual(['document:doc-1#viewer@user:alice']);
  });

  it('permits via one userset level (role membership)', () => {
    const decision = evaluate(
      { orgId: orgA, subject: alice, action: read, resource },
      snap(readConfig, [
        tuple(resource, 'editor', userset(group, 'member')),
        tuple(group, 'member', asSubject(alice)),
      ]),
    );

    expect(decision.effect).toBe('permit');
    const [reason] = decision.reasons;
    expect(reason?.code).toBe('grant.userset');
    expect(reason?.relation).toBe('editor');
    expect(reason?.path).toEqual([
      'document:doc-1#editor@group:eng#member',
      'group:eng#member@user:alice',
    ]);
  });

  it('permits via a computed_userset rewrite (editor implies viewer)', () => {
    const decision = evaluate(
      { orgId: orgA, subject: alice, action: read, resource },
      snap(aliasConfig, [tuple(resource, 'editor', asSubject(alice))]),
    );

    expect(decision.effect).toBe('permit');
    const [reason] = decision.reasons;
    expect(reason?.code).toBe('grant.computed_userset');
    expect(reason?.relation).toBe('viewer');
    expect(reason?.path).toEqual(['document:doc-1#editor@user:alice']);
  });

  it('still permits a direct tuple when the relation also has a computed_userset alias', () => {
    const decision = evaluate(
      { orgId: orgA, subject: alice, action: read, resource },
      snap(aliasConfig, [tuple(resource, 'viewer', asSubject(alice))]),
    );

    expect(decision.effect).toBe('permit');
    expect(decision.reasons[0]?.code).toBe('grant.direct');
  });

  it('denies when a union rewrite has no granting branch', () => {
    const decision = evaluate(
      { orgId: orgA, subject: bob, action: read, resource },
      snap(aliasConfig, [tuple(resource, 'editor', asSubject(alice))]),
    );

    expect(decision.effect).toBe('deny');
    expect(decision.reasons[0]?.code).toBe('default_deny');
  });

  it('permits via a tuple_to_userset rewrite (folder inheritance)', () => {
    const decision = evaluate(
      { orgId: orgA, subject: alice, action: read, resource },
      snap(inheritConfig, [
        tuple(resource, 'parent', asSubject(folder)),
        tuple(folder, 'viewer', asSubject(alice)),
      ]),
    );

    expect(decision.effect).toBe('permit');
    const [reason] = decision.reasons;
    expect(reason?.code).toBe('grant.tuple_to_userset');
    expect(reason?.relation).toBe('viewer');
    expect(reason?.path).toEqual([
      'document:doc-1#parent@folder:f1',
      'folder:f1#viewer@user:alice',
    ]);
  });

  it('does not inherit across a tuple_to_userset hop into another org', () => {
    const decision = evaluate(
      { orgId: orgA, subject: alice, action: read, resource },
      snap(inheritConfig, [
        tuple(resource, 'parent', asSubject(folder)),
        tuple(folder, 'viewer', asSubject(alice), orgB),
      ]),
    );

    expect(decision.effect).toBe('deny');
  });

  it('denies by default when no relationship grants the action', () => {
    const decision = evaluate(
      { orgId: orgA, subject: alice, action: read, resource },
      snap(readConfig, []),
    );

    expect(decision.effect).toBe('deny');
    expect(decision.reasons[0]?.code).toBe('default_deny');
  });

  it('denies an action with no bound relation', () => {
    const decision = evaluate(
      { orgId: orgA, subject: alice, action: Action.of('document.delete'), resource },
      snap(readConfig, [tuple(resource, 'viewer', asSubject(alice))]),
    );

    expect(decision.effect).toBe('deny');
    expect(decision.reasons[0]?.code).toBe('unknown_action');
  });

  it('denies when the namespace is unknown', () => {
    const decision = evaluate(
      { orgId: orgA, subject: alice, action: read, resource },
      snap(null, [tuple(resource, 'viewer', asSubject(alice))]),
    );

    expect(decision.effect).toBe('deny');
    expect(decision.reasons[0]?.code).toBe('unknown_action');
  });

  it('denies when the snapshot org differs from the query org', () => {
    const decision = evaluate(
      { orgId: orgB, subject: alice, action: read, resource },
      snap(readConfig, [tuple(resource, 'viewer', asSubject(alice))], orgA),
    );

    expect(decision.effect).toBe('deny');
    expect(decision.reasons[0]?.code).toBe('org_mismatch');
  });

  it('denies when the namespace definition belongs to another org', () => {
    const foreignNamespace = def(['viewer'], { read: ['viewer'] }, orgB);
    const decision = evaluate(
      { orgId: orgA, subject: alice, action: read, resource },
      snap(foreignNamespace, [tuple(resource, 'viewer', asSubject(alice))], orgA),
    );

    expect(decision.effect).toBe('deny');
    expect(decision.reasons[0]?.code).toBe('org_mismatch');
  });

  it('does not resolve a grant from another org (tuple dropped)', () => {
    const decision = evaluate(
      { orgId: orgA, subject: alice, action: read, resource },
      snap(readConfig, [tuple(resource, 'viewer', asSubject(alice), orgB)], orgA),
    );

    expect(decision.effect).toBe('deny');
    expect(decision.reasons[0]?.code).toBe('default_deny');
  });

  it('does not grant through a nested userset (v1 depth is one level)', () => {
    const groupA: EntityRef = { type: 'group', id: 'a' };
    const groupB: EntityRef = { type: 'group', id: 'b' };
    const decision = evaluate(
      { orgId: orgA, subject: alice, action: read, resource },
      snap(readConfig, [
        tuple(resource, 'viewer', userset(groupA, 'member')),
        tuple(groupA, 'member', userset(groupB, 'member')),
        tuple(groupB, 'member', asSubject(alice)),
      ]),
    );

    expect(decision.effect).toBe('deny');
  });

  it('terminates and denies on a cyclic userset graph', () => {
    const g0: EntityRef = { type: 'group', id: 'g0' };
    const g1: EntityRef = { type: 'group', id: 'g1' };
    const decision = evaluate(
      { orgId: orgA, subject: alice, action: read, resource },
      snap(readConfig, [
        tuple(resource, 'viewer', userset(g0, 'member')),
        tuple(g0, 'member', userset(g1, 'member')),
        tuple(g1, 'member', userset(g0, 'member')),
      ]),
    );

    expect(decision.effect).toBe('deny');
  });

  it('flips to deny when the sole granting tuple is removed', () => {
    const query = { orgId: orgA, subject: alice, action: read, resource };
    expect(
      evaluate(query, snap(readConfig, [tuple(resource, 'viewer', asSubject(alice))])).effect,
    ).toBe('permit');
    expect(evaluate(query, snap(readConfig, [])).effect).toBe('deny');
  });

  it('has no context parameter (ADR-008 invariance by construction)', () => {
    expect(evaluate.length).toBe(2);
  });
});

describe('expand', () => {
  it('expands a relation to its concrete members (direct + one userset)', () => {
    const members = expand(
      orgA,
      resource,
      'viewer',
      snap(readConfig, [
        tuple(resource, 'viewer', asSubject(alice)),
        tuple(resource, 'viewer', userset(group, 'member')),
        tuple(group, 'member', asSubject(bob)),
      ]),
    );

    expect(members).toContainEqual(alice);
    expect(members).toContainEqual(bob);
    expect(members).toHaveLength(2);
  });

  it('returns nothing for another org', () => {
    const members = expand(
      orgB,
      resource,
      'viewer',
      snap(readConfig, [tuple(resource, 'viewer', asSubject(alice))], orgA),
    );

    expect(members).toEqual([]);
  });

  it('agrees with a permit: a permitted subject appears in the relation closure', () => {
    const snapshot = snap(readConfig, [
      tuple(resource, 'editor', userset(group, 'member')),
      tuple(group, 'member', asSubject(alice)),
    ]);

    expect(evaluate({ orgId: orgA, subject: alice, action: read, resource }, snapshot).effect).toBe(
      'permit',
    );
    expect(expand(orgA, resource, 'editor', snapshot)).toContainEqual(alice);
  });

  it('expands a computed_userset alias to both direct and aliased members', () => {
    const members = expand(
      orgA,
      resource,
      'viewer',
      snap(aliasConfig, [
        tuple(resource, 'viewer', asSubject(bob)),
        tuple(resource, 'editor', asSubject(alice)),
      ]),
    );

    expect(members).toContainEqual(alice);
    expect(members).toContainEqual(bob);
    expect(members).toHaveLength(2);
  });

  it('agrees with a computed_userset permit', () => {
    const snapshot = snap(aliasConfig, [tuple(resource, 'editor', asSubject(alice))]);

    expect(evaluate({ orgId: orgA, subject: alice, action: read, resource }, snapshot).effect).toBe(
      'permit',
    );
    expect(expand(orgA, resource, 'viewer', snapshot)).toContainEqual(alice);
  });

  it('expands a tuple_to_userset rewrite through the hierarchy', () => {
    const members = expand(
      orgA,
      resource,
      'viewer',
      snap(inheritConfig, [
        tuple(resource, 'viewer', asSubject(bob)),
        tuple(resource, 'parent', asSubject(folder)),
        tuple(folder, 'viewer', asSubject(alice)),
      ]),
    );

    expect(members).toContainEqual(alice);
    expect(members).toContainEqual(bob);
    expect(members).toHaveLength(2);
  });
});
