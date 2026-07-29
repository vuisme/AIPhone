# AIPhone MVP Tasks

- [ ] Task 1: Initialize repository layout and versioned workflow contract
  - Acceptance: schema supports start, vision, input, clone, loop and terminal nodes
  - Verify: contract typecheck passes
  - Files: root config, `contracts/`

- [ ] Task 2: Validate workflows and provide a reroll example
  - Acceptance: missing templates, invalid edges and unsafe loops are rejected
  - Verify: unit tests demonstrate RED then GREEN
  - Files: `contracts/`, tests, fixtures

- [ ] Task 3: Scaffold Studio and device API client
  - Acceptance: Studio shows device health and handles offline/error states
  - Verify: Studio tests and build pass
  - Files: `studio/`

- [ ] Task 4: Implement no-code graph editor
  - Acceptance: nodes can be added, connected, selected, edited and removed
  - Verify: component tests and production build pass
  - Files: `studio/src/features/workflows/`

- [ ] Task 5: Implement screenshot crop/template manager
  - Acceptance: crop uses original pixels and can test/upload a template
  - Verify: coordinate conversion tests and browser runtime check pass
  - Files: `studio/src/features/templates/`

- [ ] Task 6: Scaffold Android Agent and local server
  - Acceptance: foreground service serves Studio and `/api/device`
  - Verify: GitHub Actions unit/build job passes
  - Files: `android-agent/`

- [ ] Task 7: Add persistence and resource endpoints
  - Acceptance: workflows/templates survive process restarts
  - Verify: Android unit tests pass
  - Files: Android storage and API modules

- [ ] Task 8: Add screenshot, matching and safe root actions
  - Acceptance: screenshot PNG works; root operations are package/user allowlisted
  - Verify: unit tests plus device health endpoint
  - Files: Android vision/root modules

- [ ] Task 9: Add deterministic workflow executor
  - Acceptance: graph branches, loops, timeouts and terminal results execute on phone
  - Verify: executor tests pass with fake device operations
  - Files: Android workflow module

- [ ] Task 10: Configure signed upgradeable CI builds
  - Acceptance: Actions builds signed APK with increasing `versionCode`
  - Verify: inspect downloaded APK metadata/signature
  - Files: Gradle and `.github/workflows/`

- [ ] Task 11: Review, publish and deliver
  - Acceptance: private `AIPhone` repo is pushed and APK is downloaded to `artifacts/`
  - Verify: clean git status and green GitHub Actions run
  - Files: docs, changelog, release metadata
