# AccessCore — API

The HTTP surface shipped today (Slices 0–3), verified against the controllers in
`apps/api/src/**/interface/*.controller.ts`, plus the published SDK. Everything not listed here
(the admin/PAP API for authoring namespaces, tuples, roles, and policies; OIDC endpoints; MFA
enrolment) is **planned** — see [scope-and-roadmap.md](scope-and-roadmap.md).

Conventions:

- All request/response bodies are JSON. Requests are validated with Zod; a malformed body is
  rejected before any work is done.
- Errors use **RFC 7807-style problem details** (`{ type, title, status, detail? }`) with the
  matching HTTP status. Success payloads are the plain shapes shown below.
- `Authorization: Bearer <access_token>` is required where noted. The access token is a
  short-lived asymmetric (EdDSA) JWT; verifiers fetch keys from `GET /.well-known/jwks.json`.
- Rate limiting is per-IP (global default from `THROTTLE_LIMIT`/`THROTTLE_TTL_SECONDS`, tighter
  on `login`/`refresh`); throttled requests get `429`.

## Health

| Method | Path      | Auth | Success                  | Notes                                         |
| ------ | --------- | ---- | ------------------------ | --------------------------------------------- |
| `GET`  | `/health` | none | `200 {"status":"ok"}`    | Liveness — always cheap.                      |
| `GET`  | `/ready`  | none | `200 {"status":"ready"}` | Readiness — runs `SELECT 1` against Postgres. |

## Authentication & account lifecycle

Base path `/auth`. Anti-enumeration: `register`, `forgot-password`, and (invalid-token)
`login`/`refresh` responses never reveal whether an email or token exists.

### `POST /auth/register`

Create a pending user and queue an email-verification token.

- Request: `{ "email": string, "password": string }`
- `202 Accepted` → `{ "status": "accepted" }`
- `422` problem details on an invalid email/password.

### `POST /auth/verify-email`

- Request: `{ "token": string }` (the raw verification token)
- `200 OK` → `{ "status": "verified" }`
- `400` on an invalid or expired token.

### `POST /auth/forgot-password`

Request a password reset. Always accepted (no enumeration).

- Request: `{ "email": string }`
- `202 Accepted` → `{ "status": "accepted" }`

### `POST /auth/reset-password`

- Request: `{ "token": string, "password": string }`
- `200 OK` → `{ "status": "reset" }`
- `422` on an invalid new password; `400` on an invalid or expired reset token. Resetting
  revokes the user's sessions/token families.

### `POST /auth/login`

Verify credentials and issue a session + token pair. Throttled to 20/min per IP.

- Request: `{ "email": string, "password": string }`
- `200 OK`:

  ```json
  {
    "access_token": "<jwt>",
    "refresh_token": "<opaque>",
    "token_type": "Bearer",
    "expires_in": 900
  }
  ```

- `401` (generic "Invalid credentials") on any failure — wrong password, unknown user, or an
  unverified/suspended account — so the response never distinguishes them.

The access-token claims are `sub` (user id), `sid` (session id), `org` (active org id or
`null`), `aal` (authenticator assurance level), `jti`, plus `iss`/`aud`/`exp`/`nbf`. `org` is
resolved server-side from membership at login; a user with no membership gets `org: null`.

### `POST /auth/refresh`

Rotate a refresh token. Throttled to 20/min per IP. Presenting an already-rotated token triggers
**reuse detection**: the whole token family is revoked.

- Request: `{ "refresh_token": string }`
- `200 OK` → same token-pair shape as login.
- `401` ("Invalid refresh token") on an unknown, expired, rotated, or revoked token.

### `POST /auth/logout`

Requires a valid access token. Revokes the current session (adds its `sid` to the Redis
blocklist and revokes its token families).

- `204 No Content`.

### `POST /auth/logout-all`

Requires a valid access token. Revokes every session for the caller.

- `204 No Content`.

### `GET /auth/sessions`

Requires a valid access token. Lists the caller's active sessions (scoped to the caller;
another user's session ids are simply absent).

- `200 OK`:

  ```json
  {
    "sessions": [
      {
        "id": "…",
        "deviceLabel": null,
        "userAgent": "…",
        "ip": "…",
        "createdAt": "2026-07-12T10:00:00.000Z",
        "lastSeenAt": "2026-07-12T10:05:00.000Z",
        "current": true
      }
    ]
  }
  ```

### `DELETE /auth/sessions/:id`

Requires a valid access token. Revokes one of the caller's sessions.

- `204 No Content` on success.
- `404` ("Session not found") if the id is unknown or belongs to another user — so it cannot be
  used to probe other users' session ids.

## JWKS

### `GET /.well-known/jwks.json`

Public. Returns the live signing keys as JWKs so any verifier can validate access tokens
offline.

- `200 OK` → `{ "keys": [ { "kty": "OKP", "crv": "Ed25519", "kid": "…", "alg": "EdDSA", "x": "…" }, … ] }`
- Sends `Cache-Control: public, max-age=<JWKS_CACHE_MAX_AGE>`. Each `kid` is bound to exactly one
  `alg`; verifiers must enforce the JWK's `alg`, never the token header's.

## Authorization

### `POST /authz/check`

The Policy Decision Point. Requires a valid access token; the principal
(`subject`/`org`/`aal`/`sid`) is derived **entirely from the verified token** — the body carries
only what is being asked, never who is asking (the [ADR-008](adr/008-pdp-trust-model.md)
provenance rule, enforced by construction: the DTO has no `subject`/`org` field).

- Request:

  ```json
  {
    "action": "document.read",
    "resource": { "type": "document", "id": "doc-1" },
    "consistency_token": "<zookie>"
  }
  ```

  - `action` — a namespaced verb, `1–128` chars (validated as an `Action` value object; an
    unparseable verb is a `400`).
  - `resource.type` — `1–64` chars; `resource.id` — `1–256` chars.
  - `consistency_token` _(optional)_ — an opaque zookie from a prior write; means "evaluate
    against data at least as fresh as this revision." Omitting it selects **full consistency**
    (the strongest, safest default). A malformed token is a `400`.

- `200 OK` → a `Decision`:

  ```json
  { "effect": "permit", "reasons": [{ "code": "grant.direct", "message": "…" }] }
  ```

  `effect` is `"permit"` or `"deny"`. `reasons` explain the outcome; the reason `code`
  vocabulary (from `@accesscore/contracts` and the evaluator):

  | code                      | meaning                                                           |
  | ------------------------- | ----------------------------------------------------------------- |
  | `grant.direct`            | a direct relationship tuple granted access                        |
  | `grant.userset`           | a one-level userset (role/group) membership granted access        |
  | `default_deny`            | no matching grant (the default)                                   |
  | `unknown_action`          | the action is not bound to a relation in the resource's namespace |
  | `org_mismatch`            | the resource/tuple org did not match the principal's org          |
  | `no_org_context`          | the principal's token carries no active org                       |
  | `consistency_unavailable` | the store has not yet caught up to the requested zookie           |

- Status semantics:
  - `401` — missing/invalid/expired token, or the `sid` is on the revocation blocklist
    (fail-closed).
  - `200` with `effect: "deny"` — the caller is authenticated but not authorized. Authorization
    failure is a **decision**, not an HTTP error.
  - `400` — a malformed query (bad action, missing resource, or a malformed consistency token).
  - `503` — the PDP or its store errored; the endpoint **fails closed** (never returns a stale
    or optimistic allow).

**Note.** There is deliberately no `/authz/documents/:id` (or similar) resource endpoint; the
protected-resource demo used by the `@RequirePermission` tests lives in an e2e fixture
(`apps/api/test/support/protected-resource.fixture.ts`), not the shipped API.

## SDK — `@diegowritescode/accesscore-sdk`

A zero-workspace-dependency typed client plus an optional NestJS Policy Enforcement Point. It
mirrors the in-process `@RequirePermission` guard so downstream services enforce authorization
the same way AccessCore does internally ([ADR-013](adr/013-cross-service-authorization-contract.md)).

### Direct client

```ts
import { createClient } from '@diegowritescode/accesscore-sdk';

const accessCore = createClient({
  baseUrl: 'https://accesscore.internal', // POSTs to `${baseUrl}/authz/check`
  timeoutMs: 5000, // optional (default 5000)
});

const decision = await accessCore.check(
  'document.read',
  { type: 'document', id: 'doc-1' },
  { token: endUserAccessToken, consistencyToken }, // forwarded as `Authorization: Bearer`
);

if (decision.effect === 'permit') {
  // …
}
```

**Fail-closed by construction.** The client never throws for control flow: a timeout, network
error, or non-decision HTTP status is normalized to `{ effect: 'deny', reasons: [{ code: … }] }`
— `pdp_unavailable` for a 5xx/network/timeout, `unauthenticated` for a `401` from the forwarded
token. `token` is the **end user's** AccessCore access token; the SDK forwards it and puts only
`action` / `resource` / `consistency_token` in the body, so a downstream service cannot forge a
subject.

### NestJS PEP

```ts
import {
  AccessCoreModule,
  RequirePermission,
  resourceFromParam,
} from '@diegowritescode/accesscore-sdk';

@Module({
  imports: [AccessCoreModule.forRoot({ baseUrl: 'https://accesscore.internal' })],
})
export class AppModule {}

@Controller('documents')
export class DocumentsController {
  @Get(':id')
  @RequirePermission('document.read', resourceFromParam('document', 'id'))
  read(@Param('id') id: string) {
    // reached only if AccessCore returned permit
  }
}
```

The guard extracts the incoming `Authorization` bearer, resolves the resource (and optionally a
stored zookie via a third resolver argument) from the request, calls `client.check`, and maps the
result: `permit` → allow; `deny` with `unauthenticated` → `401`; any other `deny` → `403`;
`pdp_unavailable` → `503` (fail-closed but retryable). Shared wire types (`Decision`, `Reason`,
`ResourceRef`, `REASON_CODES`) come from `@accesscore/contracts` and are bundled into the SDK's
published declarations, so the SDK ships zero workspace dependencies. `expand` and `batchCheck`
are additive over the same client and are planned, not shipped.
