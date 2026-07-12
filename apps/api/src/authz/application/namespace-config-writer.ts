import { type Clock } from '../../shared/kernel/clock';
import { type OrgId } from '../../shared/kernel/org-id';
import { type RevisionsRepository } from '../../shared/persistence/revisions-repository';
import { type UnitOfWork } from '../../shared/persistence/unit-of-work';
import { err, ok, type Result } from '../../shared/result';
import { ConsistencyToken } from '../domain/consistency-token';
import { isIdentifier } from '../domain/identifier';
import {
  NamespaceConfig,
  type NamespaceConfigData,
  type NamespaceConfigError,
} from '../domain/namespace-config';
import { NamespaceDefinition } from '../domain/namespace-definition';
import { type NamespaceDefinitionsRepository } from '../domain/ports/namespace-definitions-repository';

export interface DefineNamespaceCommand {
  orgId: OrgId;
  namespace: string;
  config: NamespaceConfigData;
}

export type DefineNamespaceError = NamespaceConfigError | 'invalid_namespace';

export const NAMESPACE_CONFIG_WRITER = Symbol('NAMESPACE_CONFIG_WRITER');

export class NamespaceConfigWriter {
  constructor(
    private readonly definitions: NamespaceDefinitionsRepository,
    private readonly revisions: RevisionsRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  async define(
    command: DefineNamespaceCommand,
  ): Promise<Result<ConsistencyToken, DefineNamespaceError>> {
    if (!isIdentifier(command.namespace)) {
      return err('invalid_namespace');
    }
    const config = NamespaceConfig.create(command.config);
    if (!config.ok) {
      return err(config.error);
    }
    const createdAt = this.clock.now();
    const revision = await this.unitOfWork.withTransaction(async (tx) => {
      const allocated = await this.revisions.allocate(tx);
      const definition = NamespaceDefinition.define({
        orgId: command.orgId,
        namespace: command.namespace,
        config: config.value,
        revision: allocated,
        createdAt,
      });
      await this.definitions.save(definition, tx);
      return allocated;
    });
    return ok(ConsistencyToken.fromRevision(revision));
  }
}
