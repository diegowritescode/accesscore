import fc from 'fast-check';
import { OrgId } from '../../shared/kernel/org-id';
import { Revision } from '../../shared/kernel/revision';
import { Action } from './action';
import { type AuthorizationQuery } from './authorization-query';
import { type EntityRef } from './entity-ref';
import { evaluate, expand, type EvaluationSnapshot } from './evaluate';
import { NamespaceConfig } from './namespace-config';
import { NamespaceDefinition } from './namespace-definition';
import { NamespaceRegistry } from './namespace-registry';
import { RelationTuple } from './relation-tuple';
import { type SubjectRef } from './subject-ref';
import { TupleIndex } from './tuple-index';

const orgId = OrgId.generate();
const now = new Date('2026-07-12T00:00:00.000Z');

const snapshotOf = (
  namespace: NamespaceDefinition | null,
  tuples: RelationTuple[],
  org = orgId,
): EvaluationSnapshot => ({
  namespaces: NamespaceRegistry.of(namespace ? [namespace] : []),
  tuples: TupleIndex.of(org, tuples),
});

const identifier = fc
  .array(fc.constantFrom(...'abcde'.split('')), { minLength: 1, maxLength: 3 })
  .map((chars) => chars.join(''));

const entityRef: fc.Arbitrary<EntityRef> = fc.record({ type: identifier, id: identifier });

const subjectRef: fc.Arbitrary<SubjectRef> = fc.oneof(
  entityRef.map((ref) => ({ kind: 'subject', ref }) as const),
  fc
    .record({ ref: entityRef, relation: identifier })
    .map(({ ref, relation }) => ({ kind: 'userset', ref, relation }) as const),
);

const tuples = fc.array(
  fc
    .record({ object: entityRef, relation: identifier, subject: subjectRef })
    .map(({ object, relation, subject }) =>
      RelationTuple.write({
        orgId,
        object,
        relation,
        subject,
        revision: Revision.fromValue(0),
        createdAt: now,
      }),
    ),
  { maxLength: 12 },
);

const namespace: fc.Arbitrary<NamespaceDefinition> = fc
  .uniqueArray(identifier, { minLength: 1, maxLength: 4 })
  .chain((relations) =>
    fc
      .dictionary(identifier, fc.subarray(relations, { minLength: 1 }), { maxKeys: 3 })
      .map((actions) => {
        const config = NamespaceConfig.create({ relations, actions });
        if (!config.ok) {
          throw new Error(`unexpected invalid config: ${config.error}`);
        }
        return NamespaceDefinition.define({
          orgId,
          namespace: 'document',
          config: config.value,
          revision: Revision.fromValue(1),
          createdAt: now,
        });
      }),
  );

const query: fc.Arbitrary<AuthorizationQuery> = fc
  .record({ subject: entityRef, verb: identifier, resourceId: identifier })
  .map(({ subject, verb, resourceId }) => ({
    orgId,
    subject,
    action: Action.of(`document.${verb}`),
    resource: { type: 'document', id: resourceId },
  }));

describe('evaluate (properties)', () => {
  it('is total: returns permit or deny and never throws', () => {
    fc.assert(
      fc.property(query, tuples, fc.option(namespace, { nil: null }), (q, ts, ns) => {
        const decision = evaluate(q, snapshotOf(ns, ts));
        expect(['permit', 'deny']).toContain(decision.effect);
      }),
    );
  });

  it('is deterministic for identical inputs', () => {
    fc.assert(
      fc.property(query, tuples, namespace, (q, ts, ns) => {
        const snapshot = snapshotOf(ns, ts);
        expect(evaluate(q, snapshot)).toEqual(evaluate(q, snapshot));
      }),
    );
  });

  it('denies by default when the snapshot holds no tuples', () => {
    fc.assert(
      fc.property(query, namespace, (q, ns) => {
        expect(evaluate(q, snapshotOf(ns, [])).effect).toBe('deny');
      }),
    );
  });

  it('only permits with a grant derivation path (deny-override structure)', () => {
    fc.assert(
      fc.property(query, tuples, namespace, (q, ts, ns) => {
        const decision = evaluate(q, snapshotOf(ns, ts));
        if (decision.effect === 'permit') {
          const [reason] = decision.reasons;
          expect(reason?.code.startsWith('grant.')).toBe(true);
          expect(reason?.relation).toBeDefined();
          expect((reason?.path ?? []).length).toBeGreaterThan(0);
        }
      }),
    );
  });

  it('never resolves across org boundaries', () => {
    const otherOrg = OrgId.generate();
    fc.assert(
      fc.property(query, tuples, namespace, (q, ts, ns) => {
        const decision = evaluate(q, snapshotOf(ns, ts, otherOrg));
        expect(decision.effect).toBe('deny');
      }),
    );
  });

  it('terminates and denies on cyclic userset graphs', () => {
    const config = NamespaceConfig.create({ relations: ['member'], actions: { act: ['member'] } });
    if (!config.ok) {
      throw new Error('unexpected invalid config');
    }
    const ns = NamespaceDefinition.define({
      orgId,
      namespace: 'document',
      config: config.value,
      revision: Revision.fromValue(1),
      createdAt: now,
    });
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 8 }), (n) => {
        const graph: RelationTuple[] = [];
        graph.push(
          RelationTuple.write({
            orgId,
            object: { type: 'document', id: 'doc' },
            relation: 'member',
            subject: { kind: 'userset', ref: { type: 'group', id: 'g0' }, relation: 'member' },
            revision: Revision.fromValue(0),
            createdAt: now,
          }),
        );
        for (let i = 0; i < n; i += 1) {
          graph.push(
            RelationTuple.write({
              orgId,
              object: { type: 'group', id: `g${i}` },
              relation: 'member',
              subject: {
                kind: 'userset',
                ref: { type: 'group', id: `g${(i + 1) % n}` },
                relation: 'member',
              },
              revision: Revision.fromValue(0),
              createdAt: now,
            }),
          );
        }
        const decision = evaluate(
          {
            orgId,
            subject: { type: 'user', id: 'nobody' },
            action: Action.of('document.act'),
            resource: { type: 'document', id: 'doc' },
          },
          snapshotOf(ns, graph),
        );
        expect(decision.effect).toBe('deny');
      }),
    );
  });

  it('is total, deterministic, and check/expand-agreeing under rewrites', () => {
    const config = NamespaceConfig.create({
      relations: ['viewer', 'editor', 'parent'],
      actions: { read: ['viewer'] },
      rewrites: {
        viewer: {
          kind: 'union',
          children: [
            { kind: 'this' },
            { kind: 'computedUserset', relation: 'editor' },
            { kind: 'tupleToUserset', tupleset: 'parent', computedUserset: 'viewer' },
          ],
        },
      },
    });
    if (!config.ok) {
      throw new Error(`unexpected invalid config: ${config.error}`);
    }
    const ns = NamespaceDefinition.define({
      orgId,
      namespace: 'document',
      config: config.value,
      revision: Revision.fromValue(1),
      createdAt: now,
    });

    const containerType = fc.constantFrom('document', 'folder');
    const rewriteRelation = fc.constantFrom('viewer', 'editor', 'parent');
    const rewriteSubject: fc.Arbitrary<SubjectRef> = fc.oneof(
      fc.record({ type: fc.constant('user'), id: identifier }).map((ref) => ({
        kind: 'subject' as const,
        ref,
      })),
      fc.record({ type: containerType, id: identifier }).map((ref) => ({
        kind: 'subject' as const,
        ref,
      })),
      fc
        .record({ type: containerType, id: identifier, relation: rewriteRelation })
        .map(({ type, id, relation }) => ({
          kind: 'userset' as const,
          ref: { type, id },
          relation,
        })),
    );
    const rewriteTuples = fc.array(
      fc
        .record({
          object: fc.record({ type: containerType, id: identifier }),
          relation: rewriteRelation,
          subject: rewriteSubject,
        })
        .map(({ object, relation, subject }) =>
          RelationTuple.write({
            orgId,
            object,
            relation,
            subject,
            revision: Revision.fromValue(0),
            createdAt: now,
          }),
        ),
      { maxLength: 16 },
    );
    const readQuery: fc.Arbitrary<AuthorizationQuery> = fc
      .record({ subjectId: identifier, resourceId: identifier })
      .map(({ subjectId, resourceId }) => ({
        orgId,
        subject: { type: 'user', id: subjectId },
        action: Action.of('document.read'),
        resource: { type: 'document', id: resourceId },
      }));

    fc.assert(
      fc.property(readQuery, rewriteTuples, (q, ts) => {
        const snapshot = snapshotOf(ns, ts);
        const decision = evaluate(q, snapshot);
        expect(['permit', 'deny']).toContain(decision.effect);
        expect(evaluate(q, snapshot)).toEqual(decision);
        const inClosure = expand(orgId, q.resource, 'viewer', snapshot).some(
          (ref) => ref.type === q.subject.type && ref.id === q.subject.id,
        );
        expect(decision.effect === 'permit').toBe(inClosure);
      }),
    );
  });

  it('agrees with expand for the required relation', () => {
    fc.assert(
      fc.property(query, tuples, identifier, (q, ts, relation) => {
        const config = NamespaceConfig.create({
          relations: [relation],
          actions: { [q.action.verb]: [relation] },
        });
        if (!config.ok) {
          throw new Error(`unexpected invalid config: ${config.error}`);
        }
        const ns = NamespaceDefinition.define({
          orgId,
          namespace: 'document',
          config: config.value,
          revision: Revision.fromValue(1),
          createdAt: now,
        });
        const snapshot = snapshotOf(ns, ts);
        const permitted = evaluate(q, snapshot).effect === 'permit';
        const inClosure = expand(orgId, q.resource, relation, snapshot).some(
          (ref) => ref.type === q.subject.type && ref.id === q.subject.id,
        );
        expect(permitted).toBe(inClosure);
      }),
    );
  });
});
