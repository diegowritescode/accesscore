import { bigserial, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const securityAudit = pgTable('security_audit', {
  seq: bigserial('seq', { mode: 'number' }).primaryKey(),
  type: text('type').notNull(),
  orgId: text('org_id'),
  subject: text('subject'),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  prevHash: text('prev_hash').notNull(),
  hash: text('hash').notNull().unique(),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
});
