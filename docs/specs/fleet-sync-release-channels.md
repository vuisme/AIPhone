# Spec: Fleet Sync, Release Channels and Root-Optional Agent

## Objective

Make AIPhone workflows portable and repeatable across a fleet of Android phones. The PC Studio owns the canonical workflow and Asset data, deploys only changed content to one or many connected phones, and starts runs after deployment. The Android Agent exposes an explicit capability model, can be started and stopped from a modern native dashboard, and supports Stable or Nightly updates from GitHub Releases.

## Assumptions

- The Windows Studio Host is the local source of truth; phones keep deployable offline replicas.
- USB remains the initial fleet transport. Wi-Fi/LAN transport can implement the same device API later.
- Stable builds are immutable `v*` GitHub Releases. Nightly is an opt-in prerelease updated from `main`.
- Root enables silent APK installation, screenshots, coordinate input and HyperOS XSpace operations.
- Without root, Agent/API/workflow storage still work; Accessibility actions and main-user app launch work after the user enables the service. XSpace actions remain unavailable. Non-root image capture requires a later MediaProjection slice.

## Data Contract

Every image Asset has a content hash:

```json
{
  "id": "register-later",
  "workflowId": "lien-quan-reroll",
  "type": "IMAGE",
  "sha256": "7af3...",
  "fileName": "register-later.png"
}
```

The Studio Host stores canonical resources under a configurable data directory:

```text
studio-data/
  workflows/<workflowId>.json
  assets/<workflowId>/<assetId>.png
```

Deployment is ordered and idempotent:

1. Read the target Agent inventory.
2. Compare workflow revision and image `sha256` values.
3. Upload only missing or changed PNG Assets.
4. Save the complete workflow document after all required images exist.
5. Optionally start the workflow.

## APIs

Studio Host canonical store:

- `GET /studio/workflows`
- `POST /studio/workflows`
- `GET|PUT|DELETE /studio/workflows/:workflowId`
- `GET|PUT|DELETE /studio/workflows/:workflowId/assets/:assetId`

Android deployment inventory:

- `GET /api/workflows/:workflowId/inventory`
- Existing workflow and Asset endpoints remain canonical for upload/save.

All IDs use the existing allowlisted pattern. PNG uploads retain magic-byte and size validation. Hashes are computed by trusted storage layers and never accepted as proof without hashing the received bytes.

## Fleet UX

- Device selection supports one or many connected phones.
- `Deploy` shows per-device states: pending, syncing, ready or failed.
- `Deploy & Run` starts only devices that completed sync.
- Pairing tokens remain scoped per ADB serial and are never written to workflow exports.
- A run continues on each phone after USB disconnects.

## Android Capability Matrix

| Capability | No root | Root |
|---|---:|---:|
| Agent service and local API | Yes | Yes |
| Workflow/Asset storage | Yes | Yes |
| UI hierarchy and `TAP_TEXT` | Yes, after manual Accessibility enable | Yes, auto-enable allowed |
| Main-user app launch | Yes | Yes |
| Coordinate tap/swipe | Accessibility gesture | Root input |
| Screenshot/image matching | MediaProjection follow-up | Yes |
| XSpace create/delete/clear/launch | No | Yes |
| APK update | System installer confirmation | Silent install when explicitly enabled |

Unsupported nodes fail before execution with an actionable capability error.

## Update Channels

- Agent persists `STABLE` or `NIGHTLY` preference locally.
- Update metadata is fetched only from `api.github.com/repos/vuisme/AIPhone/releases` over HTTPS.
- Stable ignores prereleases. Nightly selects the newest prerelease.
- The selected APK must come from the fixed `vuisme/AIPhone` repository and have an `.apk` asset.
- Android verifies the installed package signature through Package Manager during upgrade. Root installation uses an explicit local file path and never a user-provided shell command.
- Non-root installation uses `FileProvider` and Android's package installer UI.

## Native App UX

- Dark, high-contrast dashboard with service state, connection details and capability cards.
- Primary service toggle starts/stops the foreground Agent without restarting the app.
- Accessibility status includes a direct link to Android Accessibility settings.
- Update card selects Stable/Nightly, checks version and installs through the appropriate path.
- Pairing token has copy and reveal controls.

## Commands

- Studio tests: `npm test` in `studio/web/`
- Studio typecheck: `npm run typecheck` in `studio/web/`
- Studio build: `npm run build` in `studio/web/`
- Host tests: `npm test` in `studio/host/`
- Android tests/build: `.github/workflows/android-apk.yml`
- Docker: `docker compose -f studio/compose.yml build` then `docker compose -f studio/compose.yml up -d --force-recreate`

## Testing Strategy

- Pure tests cover SHA-256 inventory comparison, deployment ordering, device capability checks and GitHub release selection.
- Host integration tests cover path validation, persistence and PNG validation.
- Android unit tests cover update-channel selection and capability decisions.
- GitHub Actions compiles API 36, signs the APK and publishes Nightly/Stable release assets.
- Browser testing remains excluded per user request; final UI testing is manual.

## Boundaries

- Always: hash received image bytes; keep Agent/bridge loopback-only; validate GitHub response shapes; preserve old workflows.
- Ask first: LAN exposure, cloud accounts, unattended root auto-update default, or destructive fleet actions.
- Never: embed pairing tokens in workflows, accept arbitrary update URLs, execute arbitrary shell input, or claim XSpace support without root.

## Success Criteria

- A workflow created once can deploy to multiple connected phones without recropping images.
- Unchanged Asset PNGs are not uploaded again.
- Each phone can run the deployed workflow after USB disconnects.
- Stable and Nightly are visibly distinct and select releases correctly.
- Agent service can be toggled from the native app.
- A non-root phone can run supported accessibility workflows and receives clear errors for root-only nodes.

