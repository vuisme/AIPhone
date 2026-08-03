# Changelog

## [Unreleased]

### Added

- Docker image and Compose deployment for the PC Studio web UI.
- One-command Windows launchers that coordinate the Docker UI with the loopback USB bridge.
- GitHub Actions publishing to `ghcr.io/vuisme/aiphone-studio`.
- Multi-workflow list, create, rename, select and delete operations in Studio and the Android Agent.
- Workflow-scoped `IMAGE` and `UI_SELECTOR` Assets with a dedicated Asset Library.
- Capture Lab text/XML inspector with live accessibility bounds over the phone screenshot.
- `TAP_TEXT` nodes that use semantic Accessibility clicks and fall back to root bounds taps.
- Canonical PC workflow storage, SHA-256 Asset sync and bulk USB deployment/run status.
- Root-optional Agent capabilities for Accessibility input and main-user app launch.
- Modern Android Agent dashboard with service control, capability status and pairing details.
- Stable/Nightly in-app updater restricted to signed APKs from the AIPhone GitHub repository.
- GitHub release automation for opt-in Nightly builds and immutable semantic-version Stable builds.
- Typed workflow run inputs and runtime variables with `SET_VARIABLE`, generic `IF` and `LOG` nodes.
- Expandable Run Data inspector showing typed values produced by the on-phone executor.
- Rootless USB Live View with 1-2 FPS preview, freeze/refresh controls and click-to-tap input.
- First-run administrator setup, login/logout and professional `ADMIN`/`USER` account management.
- PostgreSQL persistence for accounts, workflows, Assets, device ownership, grants and audit events.
- Redis-backed opaque sessions, CSRF state, immediate revocation and login rate limiting.
- AES-256-GCM encrypted pairing credentials scoped to authorized ADB devices and never returned to the browser.
- Outbound WSS Cloud Callback transport with one-time device claims, encrypted reconnect identity and no ADB requirement.
- Studio device pairing UI for adding callback phones and using the existing fleet deploy/run/log pipeline remotely.
- VPS Compose override for the full account-aware Studio API behind an HTTPS/WebSocket reverse proxy.
- Side-by-side Cloudflare Tunnel deployment that preserves the local USB Studio while exposing a Secure-cookie Cloud Callback origin.

### Changed

- Grouped the React editor and desktop USB bridge under a single `studio/` project directory.
- Migrated the canonical workflow contract to `assets/assetId` while preserving legacy template data.
- Phones now act as offline deployment targets while the Studio Host owns canonical workflow and Asset data.
- Studio node inspectors are generated from field schemas so new node types no longer require canvas-specific forms.
- Studio workflow and device lists are filtered by ownership, administrator access and explicit user grants.
- Device routing now supports additive `USB` and `CLOUD_CALLBACK` connection modes.

### Fixed

- Allow Cloud Capture Lab screenshots on non-root Android 11+ devices through the enabled AIPhone Accessibility service.
- Escape workflow variable template braces for Android's regex runtime and include nested exception causes in on-phone run logs.
- Allow Cloud Callback commands to reach the Agent's authenticated HTTP server over the app-internal `127.0.0.1` loopback while keeping external cleartext traffic disabled.
- Capture the primary physical display explicitly on multi-display Xiaomi devices.
- Log image-match bounds and tap coordinates, retry failed taps, and stop false `FOUND` results when the target image remains visible.
- Serve the full Studio login shell without requiring an authenticated workflow request context.
- Detect HTTPS Cloud Studio origins as account-aware deployments instead of opening the embedded Agent pairing UI.

## [0.1.5] - 2026-07-31

### Fixed

- Resolve the real launcher activity per Android user before starting the main or XSpace app.
- Surface root-command output and executor failures instead of opaque node-test results.

### Added

- Expandable Studio logging panel with per-node timestamps, severity and automatic expansion on failure.
- Standalone USB Studio host, ADB device selection, direct node controls and edge double-click deletion.

## [0.1.3] - 2026-07-29

### Fixed

- Enabled Android `BuildConfig` generation so release compilation succeeds on GitHub Actions.

### Delivery

- Published the public `vuisme/AIPhone` repository with signed, upgradeable APK builds.

## [0.1.0] - 2026-07-29

### Added

- Browser-based no-code workflow editor with image and XSpace nodes.
- Native-pixel screenshot crop and configurable template metadata.
- Rooted Android Agent with a loopback HTTP API and foreground service.
- On-device template matching and deterministic workflow execution.
- Persistent GitHub signing and upgradeable APK build workflow.
