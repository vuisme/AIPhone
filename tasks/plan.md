# Implementation Plan: AIPhone MVP

## Overview

Build a public GitHub repository containing a browser-based no-code Studio and a rooted Android Agent. The Agent serves Studio over a local HTTP port, captures screenshots, stores templates, executes a versioned workflow graph, and exposes structured root operations for HyperOS XSpace. GitHub Actions builds and signs an upgradeable APK.

## Architecture Decisions

- Keep the Android Agent as the source of truth; Studio is a replaceable client.
- Bundle the built Studio in Android assets and serve it from the Agent.
- Use a versioned discriminated workflow contract shared by generated JSON Schema.
- Use polling for run status in the MVP; execution stays on the phone after disconnect.
- Store the signing keystore only in GitHub Secrets and derive `versionCode` from the Actions run number.
- Restrict root commands to typed operations and the configured package/user pair.

## Dependency Graph

```text
Workflow contract
  |-- Studio graph/editor validation
  `-- Android parser/executor

Android local API
  |-- Screenshot/template capture UI
  `-- Run controls/status UI

Signing secrets + CI
  `-- Reproducible upgradeable APK
```

## Phases

### Phase 1: Foundation

- Task 1: Initialize repository metadata, project layout and workflow contracts.
- Task 2: Add contract validation tests and sample reroll workflow.

Checkpoint: contract tests pass and the repository contains no local tools or secrets.

### Phase 2: Studio

- Task 3: Scaffold React Studio and device API client.
- Task 4: Implement graph editing and node palette.
- Task 5: Implement screenshot capture, native-pixel crop and template upload.

Checkpoint: Studio tests/build pass and the main workflow can be authored without code.

### Phase 3: Android Agent

- Task 6: Scaffold Android app, foreground service and embedded static server.
- Task 7: Implement workflow/template persistence and API endpoints.
- Task 8: Implement screenshot, template matching and typed root actions.
- Task 9: Implement deterministic workflow execution and run status.

Checkpoint: Android unit tests and remote debug APK build pass.

### Phase 4: Delivery

- Task 10: Add GitHub Actions, persistent signing and artifact publishing.
- Task 11: Validate Studio runtime, review code, push repository and download APK.

Checkpoint: GitHub Actions is green and a signed APK is available locally and as an artifact.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| HyperOS XSpace commands differ from AOSP | High | Isolate behind `CloneProvider`; expose health checks and structured errors |
| KernelSU denies Agent root | High | Detect at startup and require explicit Manager approval before root nodes run |
| Android dependency incompatibility on API 36 | Medium | Build early in GitHub Actions and pin working versions |
| Template matching is too slow | Medium | Search normalized ROIs and downsample only for detection, tap using original coordinates |
| Browser crop coordinate drift | Medium | Test CSS-to-native coordinate conversion as pure logic |
| APK cannot upgrade | High | Stable application ID, persistent keystore secrets, monotonically increasing version code |

## Verification

- Contract and Studio tests run locally with Node.
- Studio production build completes locally.
- Android tests and APK build run in GitHub Actions.
- APK signature and version metadata are inspected after artifact download.
- Repository status is clean and no secret/private key is committed.
