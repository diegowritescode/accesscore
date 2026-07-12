import { type OrgId } from '../../shared/kernel/org-id';

export interface OrganizationProps {
  id: OrgId;
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateOrganizationInput {
  id: OrgId;
  name: string;
  slug: string;
  now: Date;
}

export class Organization {
  private constructor(private readonly props: OrganizationProps) {}

  static create(input: CreateOrganizationInput): Organization {
    return new Organization({
      id: input.id,
      name: input.name,
      slug: input.slug,
      createdAt: input.now,
      updatedAt: input.now,
    });
  }

  static reconstitute(props: OrganizationProps): Organization {
    return new Organization(props);
  }

  get id(): OrgId {
    return this.props.id;
  }

  get name(): string {
    return this.props.name;
  }

  get slug(): string {
    return this.props.slug;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
