# ADR-003: Use PostgreSQL and Redis for Studio identity and authorization

## Status

Accepted

## Date

2026-08-01

## Context

Browser-session pairing cannot support persistent credentials, multiple Studio users, workflow ownership or device sharing. The USB bridge must remain the enforcement point because it owns ADB access and sees the Android Agent credential.

## Decision

Use PostgreSQL as the durable source of truth for users, workflows, Assets, devices, grants and audit events. Use Redis for expiring server-side sessions, CSRF state, login throttling and immediate session revocation. Keep the static web UI in Docker and the ADB bridge native on Windows. The native bridge authenticates every Studio and bridge request before applying resource-level authorization.

Pairing credentials are encrypted with AES-256-GCM using a generated host secret. Browser code can save, replace, forget and query presence, but cannot retrieve plaintext. The bridge injects the credential only for an authorized request to the matching device serial.

## Alternatives Considered

### Browser localStorage or sessionStorage

Rejected because scripts can read the credential, storage is not account-scoped, and sessionStorage disappears on browser restart.

### PostgreSQL sessions without Redis

Rejected because Redis provides simple expiry, login throttling and immediate bulk revocation without turning high-frequency session checks into persistent database writes.

### JWT access tokens

Rejected because revocation and role/status changes would remain valid until token expiry. Opaque server-side sessions fit a local administrative application better.

### Store workflows on the filesystem only

Rejected because ownership, sharing and transactionally consistent authorization are relational concerns. PostgreSQL JSONB preserves the existing workflow document while adding a durable permission model.

## Consequences

- Studio now requires local PostgreSQL and Redis services.
- First launch needs an administrator setup flow.
- Existing filesystem projects need a one-time import.
- The bridge becomes stateful but remains horizontally portable when later deployed beside network-connected device callbacks.
- Secrets in `.runtime/studio.env` must be backed up with the database if the installation is moved.

