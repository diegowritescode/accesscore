# ADR-018: Least-privilege runtime database role

- **Status:** Accepted (2026-07-16)
- **Date:** 2026-07-16
- Make the append-only audit and revision changelog tamper-resistant **at runtime**.

## Context

The `decision_log` (every authorization decision) and `revisions` (the commit-ordered global
changelog, ADR-004) are **append-only by design** — the application only ever inserts into them. But
that guarantee lived only in application code. The API connected to Postgres as the database owner (the
single role a managed database hands you), and an owner **bypasses** table grants — so a bug, a misused
connection, or a compromised process could have issued `UPDATE`/`DELETE` against the audit trail. The
DB-level append-only enforcement was tracked as deferred (it needed a role model).

## Decision

Split the database identity in two:

- **Migrator** — the owning/admin role. Runs DDL migrations only, via a dedicated
  `MIGRATION_DATABASE_URL`. Never serves requests.
- **`accesscore_app`** — the runtime role the API connects as (`DATABASE_URL`). It is **not** the table
  owner, so `REVOKE` binds it. Migration 0012 grants it `SELECT, INSERT, UPDATE, DELETE` on the tables
  the API legitimately mutates (sessions, tuples, tokens, memberships, …) and then **`REVOKE UPDATE,
DELETE ON decision_log, revisions`** — the two append-only tables it may only read and append to.
  `ALTER DEFAULT PRIVILEGES` extends the grants to tables added by later migrations (e.g. the ABAC
  `policies` store), so this need not be repeated per migration.

The grant migration is **idempotent and environment-uniform**: it provisions the role `NOLOGIN` if
absent (local/CI keep using the single owner role, so `accesscore_app` exists but is unused) and
otherwise only re-applies grants. **No password ever lives in a migration** — in production the deployer
creates the role `WITH LOGIN PASSWORD` out-of-band and wires the two connection strings. `migrate.ts`
uses `MIGRATION_DATABASE_URL ?? DATABASE_URL`, so a single-role setup still works unchanged.

## Consequences

- The append-only guarantee on the **audit trail and revision changelog now binds the running
  application**, not merely `PUBLIC`. A compromised app connection cannot rewrite or delete a recorded
  decision or a revision — it is denied (`42501`). This is the DB-level backstop under the
  tamper-evident audit planned for Slice 6.
- An integration test proves it: connecting as `accesscore_app`, `UPDATE`/`DELETE` on `decision_log`
  is refused while a mutable table (e.g. `sessions`) still accepts them.
- Production requires a one-time setup (create the role, set both connection strings) — documented in
  [deploy-dokploy.md](../deploy-dokploy.md).
- The migrator role remains powerful; that is inherent to running migrations, mitigated by it never
  serving traffic. Scope is deliberately the append-only tables; broader per-table tightening is
  possible later but is not the security-critical gap this ADR closes.
