import { type Clock } from '../../shared/kernel/clock';
import { type OrgId } from '../../shared/kernel/org-id';
import { type RevisionsRepository } from '../../shared/persistence/revisions-repository';
import { type UnitOfWork } from '../../shared/persistence/unit-of-work';
import { ConsistencyToken } from '../domain/consistency-token';
import { type EntityRef } from '../domain/entity-ref';
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
  ) {}

  async write(command: RelationTupleCommand): Promise<ConsistencyToken> {
    const createdAt = this.clock.now();
    const revision = await this.unitOfWork.withTransaction(async (tx) => {
      const allocated = await this.revisions.allocate(tx);
      const tuple = RelationTuple.write({
        orgId: command.orgId,
        object: command.object,
        relation: command.relation,
        subject: command.subject,
        revision: allocated,
        createdAt,
      });
      await this.tuples.upsert(tuple, tx);
      return allocated;
    });
    return ConsistencyToken.fromRevision(revision);
  }

  async revoke(command: RelationTupleCommand): Promise<ConsistencyToken> {
    const revision = await this.unitOfWork.withTransaction(async (tx) => {
      const allocated = await this.revisions.allocate(tx);
      await this.tuples.delete(
        {
          orgId: command.orgId,
          object: command.object,
          relation: command.relation,
          subject: command.subject,
        },
        tx,
      );
      return allocated;
    });
    return ConsistencyToken.fromRevision(revision);
  }
}
