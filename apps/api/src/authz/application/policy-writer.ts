import { type OrgId } from '../../shared/kernel/org-id';
import { type RevisionsRepository } from '../../shared/persistence/revisions-repository';
import { type UnitOfWork } from '../../shared/persistence/unit-of-work';
import { err, ok, type Result } from '../../shared/result';
import { ConsistencyToken } from '../domain/consistency-token';
import { isIdentifier } from '../domain/identifier';
import { type Condition, type ConditionError, parseCondition } from '../domain/policy/condition';
import { ANY_ACTION, type Policy, type PolicyEffect } from '../domain/policy/policy';
import { type PoliciesRepository } from '../domain/ports/policies-repository';

export interface WritePolicyCommand {
  orgId: OrgId;
  id: string;
  effect: PolicyEffect;
  resourceType: string;
  action: string;
  condition: Condition;
}

export type PolicyWriterError = ConditionError | 'invalid_policy';

export const POLICY_WRITER = Symbol('POLICY_WRITER');

export class PolicyWriter {
  constructor(
    private readonly policies: PoliciesRepository,
    private readonly revisions: RevisionsRepository,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async write(command: WritePolicyCommand): Promise<Result<ConsistencyToken, PolicyWriterError>> {
    if (!isIdentifier(command.id) || !isIdentifier(command.resourceType)) {
      return err('invalid_policy');
    }
    if (command.action !== ANY_ACTION && !isIdentifier(command.action)) {
      return err('invalid_policy');
    }
    if (command.effect !== 'permit' && command.effect !== 'forbid') {
      return err('invalid_policy');
    }
    const condition = parseCondition(command.condition);
    if (!condition.ok) {
      return err(condition.error);
    }
    const revision = await this.unitOfWork.withTransaction(async (tx) => {
      const allocated = await this.revisions.allocate(tx);
      const policy: Policy = {
        id: command.id,
        orgId: command.orgId,
        effect: command.effect,
        resourceType: command.resourceType,
        action: command.action,
        condition: condition.value,
        revision: allocated,
      };
      await this.policies.upsert(policy, tx);
      return allocated;
    });
    return ok(ConsistencyToken.fromRevision(revision));
  }

  async delete(orgId: OrgId, id: string): Promise<ConsistencyToken> {
    const revision = await this.unitOfWork.withTransaction(async (tx) => {
      const allocated = await this.revisions.allocate(tx);
      await this.policies.deleteById(orgId, id, tx);
      return allocated;
    });
    return ConsistencyToken.fromRevision(revision);
  }
}
