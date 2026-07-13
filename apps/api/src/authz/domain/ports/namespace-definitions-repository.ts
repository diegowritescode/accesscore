import { type OrgId } from '../../../shared/kernel/org-id';
import { type Tx } from '../../../shared/persistence/unit-of-work';
import { type NamespaceDefinition } from '../namespace-definition';

export interface NamespaceDefinitionsRepository {
  save(definition: NamespaceDefinition, tx?: Tx): Promise<void>;
  findByNamespace(orgId: OrgId, namespace: string): Promise<NamespaceDefinition | null>;
}

export const NAMESPACE_DEFINITIONS_REPOSITORY = Symbol('NAMESPACE_DEFINITIONS_REPOSITORY');
