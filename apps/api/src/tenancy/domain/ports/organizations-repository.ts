import { type OrgId } from '../../../shared/kernel/org-id';
import { type Tx } from '../../../shared/persistence/unit-of-work';
import { type Organization } from '../organization';

export interface OrganizationsRepository {
  create(organization: Organization, tx?: Tx): Promise<void>;
  findById(id: OrgId): Promise<Organization | null>;
}

export const ORGANIZATIONS_REPOSITORY = Symbol('ORGANIZATIONS_REPOSITORY');
