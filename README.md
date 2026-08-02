# AIPhone

AIPhone is an Android automation Agent with a browser-based no-code workflow Studio. It supports accessibility workflows without root and uses root when available for screenshots, image matching and Xiaomi HyperOS XSpace operations.

## MVP capabilities

- Drag-and-drop workflow nodes with branches and loops.
- Use typed run inputs and variables with generic `IF` branches and interpolated logging.
- Manage multiple workflows, each with its own reusable Asset library.
- Capture the current Android screen and crop native-pixel PNG Assets in the browser.
- Replace image Assets without rebuilding the APK.
- Inspect accessible Android/WebView text over the live screenshot and create `TAP_TEXT` nodes visually.
- Run Studio independently on the PC and choose a connected USB phone by ADB serial.
- Preview and control the selected phone through rootless USB Live View at 1-2 FPS.
- Keep canonical workflows and Assets on the PC, sync changed PNGs by SHA-256 and deploy to multiple USB phones.
- Play, disable or delete a node directly from its card; double-click an edge to remove it.
- Execute workflows on the phone after the computer disconnects.
- Image wait/condition/tap nodes using on-device pixel matching.
- Typed root operations for Xiaomi HyperOS XSpace user `999`.
- Root-optional main-user launch and Accessibility tap, swipe and text actions.
- Signed Stable and Nightly GitHub Releases with monotonically increasing version codes.
- Professional Studio accounts with `ADMIN` and `USER` roles, workflow/device ownership and explicit grants.
- PostgreSQL-backed workflows, Assets, devices and audit events with Redis-backed sessions and login throttling.
- Restart-safe encrypted pairing credentials injected only for authorized device requests.
- Outbound `CLOUD_CALLBACK` transport for pairing and running remote phones through WSS without ADB or inbound phone ports.

The initial target is `com.garena.game.kgvn` on Xiaomi HyperOS 3 with KernelSU. The project does not inject into or inspect game memory and is not intended for in-match automation.

## Build

Android builds run on GitHub Actions; no local Android SDK is required. Every push to `main` publishes an opt-in `nightly` prerelease. A semantic tag such as `v0.2.0` publishes an immutable Stable release.

Required repository secrets:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

## Install and update

Download the latest signed Stable APK from the repository's [Releases](https://github.com/vuisme/AIPhone/releases) page, or select Stable/Nightly from the Android Agent dashboard and tap **Kiểm tra bản cập nhật**. Rooted phones can install silently; non-root phones use Android's confirmation screen.

Connect the phone with USB debugging enabled:

```powershell
.\adb-tool\adb.exe install AIPhone-v0.2.0-vc42.apk
```

Future versions use the same application ID and GitHub signing key. Install them over the existing app while preserving data:

```powershell
.\adb-tool\adb.exe install -r AIPhone-v0.2.0-vc42.apk
```

Do not uninstall the existing app if its local workflows and Assets must be preserved.

## Start Studio with Docker

Requirements on Windows:

- Docker Desktop.
- Node.js 22 or newer for the loopback USB bridge.
- ADB available through `AIPHONE_ADB`, `adb-tool/adb.exe`, or `PATH`.

Start the published Studio image and the local USB bridge with one command:

```powershell
.\studio\start-docker.cmd
```

Build the image from the current checkout by adding `-Build`. Stop both processes with `.\studio\stop-docker.cmd`.

Docker Compose runs PostgreSQL, Redis and the full web UI/API. Studio is available at `127.0.0.1:4175`; the authenticated USB bridge remains on the Windows host at `127.0.0.1:4174`, because Linux containers under Docker Desktop cannot reliably access Windows USB devices. The obsolete Windows UI on port `4173` is no longer started.

The launcher generates `studio/.runtime/studio.env` once and reuses it across upgrades. The first visit creates the initial administrator. Do not delete the runtime secret file or the named PostgreSQL volume: together they preserve accounts, workflows, device grants and decryptable pairing credentials.

For a VPS deployment, combine `studio/compose.yml` with `studio/compose.cloud.yml` and place an HTTPS/WebSocket reverse proxy in front of `127.0.0.1:4173`. Android Agent then connects outbound to the public Studio URL and can be claimed with a one-time code; USB and ADB are not required for that device transport.

## Start Studio without Docker

Requirements on the PC:

- Node.js 22 or newer.
- ADB available through `AIPHONE_ADB`, `adb-tool/adb.exe`, or `PATH`.

Build and start from the repository:

```powershell
npm --prefix studio/web ci
npm --prefix studio/web run build
.\studio\start-native.cmd
```

Then:

1. Open `AIPhone Agent`; enable its service and Accessibility permission. Grant KernelSU root only for image/XSpace workflows.
2. Enable USB debugging and accept the computer's RSA key.
3. Open `http://127.0.0.1:4175` if it did not open automatically.
4. Create the initial administrator or sign in with an existing Studio account.
5. Select an authorized phone by model and ADB serial.
6. Enter its pairing token only if the backend has not already stored one.

The PC host creates a separate ADB forward for USB devices. The Agent HTTP API remains bound to device loopback; remote phones instead use the outbound WSS Cloud Callback, while direct Wi-Fi/LAN discovery remains deferred.

## Repository layout

- `studio/web/` - React no-code editor, Workflow Manager, Asset Library and Capture Lab.
- `studio/host/` - loopback-only Studio server and per-device USB ADB bridge.
- `studio/` - Docker, Compose and one-command launchers for the complete PC Studio.
- `android-agent/` - Kotlin Android Agent, local API and workflow executor.
- `contracts/` - versioned workflow JSON contract and examples.
- `docs/spec.md` - approved product specification.
- `tasks/` - implementation plan and checklist.

## Security boundaries

- The Agent listens on device loopback only; the desktop host manages ADB forwarding.
- Browser requests require an opaque server-side Studio session and CSRF protection for mutations.
- Android Agent requests require its random pairing token; the bridge injects only the encrypted credential stored for the authorized ADB serial.
- Pairing tokens stay scoped to one ADB serial, are never stored in workflow data and are never returned to browser JavaScript.
- Cloud callback device secrets are encrypted at rest; one-time pairing codes expire in Redis and tunneled paths remain allowlisted.
- Studio cannot send arbitrary shell commands.
- Clone actions are restricted to package `com.garena.game.kgvn` and user `999`.
- The updater accepts only fixed `vuisme/AIPhone` GitHub Release URLs and verifies package name, version code and signing certificate.
- Signing keys are stored only in GitHub Secrets.
