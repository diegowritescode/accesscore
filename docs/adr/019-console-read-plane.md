# ADR-019: A read plane for the authorization control plane

- **Status:** Accepted (2026-07-16)
- **Date:** 2026-07-16
- Expose owner-gated read APIs so a console (or any operator) can discover the schema, browse the
  relationship graph, list policies, and probe decisions for arbitrary subjects.

## Context

AccessCore had two HTTP surfaces:

- a **decision plane** — `POST /authz/check`, `batch-check`, `expand`, `simulate` — answers
  "may _this_ principal do _this_?";
- a **write plane** (the PAP, ADR-014) — `PUT /authz/namespaces/:ns`, `POST/DELETE /authz/tuples`,
  `PUT/DELETE /authz/policies/:id` — mutates the model.

There was **no read plane**. Nothing could ask "what namespaces exist?", "what actions does
`document` expose?", "what tuples point at this object?", or "what policies are live?". Every caller
had to already know the model out-of-band. Building the console made this concrete: a user faced blank
text fields with no way to discover valid inputs. A control plane that you can only write to blindly is
not operable — the missing capability was a _directory_ over the model the write plane already stores.

`check` also only ever evaluates **as the authenticated principal** (ADR-008 — the PDP never trusts a
caller-supplied subject on the enforcement path). That is correct for enforcement, but it leaves an
owner unable to answer "could _bob_ read this?" without impersonation — a legitimate operator question
with no safe endpoint.

## Decision

Add a **read plane** as a distinct, owner-gated, read-only surface. All of it lives behind
`AccessTokenGuard + PapAdminGuard` (owner role, ADR-014) and is tenant-scoped to the caller's org.

- **`GET /authz/namespaces`**, **`GET /authz/namespaces/:namespace`** — the schema: relations,
  action→relation bindings, and userset rewrites, read straight from the stored `NamespaceConfig`.
- **`GET /authz/tuples`** — browse the **stored** relationship graph, filtered by namespace, object,
  relation, or subject, ordered and paginated (`limit`/`offset`, capped). This is the raw tuple set,
  explicitly _not_ the resolved closure (that is what `expand` is for).
- **`GET /authz/policies`** — the live ABAC policies with their effect, target, and condition AST.
- **`POST /authz/check-as`** — evaluate a decision for an **arbitrary subject**. It does not run the
  enforcement path: it reuses `PdpService.simulate(principal, …, overlay=null)`, which is already
  read-only — it writes **no decision log** and allocates **no revision**. ADR-008 is preserved because
  this is a separate owner-gated directory tool, never reachable from `check`.

Reads are served by a new application service (`AuthzDirectoryService`) over the existing repository
ports, extended with `listByOrg` (namespaces, policies) and a filtered/paginated `list` (tuples). A
dedicated `DirectoryController` keeps the read surface separate from the decision controller.

Every read path **fails closed**: a store error surfaces as `503`, never a partial or fabricated
answer.

## Consequences

- The console (and any operator tooling) can now discover the model instead of guessing it. Form
  inputs become populated dropdowns; the relationship graph and policy set are browsable; `check-as`
  turns "could bob read this?" into a first-class, auditable query.
- No new tables or migration — the read plane is pure query surface over the existing
  `namespace_definitions`, `relation_tuples`, and `policies` stores.
- The owner gate is deliberately conservative: schema, tuples, and policies can leak the shape of an
  org's access model, so listing them is an owner capability, not a member one. Narrowing this to a
  dedicated read-only role is possible later without changing the contract.
- `check-as` accepts an optional assurance level so an owner can probe ABAC conditions
  (`principal.aal`) under different assumptions; it defaults to `1`. It never confers the target
  subject's session or identity — only their relationship/policy position is evaluated.
