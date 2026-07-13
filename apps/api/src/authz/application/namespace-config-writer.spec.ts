import { OrgId } from '../../shared/kernel/org-id';
import { Revision } from '../../shared/kernel/revision';
import { type RevisionsRepository } from '../../shared/persistence/revisions-repository';
import { type Tx, type UnitOfWork } from '../../shared/persistence/unit-of-work';
import { type NamespaceDefinition } from '../domain/namespace-definition';
import { type NamespaceDefinitionsRepository } from '../domain/ports/namespace-definitions-repository';
import { NamespaceConfigWriter } from './namespace-config-writer';

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
}

class RecordingRepo implements NamespaceDefinitionsRepository {
  readonly saved: NamespaceDefinition[] = [];

  save(definition: NamespaceDefinition): Promise<void> {
    this.saved.push(definition);
    return Promise.resolve();
  }

  findByNamespace(): Promise<NamespaceDefinition | null> {
    return Promise.resolve(null);
  }
}

describe('NamespaceConfigWriter', () => {
  const orgId = OrgId.generate();
  const now = new Date('2026-07-12T00:00:00.000Z');
  const validConfig = { relations: ['viewer'], actions: { read: ['viewer'] } };

  let repo: RecordingRepo;
  let revisions: RecordingRevisions;
  let writer: NamespaceConfigWriter;

  beforeEach(() => {
    repo = new RecordingRepo();
    revisions = new RecordingRevisions();
    writer = new NamespaceConfigWriter(repo, revisions, new SingleTxUnitOfWork(), {
      now: () => now,
    });
  });

  it('validates, persists at an allocated revision, and returns the zookie', async () => {
    const result = await writer.define({ orgId, namespace: 'document', config: validConfig });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(repo.saved).toHaveLength(1);
    expect(repo.saved[0]?.namespace).toBe('document');
    expect(repo.saved[0]?.revision.value).toBe(1);
    expect(repo.saved[0]?.createdAt).toEqual(now);
    expect(result.value.revision.value).toBe(1);
  });

  it('rejects an invalid namespace name without touching the store', async () => {
    const result = await writer.define({ orgId, namespace: 'bad name', config: validConfig });

    expect(result).toEqual({ ok: false, error: 'invalid_namespace' });
    expect(repo.saved).toHaveLength(0);
    expect(revisions.count).toBe(0);
  });

  it('rejects an invalid config without touching the store', async () => {
    const result = await writer.define({
      orgId,
      namespace: 'document',
      config: { relations: ['viewer'], actions: { read: ['editor'] } },
    });

    expect(result).toEqual({ ok: false, error: 'unknown_relation' });
    expect(repo.saved).toHaveLength(0);
    expect(revisions.count).toBe(0);
  });
});
