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
  - Files: `studio/src/features/workflows/`

- [x] Task 5: Implement screenshot crop/template manager
  - Acceptance: crop uses original pixels and can test/upload a template
  - Verify: coordinate conversion tests and browser runtime check pass
  - Files: `studio/src/features/templates/`

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
  - Files: `desktop-host/`

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

- [ ] Task 17: Package and publish the USB Studio release
  - Acceptance: CI uploads signed APK plus standalone PC Studio artifact
  - Verify: green CI, real-device USB selection, node test and upgrade install
  - Files: workflow, README, changelog and release metadata
