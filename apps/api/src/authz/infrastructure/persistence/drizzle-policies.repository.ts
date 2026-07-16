import { and, eq } from 'drizzle-orm';
import { type Database, type Executor } from '../../../db/db.module';
import { OrgId } from '../../../shared/kernel/org-id';
import { Revision } from '../../../shared/kernel/revision';
import { type Tx } from '../../../shared/persistence/unit-of-work';
import { type PoliciesRepository } from '../../domain/ports/policies-repository';
import { type Policy, type PolicyEffect } from '../../domain/policy/policy';
import { policies } from './schema';

export class DrizzlePoliciesRepository implements PoliciesRepository {
  constructor(private readonly db: Database) {}

  async upsert(policy: Policy, tx?: Tx): Promise<void> {
    const executor = (tx?.executor as Executor) ?? this.db;
    await executor
      .insert(policies)
      .values({
        id: policy.id,
        orgId: policy.orgId.value,
        effect: policy.effect,
        resourceType: policy.resourceType,
        action: policy.action,
        condition: policy.condition,
        revision: policy.revision.value,
      })
      .onConflictDoUpdate({
        target: policies.id,
        set: {
          orgId: policy.orgId.value,
          effect: policy.effect,
          resourceType: policy.resourceType,
          action: policy.action,
          condition: policy.condition,
          revision: policy.revision.value,
        },
      });
  }

  async deleteById(orgId: OrgId, id: string, tx?: Tx): Promise<boolean> {
    const executor = (tx?.executor as Executor) ?? this.db;
    const result = await executor
      .delete(policies)
      .where(and(eq(policies.orgId, orgId.value), eq(policies.id, id)));
    return (result.rowCount ?? 0) > 0;
  }

  async listByTarget(
    orgId: OrgId,
    resourceType: string,
    action: string,
    tx?: Tx,
  ): Promise<Policy[]> {
    const executor = (tx?.executor as Executor) ?? this.db;
    const rows = await executor
      .select()
      .from(policies)
      .where(
        and(
          eq(policies.orgId, orgId.value),
          eq(policies.resourceType, resourceType),
          eq(policies.action, action),
        ),
      );
    return rows.map((row) => this.toDomain(row));
  }

  private toDomain(row: typeof policies.$inferSelect): Policy {
    return {
      id: row.id,
      orgId: OrgId.fromString(row.orgId),
      effect: row.effect as PolicyEffect,
      resourceType: row.resourceType,
      action: row.action,
      condition: row.condition,
      revision: Revision.fromValue(row.revision),
    };
  }
}
