import { type Clock } from '../../shared/kernel/clock';
import { type OrgId } from '../../shared/kernel/org-id';
import { type RevisionsRepository } from '../../shared/persistence/revisions-repository';
import { type UnitOfWork } from '../../shared/persistence/unit-of-work';
import { ConsistencyToken } from '../domain/consistency-token';
import { type EntityRef } from '../domain/entity-ref';
import { type RelationTupleChangelog } from '../domain/ports/relation-tuple-changelog';
import { type RelationTupleStore } from '../domain/ports/relation-tuple-store';
import { RelationTuple } from '../domain/relation-tuple';
import { type SubjectRef } from '../domain/subject-ref';

export interface RelationTupleCommand {
  orgId: OrgId;
  object: EntityRef;
  relation: string;
  subject: SubjectRef;
}

export const RELATION_TUPLE_WRITER = Symbol('RELATION_TUPLE_WRITER');

export class RelationTupleWriter {
  constructor(
    private readonly tuples: RelationTupleStore,
    private readonly revisions: RevisionsRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly clock: Clock,
    private readonly changelog: RelationTupleChangelog,
  ) {}

  async write(command: RelationTupleCommand): Promise<ConsistencyToken> {
    const recordedAt = this.clock.now();
    const revision = await this.unitOfWork.withTransaction(async (tx) => {
      const allocated = await this.revisions.allocate(tx);
      const tuple = RelationTuple.write({
        orgId: command.orgId,
        object: command.object,
        relation: command.relation,
        subject: command.subject,
        revision: allocated,
        createdAt: recordedAt,
      });
      await this.tuples.upsert(tuple, tx);
      await this.changelog.append(
        {
          orgId: command.orgId,
          revision: allocated,
          op: 'upsert',
          object: command.object,
          relation: command.relation,
          subject: command.subject,
          recordedAt,
        },
        tx,
      );
      return allocated;
    });
    return ConsistencyToken.fromRevision(revision);
  }

  async revoke(command: RelationTupleCommand): Promise<ConsistencyToken> {
    const recordedAt = this.clock.now();
    const revision = await this.unitOfWork.withTransaction(async (tx) => {
      const allocated = await this.revisions.allocate(tx);
      const removed = await this.tuples.delete(
        {
          orgId: command.orgId,
          object: command.object,
          relation: command.relation,
          subject: command.subject,
        },
        tx,
      );
      if (removed > 0) {
        await this.changelog.append(
          {
            orgId: command.orgId,
            revision: allocated,
            op: 'delete',
            object: command.object,
            relation: command.relation,
            subject: command.subject,
            recordedAt,
          },
          tx,
        );
      }
      return allocated;
    });
    return ConsistencyToken.fromRevision(revision);
  }
}
