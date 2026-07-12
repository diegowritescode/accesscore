import { type OrgId } from '../../shared/kernel/org-id';
import { type Revision } from '../../shared/kernel/revision';
import { type Action } from './action';
import { type NamespaceConfig } from './namespace-config';

export interface NamespaceDefinitionProps {
  orgId: OrgId;
  namespace: string;
  config: NamespaceConfig;
  revision: Revision;
  createdAt: Date;
}

export class NamespaceDefinition {
  private constructor(private readonly props: NamespaceDefinitionProps) {}

  static define(props: NamespaceDefinitionProps): NamespaceDefinition {
    return new NamespaceDefinition(props);
  }

  static reconstitute(props: NamespaceDefinitionProps): NamespaceDefinition {
    return new NamespaceDefinition(props);
  }

  get orgId(): OrgId {
    return this.props.orgId;
  }

  get namespace(): string {
    return this.props.namespace;
  }

  get config(): NamespaceConfig {
    return this.props.config;
  }

  get revision(): Revision {
    return this.props.revision;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  requiredRelationsFor(action: Action): readonly string[] {
    if (action.namespace !== this.props.namespace) {
      return [];
    }
    return this.props.config.requiredRelationsForVerb(action.verb);
  }
}
