# Spec: Studio Accounts, RBAC and Persistent Pairing

Status: Approved from the 2026-08-01 user requirements

## Objective

Add professional multi-user authentication to the local AIPhone Studio. PostgreSQL is the source of truth for accounts, workflows, assets, devices, grants and audit events. Redis stores short-lived sessions and login throttling. Pairing credentials survive browser and service restarts without ever being returned to browser JavaScript.

## Assumptions

1. One Studio deployment is one tenant.
2. The first launch exposes a one-time setup flow that creates the first administrator.
3. Authentication uses email and password; OAuth and email-based password recovery are deferred.
4. Administrators can create, edit, disable and reset member accounts.
5. A workflow grant gives `EDIT`; a device grant gives `USE`. The schema keeps explicit permission columns so finer permissions can be added later.
6. An unclaimed, physically connected device may be paired by an authenticated user. A claimed device cannot be taken over by another user unless an administrator reassigns or grants it.

## Roles And Permissions

| Resource | Administrator | User |
|---|---|---|
| Members | Full management | Own profile only |
| Workflows | View/edit/delete/share all | Full control when owner; edit when granted |
| Assets | Same access as parent workflow | Same access as parent workflow |
| Devices | View/pair/reassign/share all | Pair unclaimed devices; use owned or granted devices |
| Pairing token | Backend use only | Backend use only |
| Audit log | Read all | Not exposed in v1 |

Authorization is enforced in the host API for every request. Hiding UI controls is not a security boundary.

## Authentication And Session Security

- Passwords use Node.js `scrypt` with a unique random salt and constant-time verification.
- Session identifiers are 256-bit random values stored only in a `HttpOnly`, `SameSite=Strict` cookie.
- Redis stores only a SHA-256 hash of the session identifier, the user ID and a CSRF secret.
- Mutating requests require `X-CSRF-Token`; the token is returned after login/session refresh and kept in browser memory.
- Login attempts are rate-limited by normalized email and client loopback address.
- Authentication responses and logs never contain passwords, session identifiers or pairing tokens.
- Disabled users have all Redis sessions revoked immediately.

## Pairing Credential Security

- The browser submits a token once to an authenticated pairing endpoint.
- The host encrypts it with AES-256-GCM using `AIPHONE_CREDENTIAL_KEY` and device-bound additional authenticated data.
- PostgreSQL stores ciphertext, IV and authentication tag, never plaintext.
- The bridge decrypts only for an authorized request to the exact ADB serial and injects `X-AIPhone-Token` into the Agent proxy request.
- Credential status APIs return only `hasCredential`; re-pair overwrites the encrypted value and forget removes it.

## Data Model

- `users`: identity, role, status, password hash and timestamps.
- `workflows`: JSONB workflow document and owner.
- `workflow_assets`: PNG bytes and SHA-256 under a workflow.
- `workflow_grants`: workflow-to-user `EDIT` assignments.
- `devices`: ADB serial, owner, metadata and encrypted pairing credential.
- `device_grants`: device-to-user `USE` assignments.
- `audit_events`: security and administration events without secret payloads.
- Redis `session:*`: authenticated sessions with expiry.
- Redis `login-limit:*`: bounded login failure counters.

## API Contract

Authentication:

- `GET /auth/setup-status`
- `POST /auth/setup`
- `POST /auth/login`
- `GET /auth/session`
- `POST /auth/logout`

Administration:

- `GET/POST /admin/users`
- `PATCH /admin/users/:id`
- `POST /admin/users/:id/reset-password`
- `GET/PUT/DELETE /admin/workflows/:id/grants/:userId`
- `GET/PUT/DELETE /admin/devices/:id/grants/:userId`

Authenticated Studio resources:

- Existing `/studio/workflows` and Asset routes, filtered and authorized by the session user.
- `GET /studio/devices` for devices visible to the session user.
- `GET/PUT/DELETE /studio/devices/:serial/credential` for authorized pairing state.
- Existing `/bridge/devices/*` routes require authentication and device authorization.

Errors use `{ "error": { "code": "...", "message": "..." } }`. Authentication failures are `401`; authorization failures are `403`; conflicts are `409`; invalid input is `422`.

## Deployment

- Docker Compose runs PostgreSQL 17 and Redis 8 on loopback-only host ports plus the existing static Studio container.
- The Windows USB bridge remains native and connects to those local services.
- `start-docker.ps1` creates `.runtime/studio.env` once with random database, Redis and credential-encryption secrets, then reuses it across upgrades.
- Named Docker volumes preserve PostgreSQL and Redis data across image/container replacement.

## Migration

After the first administrator is created, legacy workflows and PNG Assets in `~/.aiphone-studio` are imported once and owned by that administrator. The legacy files are retained as a recoverable backup.

## Testing Strategy

- Unit tests: password hashing, token encryption, input normalization and permission decisions.
- Integration tests: setup/login/logout, CSRF, role checks, cross-user isolation, grants, session revocation and proxy credential injection.
- Web tests: auth state, login/setup forms and permission-driven controls.
- Browser testing is intentionally omitted at the user's request; the user performs runtime UI testing.

## Success Criteria

1. First launch creates exactly one initial administrator and closes setup permanently.
2. Restarting the browser, bridge or Docker services does not require re-pairing.
3. An administrator sees all workflows/devices and can manage users and grants.
4. A user cannot read or mutate another user's ungranted workflow, Asset or device, even with a hand-crafted API request.
5. A user can use owned or granted devices, while the browser never receives a stored pairing token.
6. Disabling a user revokes active sessions immediately.
7. No committed file, API response or log contains generated secrets.
