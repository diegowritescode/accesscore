import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../../../identity/infrastructure/persistence/schema';
import { organizations } from '../../../tenancy/infrastructure/persistence/schema';

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    status: text('status').notNull().default('active'),
    orgId: uuid('org_id').references(() => organizations.id),
    aal: integer('aal').notNull().default(1),
    authTime: timestamp('auth_time', { withTimezone: true }).notNull().defaultNow(),
    deviceLabel: text('device_label'),
    userAgent: text('user_agent'),
    ip: text('ip'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [index('sessions_user_id_idx').on(table.userId)],
);

export const tokenFamilies = pgTable(
  'token_families',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedReason: text('revoked_reason'),
  },
  (table) => [index('token_families_session_id_idx').on(table.sessionId)],
);

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey(),
    familyId: uuid('family_id')
      .notNull()
      .references(() => tokenFamilies.id),
    tokenHash: text('token_hash').notNull().unique(),
    generation: integer('generation').notNull(),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
  },
  (table) => [index('refresh_tokens_family_id_idx').on(table.familyId)],
);
