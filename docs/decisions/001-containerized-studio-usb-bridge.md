# ADR-001: Containerize the Studio UI and keep USB ADB on the Windows host

## Status

Accepted

## Date

2026-07-31

## Context

AIPhone Studio needs a repeatable Docker deployment, but its current connection mode controls USB-attached Android devices through ADB. Docker Desktop runs Linux containers in a virtualized environment and does not provide reliable direct access to Windows USB devices. Exposing an ADB server on a LAN-accessible TCP socket would make every connected phone controllable by other network clients and violate the project's loopback-only security boundary.

## Decision

Package the React Studio UI as a Docker image bound to host loopback at `127.0.0.1:4173`. Run the small Node.js USB bridge directly on Windows at `127.0.0.1:4174`. A one-command launcher starts both parts.

The Docker build compiles the UI with the bridge origin fixed to `http://127.0.0.1:4174`. Bridge-only mode permits browser CORS requests only from `http://127.0.0.1:4173` and `http://localhost:4173`. Native mode remains available and serves both the UI and bridge from port `4173`.

## Alternatives Considered

### Pass Windows USB devices into the Linux container

- Requires Docker Desktop and WSL USB plumbing that differs by host version.
- Adds privileged device configuration and is not reliable for a one-click deployment.
- Rejected because USB availability would be more fragile than the existing native bridge.

### Expose the host ADB server to the container over TCP

- Lets the container enumerate devices, but ADB server TCP has no application-level authentication.
- Device forwards are created on the host and are not consistently reachable from the container network.
- Rejected because it weakens security and remains platform-dependent.

### Keep the complete Studio native-only

- Preserves USB behavior but does not provide the requested Docker packaging or immutable UI deployment.
- Rejected because it does not meet the deployment requirement.

## Consequences

- Docker image deployment is repeatable and can be published through GHCR.
- USB access remains reliable and limited to the local Windows session.
- Node.js is still required on the PC for the small host bridge.
- The launcher manages two processes, and both must be stopped together.
- Future Wi-Fi/LAN device support can move connection logic into the container without changing the workflow UI.
