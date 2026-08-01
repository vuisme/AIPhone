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

### Changed

- Grouped the React editor and desktop USB bridge under a single `studio/` project directory.
- Migrated the canonical workflow contract to `assets/assetId` while preserving legacy template data.

### Fixed

- Capture the primary physical display explicitly on multi-display Xiaomi devices.
- Log image-match bounds and tap coordinates, retry failed taps, and stop false `FOUND` results when the target image remains visible.

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
