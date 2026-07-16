import { and, asc, eq } from 'drizzle-orm';
import { type Database, type Executor } from '../../../db/db.module';
import { OrgId } from '../../../shared/kernel/org-id';
import { Revision } from '../../../shared/kernel/revision';
import { type Tx } from '../../../shared/persistence/unit-of-work';
import { NamespaceConfig } from '../../domain/namespace-config';
import { NamespaceDefinition } from '../../domain/namespace-definition';
import { type NamespaceDefinitionsRepository } from '../../domain/ports/namespace-definitions-repository';
import { namespaceDefinitions } from './schema';

export class DrizzleNamespaceDefinitionsRepository implements NamespaceDefinitionsRepository {
  constructor(private readonly db: Database) {}

  async save(definition: NamespaceDefinition, tx?: Tx): Promise<void> {
    const executor = (tx?.executor as Executor) ?? this.db;
    await executor
      .insert(namespaceDefinitions)
      .values({
        orgId: definition.orgId.value,
        namespace: definition.namespace,
        config: definition.config.toData(),
        revision: definition.revision.value,
        createdAt: definition.createdAt,
      })
      .onConflictDoUpdate({
        target: [namespaceDefinitions.orgId, namespaceDefinitions.namespace],
        set: { config: definition.config.toData(), revision: definition.revision.value },
      });
  }

  async findByNamespace(
    orgId: OrgId,
    namespace: string,
    tx?: Tx,
  ): Promise<NamespaceDefinition | null> {
    const executor = (tx?.executor as Executor) ?? this.db;
    const rows = await executor
      .select()
      .from(namespaceDefinitions)
      .where(
        and(
          eq(namespaceDefinitions.orgId, orgId.value),
          eq(namespaceDefinitions.namespace, namespace),
        ),
      )
      .limit(1);
    const row = rows[0];
    return row ? this.toDomain(row) : null;
  }

  async listByOrg(orgId: OrgId, tx?: Tx): Promise<NamespaceDefinition[]> {
    const executor = (tx?.executor as Executor) ?? this.db;
    const rows = await executor
      .select()
      .from(namespaceDefinitions)
      .where(eq(namespaceDefinitions.orgId, orgId.value))
      .orderBy(asc(namespaceDefinitions.namespace));
    return rows.map((row) => this.toDomain(row));
  }

  private toDomain(row: typeof namespaceDefinitions.$inferSelect): NamespaceDefinition {
    return NamespaceDefinition.reconstitute({
      orgId: OrgId.fromString(row.orgId),
      namespace: row.namespace,
      config: NamespaceConfig.fromData(row.config),
      revision: Revision.fromValue(row.revision),
      createdAt: row.createdAt,
    });
  }
}
