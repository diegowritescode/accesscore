# ADR-021: Tamper-evident security audit (hash chain)

- **Status:** Accepted (2026-07-19)
- **Date:** 2026-07-19
- Make the security-event trail cryptographically tamper-evident, so any edit or deletion is
  detectable — beyond the DB-level append-only guarantee of ADR-018.

## Context

ADR-018 makes the audit tables append-only **at the database level**: the runtime role holds
`SELECT, INSERT` only, so the application cannot `UPDATE`/`DELETE` a recorded row. That is
strong _prevention_, but it does not _detect_ tampering by an actor who bypasses the runtime
role — a DBA, a compromised migrator credential, a restored-from-backup swap, or direct storage
access. For account-security events (MFA enrolled/activated/disabled, step-up success/failure,
lockout) a regulator or incident responder needs to _prove_ the log was not altered after the
fact. Prevention and detection are complementary, not redundant.

The high-volume `decision_log` (every authorization decision, ADR-004) is deliberately **not**
chained: linking each row to the previous one requires serializing appends (a lock or a
strictly-ordered write), which would throttle the PDP hot path. Chaining belongs on the
low-volume **security-event** stream; the decision log can be Merkle-anchored in bulk later (a
deferred ring) without serializing decisions.

## Decision

Add a dedicated, low-volume **`security_audit`** table with a **SHA-256 hash chain**:

- Each row stores `seq` (bigserial), the event (`type`, `orgId`, `subject`, `payload` jsonb),
  `prev_hash`, `hash`, and `recorded_at`. `hash = SHA-256(prev_hash ‖ "\n" ‖ canonical(record))`
  over a **canonical, key-sorted** serialization of `{type, orgId, subject, payload, recordedAt}`.
  The genesis `prev_hash` is 64 zeros. Each row therefore commits to the entire prefix before it:
  changing or removing any row breaks every subsequent `hash`.
- **Append is serialized** with `pg_advisory_xact_lock` inside the insert transaction, so two
  concurrent appends cannot read the same tail and fork the chain. This lock is affordable
  _because_ the stream is low-volume — the reason it is a separate table from `decision_log`.
- **Verification** re-walks the chain in `seq` order, recomputes each `hash` from the stored
  fields, and reports the first position where the recomputed hash diverges (a modified row) or
  the link breaks (a deleted row). Exposed as an owner-gated `GET /authz/audit/verify`.
- **Double defense.** The same migration applies the ADR-018 `REVOKE UPDATE, DELETE ON
security_audit FROM accesscore_app` (and `PUBLIC`): the runtime role _cannot_ tamper
  (prevention), and if anyone with higher privilege does, the chain _detects_ it (detection).

## Consequences

- Any post-hoc modification or deletion of a security event is detectable by recomputing the
  chain — a provable integrity property mappable to SOC 2 / ISO 27001 audit-log requirements.
- The hash covers a canonical serialization, so verification is independent of JSON key order or
  storage representation.
- Append cost is one advisory lock + a tail read per event; acceptable on the rare security-event
  stream, and deliberately kept off the `decision_log` hot path.
- The chain proves _internal_ consistency; it does not prove the head is current against an
  external observer. Periodically **signing the head** (Vault Transit, ADR-009) or anchoring it
  to an external WORM/transparency log closes that gap and is a deferred ring.
- Emit points start with the MFA lifecycle and step-up; any handler wanting an audited event
  calls the same `AuditLog.append` seam.
