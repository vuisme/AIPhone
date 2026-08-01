# AIPhone MVP Tasks

- [x] Task 1: Initialize repository layout and versioned workflow contract
  - Acceptance: schema supports start, vision, input, clone, loop and terminal nodes
  - Verify: contract typecheck passes
  - Files: root config, `contracts/`

- [x] Task 2: Validate workflows and provide a reroll example
  - Acceptance: missing templates, invalid edges and unsafe loops are rejected
  - Verify: unit tests demonstrate RED then GREEN
  - Files: `contracts/`, tests, fixtures

- [x] Task 3: Scaffold Studio and device API client
  - Acceptance: Studio shows device health and handles offline/error states
  - Verify: Studio tests and build pass
  - Files: `studio/`

- [x] Task 4: Implement no-code graph editor
  - Acceptance: nodes can be added, connected, selected, edited and removed
  - Verify: component tests and production build pass
  - Files: `studio/web/src/features/workflows/`

- [x] Task 5: Implement screenshot crop/template manager
  - Acceptance: crop uses original pixels and can test/upload a template
  - Verify: coordinate conversion tests and browser runtime check pass
  - Files: `studio/web/src/features/templates/`

- [x] Task 6: Scaffold Android Agent and local server
  - Acceptance: foreground service serves Studio and `/api/device`
  - Verify: GitHub Actions unit/build job passes
  - Files: `android-agent/`

- [x] Task 7: Add persistence and resource endpoints
  - Acceptance: workflows/templates survive process restarts
  - Verify: Android unit tests pass
  - Files: Android storage and API modules

- [x] Task 8: Add screenshot, matching and safe root actions
  - Acceptance: screenshot PNG works; root operations are package/user allowlisted
  - Verify: unit tests plus device health endpoint
  - Files: Android vision/root modules

- [x] Task 9: Add deterministic workflow executor
  - Acceptance: graph branches, loops, timeouts and terminal results execute on phone
  - Verify: executor tests pass with fake device operations
  - Files: Android workflow module

- [x] Task 10: Configure signed upgradeable CI builds
  - Acceptance: Actions builds signed APK with increasing `versionCode`
  - Verify: inspect downloaded APK metadata/signature
  - Files: Gradle and `.github/workflows/`

- [x] Task 11: Review, publish and deliver
  - Acceptance: public `AIPhone` repo is pushed and APK is downloaded to `artifacts/`
  - Verify: clean git status and green GitHub Actions run
  - Files: docs, changelog, release metadata

- [x] Task 12: Add explicit edge deletion
  - Acceptance: double-clicking or explicitly deleting an edge removes only the selected edge
  - Verify: graph helper/component tests and Studio build pass
  - Files: workflow canvas, graph helper, tests, styles

- [x] Task 13: Add standalone PC Studio Host for USB devices
  - Acceptance: host serves Studio on loopback, lists `adb devices -l` and proxies only through validated serials
  - Verify: Node tests cover ADB parsing, serial validation and proxy path restrictions
  - Files: `studio/host/`

- [x] Task 14: Add single-node test execution on Android
  - Acceptance: API starts exactly one saved node and reports through the existing run status without following edges
  - Verify: executor unit/CI tests and device integration test pass
  - Files: Android executor, server and tests

- [x] Task 15: Add USB device selection to Studio
  - Acceptance: Studio scans USB devices, selects a serial and pairs independently per browser session
  - Verify: API client and connection-dialog tests pass
  - Files: Studio bridge client, connection UI and App integration

- [x] Task 16: Add node actions and friendly Android user selector
  - Acceptance: node cards expose Play/Disable/Delete; user field offers `App chính` or `App kép / XSpace`
  - Verify: UI tests cover safe/destructive nodes and numeric contract mapping
  - Files: workflow inspector, App actions and styles

- [x] Task 17: Package and publish the USB Studio release
  - Acceptance: CI uploads signed APK plus standalone PC Studio artifact
  - Verify: green CI, real-device USB selection, node test and upgrade install
  - Files: workflow, README, changelog and release metadata

- [x] Task 18: Consolidate the PC Studio project
  - Acceptance: React web, USB bridge and launchers live under `studio/`
  - Verify: web and bridge tests pass after path migration
  - Files: `studio/web/`, `studio/host/`, CI paths and documentation

- [x] Task 19: Add a safe Docker deployment for Windows USB use
  - Acceptance: Docker serves only the UI while the USB bridge remains loopback-only on Windows
  - Verify: Compose config, bridge CORS tests, web build and launcher syntax checks pass
  - Files: Dockerfile, Compose, launchers and bridge mode handling

- [x] Task 20: Publish and verify the Studio container
  - Acceptance: GHCR exposes `ghcr.io/vuisme/aiphone-studio:latest` and the launcher pulls it successfully
  - Verify: green container workflow and local health checks on ports `4173` and `4174`
  - Files: container workflow and release metadata

- [x] Task 21: Define workflow-scoped Assets and migration
  - Acceptance: new JSON uses `assets/assetId`; old `templates/templateId` loads without data loss
  - Verify: contract migration and validation tests pass
  - Files: Studio contract, Android storage contract, spec/ADR

- [x] Task 22: Add multi-workflow persistence and CRUD
  - Acceptance: users can list, create, rename, select and delete workflows; the selected workflow is executed
  - Verify: API/storage tests and Studio state tests pass
  - Files: Android store/server/executor, Studio API client and workflow manager

- [x] Task 23: Add accessibility selector execution
  - Acceptance: Agent exposes hierarchy XML/structured nodes and `TAP_TEXT` clicks an accessible node or its bounds
  - Verify: selector matching/unit tests and Android CI pass
  - Files: accessibility service, manifest, executor and tests

- [x] Task 24: Add Asset Library and Capture Lab inspector
  - Acceptance: Assets are grouped by workflow; images can be replaced; screenshot UI toggles to visual text inspection
  - Verify: Studio tests, typecheck and build pass
  - Files: Asset components, capture components, App integration and styles

- [ ] Task 25: Deliver the local test build
  - Acceptance: Docker Studio and USB bridge restart cleanly; signed APK is upgradeable
  - Verify: health endpoints, GitHub Actions and `adb install -r`
  - Files: changelog, CI artifacts and runtime deployment

- [ ] Task 26: Define fleet sync and capability contracts
  - Acceptance: IMAGE Assets carry SHA-256; Agent inventory reports hashes and supported capabilities
  - Verify: contract and Android unit tests pass
  - Files: Studio contract, Agent store/server, spec/ADR

- [ ] Task 27: Add the canonical Studio Host project store
  - Acceptance: workflows and PNG Assets persist on the PC independently of any phone
  - Verify: host persistence, PNG validation and traversal tests pass
  - Files: `studio/host/`

- [ ] Task 28: Deploy and run across multiple phones
  - Acceptance: Studio syncs only changed Assets, then saves and optionally runs the workflow on each selected device
  - Verify: pure sync planner and API orchestration tests pass
  - Files: Studio API/client, device selection and fleet progress UI

- [ ] Task 29: Add root-optional execution capabilities
  - Acceptance: supported accessibility/main-user nodes run without root and root-only nodes fail with explicit errors
  - Verify: Android capability and executor tests pass
  - Files: accessibility, root actions, executor and device health

- [ ] Task 30: Add a modern native Agent dashboard
  - Acceptance: service toggle, pairing, root/accessibility state and capability summary are available in-app
  - Verify: Android CI build and manual phone review
  - Files: MainActivity, resources and AutomationService

- [ ] Task 31: Add Stable/Nightly updater
  - Acceptance: Agent selects the correct fixed-repository release and installs via root or system installer
  - Verify: release selection unit tests and signed upgrade test
  - Files: Android update module, FileProvider and app UI

- [ ] Task 32: Publish release channels in CI
  - Acceptance: main publishes an opt-in Nightly prerelease; version tags publish immutable Stable releases
  - Verify: GitHub Actions and release asset inspection
  - Files: `.github/workflows/`

- [ ] Task 33: Deliver and verify fleet-ready builds
  - Acceptance: Docker/bridge health is green and the signed APK deploys without losing workflows
  - Verify: local health checks, Android CI and `adb install -r`
  - Files: changelog, docs and release artifacts

- [x] Task 34: Define Studio authentication and RBAC contracts
  - Acceptance: roles, ownership, grants, sessions and pairing security have testable rules
  - Verify: `docs/specs/studio-accounts-rbac.md` and ADR-003 cover all boundaries
  - Files: `docs/specs/`, `docs/decisions/`, `tasks/`

- [ ] Task 35: Add PostgreSQL repositories and Redis sessions
  - Acceptance: setup/login/member/workflow/device data persists and disabled users lose sessions
  - Verify: host unit and integration tests
  - Files: `studio/host/`, migrations and tests

- [ ] Task 36: Enforce authorization and secure pairing
  - Acceptance: cross-user access fails; token ciphertext is injected only for authorized serials
  - Verify: adversarial API/proxy tests
  - Files: host server, auth middleware, credential vault and tests

- [ ] Task 37: Add account and sharing UI
  - Acceptance: setup/login/logout, member management and workflow/device grants work without exposing secrets
  - Verify: Vitest, typecheck and production build
  - Files: Studio auth/admin components, API client and styles

- [ ] Task 38: Deploy the account-aware Studio
  - Acceptance: Compose provisions Postgres/Redis with persistent volumes and restart-safe generated secrets
  - Verify: host/web tests, npm audit, Docker health and manual user testing
  - Files: Compose, launcher, README and changelog
