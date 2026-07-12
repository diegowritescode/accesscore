import {
  bigint,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { organizations } from '../../../tenancy/infrastructure/persistence/schema';
import { type NamespaceConfigData } from '../../domain/namespace-config';

export const relationTuples = pgTable(
  'relation_tuples',
  {
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    namespace: text('namespace').notNull(),
    objectId: text('object_id').notNull(),
    relation: text('relation').notNull(),
    subject: text('subject').notNull(),
    revision: bigint('revision', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.orgId, table.namespace, table.objectId, table.relation, table.subject],
    }),
    index('relation_tuples_subject_idx').on(table.orgId, table.subject),
    index('relation_tuples_revision_idx').on(table.revision),
  ],
);

export const namespaceDefinitions = pgTable(
  'namespace_definitions',
  {
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    namespace: text('namespace').notNull(),
    config: jsonb('config').$type<NamespaceConfigData>().notNull(),
    revision: bigint('revision', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.orgId, table.namespace] }),
    index('namespace_definitions_revision_idx').on(table.revision),
  ],
);
