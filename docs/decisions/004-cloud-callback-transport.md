# ADR-004: Use outbound WebSocket callbacks for non-ADB devices

## Status

Accepted

## Date

2026-08-01

## Context

Pairing tokens authenticate an Agent but do not provide network reachability. USB ADB forwarding cannot support phones connected through mobile data, NAT or a remote VPS deployment.

## Decision

Add `CLOUD_CALLBACK` as an outbound WSS transport alongside `USB_BRIDGE`. Android keeps its existing loopback API as the execution boundary. A callback client translates bounded WebSocket command envelopes into authenticated loopback HTTP calls, then returns the HTTP result to Studio. This preserves one Agent API and avoids a second workflow executor path.

Use a short-lived human pairing code only to claim an online installation. Use a separate random device secret for reconnect authentication, encrypt that secret in PostgreSQL, keep pending claims in Redis and enforce existing device ownership/grants before every command.

## Consequences

- Phones work through NAT without opening ports or enabling wireless ADB.
- VPS Studio requires TLS and WebSocket-capable reverse proxy configuration.
- Asset payloads incur base64 overhead but remain within explicit limits.
- A single Studio API replica owns live sockets in the initial implementation; horizontal scaling later requires a connection gateway or sticky routing plus inter-node command dispatch.
- USB remains available for installation, recovery and rootless ADB screenshots.
