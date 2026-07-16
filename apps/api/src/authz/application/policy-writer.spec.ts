import { OrgId } from '../../shared/kernel/org-id';
import { Revision } from '../../shared/kernel/revision';
import { type RevisionsRepository } from '../../shared/persistence/revisions-repository';
import { type Tx, type UnitOfWork } from '../../shared/persistence/unit-of-work';
import { type Condition } from '../domain/policy/condition';
import { type Policy, type PolicyEffect } from '../domain/policy/policy';
import { type PoliciesRepository } from '../domain/ports/policies-repository';
import { PolicyWriter, type WritePolicyCommand } from './policy-writer';

class SingleTxUnitOfWork implements UnitOfWork {
  readonly tx: Tx = { executor: Symbol('tx') };

  withTransaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    return work(this.tx);
  }
}

class RecordingRevisions implements RevisionsRepository {
  count = 0;

  allocate(): Promise<Revision> {
    this.count += 1;
    return Promise.resolve(Revision.fromValue(this.count));
  }

  current(): Promise<Revision> {
    return Promise.resolve(Revision.fromValue(this.count));
  }
}

class RecordingRepo implements PoliciesRepository {
  readonly saved: Policy[] = [];
  readonly deleted: string[] = [];

  upsert(policy: Policy): Promise<void> {
    this.saved.push(policy);
    return Promise.resolve();
  }

  deleteById(_orgId: OrgId, id: string): Promise<boolean> {
    this.deleted.push(id);
    return Promise.resolve(true);
  }

  listByTarget(): Promise<Policy[]> {
    return Promise.resolve([]);
  }

  listByOrg(): Promise<Policy[]> {
    return Promise.resolve(this.saved);
  }
}

describe('PolicyWriter', () => {
  const orgId = OrgId.generate();
  const validCondition: Condition = {
    kind: 'cmp',
    op: 'ge',
    left: { kind: 'attr', path: 'principal.aal' },
    right: { kind: 'lit', value: 1 },
  };
  const baseCommand: WritePolicyCommand = {
    orgId,
    id: 'require-mfa',
    effect: 'permit',
    resourceType: 'document',
    action: 'read',
    condition: validCondition,
  };

  let repo: RecordingRepo;
  let revisions: RecordingRevisions;
  let writer: PolicyWriter;

  beforeEach(() => {
    repo = new RecordingRepo();
    revisions = new RecordingRevisions();
    writer = new PolicyWriter(repo, revisions, new SingleTxUnitOfWork());
  });

  it('validates, persists at an allocated revision, and returns the zookie', async () => {
    const result = await writer.write(baseCommand);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(repo.saved).toHaveLength(1);
    expect(repo.saved[0]?.id).toBe('require-mfa');
    expect(repo.saved[0]?.effect).toBe('permit');
    expect(repo.saved[0]?.condition).toEqual(validCondition);
    expect(repo.saved[0]?.revision.value).toBe(1);
    expect(result.value.revision.value).toBe(1);
  });

  it('accepts the wildcard action', async () => {
    const result = await writer.write({ ...baseCommand, action: '*' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(repo.saved[0]?.action).toBe('*');
  });

  it('rejects an invalid id without touching the store', async () => {
    const result = await writer.write({ ...baseCommand, id: 'bad id' });

    expect(result).toEqual({ ok: false, error: 'invalid_policy' });
    expect(repo.saved).toHaveLength(0);
    expect(revisions.count).toBe(0);
  });

  it('rejects an invalid resource type without touching the store', async () => {
    const result = await writer.write({ ...baseCommand, resourceType: 'bad type' });

    expect(result).toEqual({ ok: false, error: 'invalid_policy' });
    expect(repo.saved).toHaveLength(0);
  });

  it('rejects an invalid action without touching the store', async () => {
    const result = await writer.write({ ...baseCommand, action: 'bad action' });

    expect(result).toEqual({ ok: false, error: 'invalid_policy' });
    expect(repo.saved).toHaveLength(0);
  });

  it('rejects an unknown effect without touching the store', async () => {
    const result = await writer.write({ ...baseCommand, effect: 'audit' as PolicyEffect });

    expect(result).toEqual({ ok: false, error: 'invalid_policy' });
    expect(repo.saved).toHaveLength(0);
  });

  it('rejects a malformed condition and returns the ConditionError', async () => {
    const badCondition: Condition = {
      kind: 'cmp',
      op: 'gt',
      left: { kind: 'attr', path: 'env.ip' },
      right: { kind: 'lit', value: 1 },
    };
    const result = await writer.write({ ...baseCommand, condition: badCondition });

    expect(result).toEqual({ ok: false, error: 'type_mismatch' });
    expect(repo.saved).toHaveLength(0);
  });

  it('delete allocates a revision and returns the zookie', async () => {
    const zookie = await writer.delete(orgId, 'require-mfa');

    expect(zookie.revision.value).toBe(1);
    expect(repo.deleted).toEqual(['require-mfa']);
  });
});
