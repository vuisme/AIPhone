# ADR-002: Studio Source of Truth and Release Channels

## Status

Accepted

## Date

2026-08-01

## Context

Keeping workflow PNGs only on the currently selected phone prevents reuse across a device fleet. GitHub Actions artifacts also expire and do not provide a stable unauthenticated update contract for Android clients. Root is useful on HyperOS, but requiring it for the Agent service and accessibility workflows unnecessarily narrows supported devices.

## Decision

- Move canonical workflow documents and image bytes to the Windows Studio Host.
- Treat each Android Agent as an offline deployment target with an inventory of workflow revision and Asset hashes.
- Sync image Assets by SHA-256 before saving the workflow document.
- Publish immutable tagged Stable releases and an opt-in GitHub prerelease Nightly channel.
- Model Android features as capabilities. Root-only operations are rejected explicitly; the Agent service itself remains root-optional.

## Consequences

- The host requires a persistent writable data directory outside the Docker UI container.
- Studio can deploy to many devices without using one device as the source for another.
- Fleet operations need per-device progress and partial-failure handling.
- Nightly users accept higher regression risk; Stable remains manually promoted and immutable.
- Non-root support is useful but intentionally does not emulate XSpace capabilities.

