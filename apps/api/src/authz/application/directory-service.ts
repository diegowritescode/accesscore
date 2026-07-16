import { type OrgId } from '../../shared/kernel/org-id';
import { type Condition } from '../domain/policy/condition';
import { type PolicyEffect } from '../domain/policy/policy';
import { type NamespaceDefinitionsRepository } from '../domain/ports/namespace-definitions-repository';
import { type PoliciesRepository } from '../domain/ports/policies-repository';
import { type RelationTupleStore, type TupleFilter } from '../domain/ports/relation-tuple-store';
import { type SubjectRef } from '../domain/subject-ref';
import { type Userset } from '../domain/userset';

export interface NamespaceSummaryView {
  readonly namespace: string;
  readonly relations: string[];
  readonly actions: string[];
  readonly revision: number;
}

export interface NamespaceDetailView {
  readonly namespace: string;
  readonly relations: string[];
  readonly actions: Record<string, string[]>;
  readonly rewrites: Record<string, Userset>;
  readonly revision: number;
}

export interface SubjectView {
  readonly type: string;
  readonly id: string;
  readonly relation?: string;
}

export interface TupleView {
  readonly object: { type: string; id: string };
  readonly relation: string;
  readonly subject: SubjectView;
  readonly revision: number;
}

export interface PolicyView {
  readonly id: string;
  readonly effect: PolicyEffect;
  readonly resourceType: string;
  readonly action: string;
  readonly condition: Condition;
  readonly revision: number;
}

export interface TupleQuery {
  readonly namespace?: string;
  readonly objectId?: string;
  readonly relation?: string;
  readonly subject?: SubjectView;
  readonly limit: number;
  readonly offset: number;
}

const toSubjectRef = (subject: SubjectView): SubjectRef =>
  subject.relation !== undefined
    ? { kind: 'userset', ref: { type: subject.type, id: subject.id }, relation: subject.relation }
    : { kind: 'subject', ref: { type: subject.type, id: subject.id } };

const fromSubjectRef = (subject: SubjectRef): SubjectView =>
  subject.kind === 'userset'
    ? { type: subject.ref.type, id: subject.ref.id, relation: subject.relation }
    : { type: subject.ref.type, id: subject.ref.id };

export const AUTHZ_DIRECTORY = Symbol('AUTHZ_DIRECTORY');

export class AuthzDirectoryService {
  constructor(
    private readonly namespaces: NamespaceDefinitionsRepository,
    private readonly tuples: RelationTupleStore,
    private readonly policies: PoliciesRepository,
  ) {}

  async listNamespaces(orgId: OrgId): Promise<NamespaceSummaryView[]> {
    const definitions = await this.namespaces.listByOrg(orgId);
    return definitions.map((definition) => {
      const data = definition.config.toData();
      return {
        namespace: definition.namespace,
        relations: data.relations,
        actions: Object.keys(data.actions),
        revision: definition.revision.value,
      };
    });
  }

  async getNamespace(orgId: OrgId, namespace: string): Promise<NamespaceDetailView | null> {
    const definition = await this.namespaces.findByNamespace(orgId, namespace);
    if (!definition) {
      return null;
    }
    const data = definition.config.toData();
    return {
      namespace: definition.namespace,
      relations: data.relations,
      actions: data.actions,
      rewrites: data.rewrites ?? {},
      revision: definition.revision.value,
    };
  }

  async listTuples(orgId: OrgId, query: TupleQuery): Promise<TupleView[]> {
    const filter: TupleFilter = {
      orgId,
      namespace: query.namespace,
      objectId: query.objectId,
      relation: query.relation,
      subject: query.subject ? toSubjectRef(query.subject) : undefined,
      limit: query.limit,
      offset: query.offset,
    };
    const tuples = await this.tuples.list(filter);
    return tuples.map((tuple) => ({
      object: { type: tuple.object.type, id: tuple.object.id },
      relation: tuple.relation,
      subject: fromSubjectRef(tuple.subject),
      revision: tuple.revision.value,
    }));
  }

  async listPolicies(orgId: OrgId): Promise<PolicyView[]> {
    const policies = await this.policies.listByOrg(orgId);
    return policies.map((policy) => ({
      id: policy.id,
      effect: policy.effect,
      resourceType: policy.resourceType,
      action: policy.action,
      condition: policy.condition,
      revision: policy.revision.value,
    }));
  }
}
