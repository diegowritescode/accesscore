import { type OrgId } from '../../shared/kernel/org-id';
import { type Revision } from '../../shared/kernel/revision';
import { assertWritableEntityRef, type EntityRef, formatEntityRef } from './entity-ref';
import { isIdentifier } from './identifier';
import { assertWritableSubject, encodeSubject, type SubjectRef } from './subject-ref';

export interface RelationTupleProps {
  orgId: OrgId;
  object: EntityRef;
  relation: string;
  subject: SubjectRef;
  revision: Revision;
  createdAt: Date;
}

export type WriteRelationTupleInput = RelationTupleProps;

export class RelationTuple {
  private constructor(private readonly props: RelationTupleProps) {}

  static write(input: WriteRelationTupleInput): RelationTuple {
    assertWritableEntityRef(input.object);
    if (!isIdentifier(input.relation)) {
      throw new Error(`invalid relation: ${input.relation}`);
    }
    assertWritableSubject(input.subject);
    return new RelationTuple({ ...input });
  }

  static reconstitute(props: RelationTupleProps): RelationTuple {
    return new RelationTuple(props);
  }

  get orgId(): OrgId {
    return this.props.orgId;
  }

  get object(): EntityRef {
    return this.props.object;
  }

  get relation(): string {
    return this.props.relation;
  }

  get subject(): SubjectRef {
    return this.props.subject;
  }

  get revision(): Revision {
    return this.props.revision;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  key(): string {
    return `${formatEntityRef(this.props.object)}#${this.props.relation}@${encodeSubject(this.props.subject)}`;
  }
}
