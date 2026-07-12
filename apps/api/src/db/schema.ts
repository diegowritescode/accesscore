import { bigserial, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const appMeta = pgTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const revisions = pgTable('revisions', {
  revision: bigserial('revision', { mode: 'number' }).primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
