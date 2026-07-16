import { type OrgId } from '../../../shared/kernel/org-id';
import { type Tx } from '../../../shared/persistence/unit-of-work';
import { type NamespaceDefinition } from '../namespace-definition';

export interface NamespaceDefinitionsRepository {
  save(definition: NamespaceDefinition, tx?: Tx): Promise<void>;
  findByNamespace(orgId: OrgId, namespace: string, tx?: Tx): Promise<NamespaceDefinition | null>;
  listByOrg(orgId: OrgId, tx?: Tx): Promise<NamespaceDefinition[]>;
}

export const NAMESPACE_DEFINITIONS_REPOSITORY = Symbol('NAMESPACE_DEFINITIONS_REPOSITORY');
