# Spec: Cloud Callback Device Transport

Status: Approved from the 2026-08-01 user requirement

## Objective

Allow an Android Agent to be added and controlled without USB or ADB. The Agent opens an outbound secure WebSocket to Studio, the signed-in user claims it with a one-time code, and existing workflow/Asset/run APIs operate through the callback transport without changing workflow documents.

## Transport Contract

- Endpoint: `WSS /callback/v1/connect`.
- Protocol version: `1`.
- Android sends `HELLO` with an installation ID, random device secret, SHA-256 pairing-code hash and bounded device metadata.
- Studio responds with `PAIRING_REQUIRED`, `READY` or `PAIRED`.
- Studio sends `COMMAND` envelopes containing an allowlisted Agent API method/path and a bounded base64 body.
- Android returns a correlated `RESULT` envelope with HTTP status, content type and bounded base64 body.
- WebSocket compression is disabled and payloads are capped at 24 MiB; decoded command/result bodies are capped at 16 MiB.

## Pairing And Identity

1. The Agent creates a random installation ID, 256-bit device secret and 10-character human pairing code in app-private preferences.
2. The Agent sends only the pairing-code hash to Studio. Redis stores the pending hash for 10 minutes.
3. An authenticated Studio user submits the visible code to `POST /studio/callback-pairings` with CSRF protection.
4. Studio consumes the Redis key atomically and creates a `CLOUD_CALLBACK` device owned by that user.
5. PostgreSQL stores the device secret encrypted with AES-256-GCM and device-bound AAD. The browser never receives it.
6. Reconnects authenticate using the installation ID and secret over WSS. Failed pairing attempts are rate-limited per Studio user.
7. An expired unclaimed code is rotated by the Agent before reconnecting.

## Authorization

- Callback transport does not bypass Studio RBAC.
- Every tunneled request rechecks that the session user owns or has a `USE` grant for the exact device record.
- The server accepts only the existing fixed Agent API path allowlist; Android independently rejects non-`/api/` paths, traversal and unsupported methods.
- Browser-supplied Android pairing tokens and arbitrary callback destinations are never forwarded.

## Deployment

- Android requires a publicly reachable URL with a valid TLS certificate; release builds accept only `https://` or `wss://` callback URLs.
- The phone makes an outbound connection, so no inbound phone port, ADB forwarding or LAN discovery is required.
- `studio/compose.cloud.yml` changes the Studio container from static-only mode to the full account-aware API and disables ADB inside the container.
- A reverse proxy must terminate HTTPS and proxy WebSocket upgrades to Studio port `4173`.
- Callback connection state is currently in-memory, so the first release runs one Studio API replica. PostgreSQL and Redis remain restart-safe sources of durable identity and pending pairing state.

## Compatibility

- `USB_BRIDGE` remains the default Windows-local transport.
- `CLOUD_CALLBACK` is additive and uses synthetic routing serials prefixed with `cloud:`.
- Existing workflow, Asset, node-test, run-status and stop APIs are reused unchanged.
- Cloud Live View uses the Agent screenshot API and may require root on devices where app-level capture is unavailable. Tap uses Accessibility first and root as fallback.

## Verification

- Unit tests cover pairing normalization, protocol bounds, encrypted callback secrets and command/result correlation.
- Host integration tests prove CSRF-protected claiming and authorized callback API tunneling without invoking ADB.
- Web tests, typecheck and production build remain required.
- Android unit tests cover identity generation and mandatory WSS URL construction; GitHub Actions performs the SDK build.
