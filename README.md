# AIPhone

AIPhone is a rooted Android visual-automation agent with a browser-based no-code workflow Studio. It is designed for Unity/SurfaceView applications where Android's accessibility tree cannot expose internal buttons.

## MVP capabilities

- Drag-and-drop workflow nodes with branches and loops.
- Capture the current Android screen and crop native-pixel PNG templates in the browser.
- Replace templates without rebuilding the APK.
- Run Studio independently on the PC and choose a connected USB phone by ADB serial.
- Play, disable or delete a node directly from its card; double-click an edge to remove it.
- Execute workflows on the phone after the computer disconnects.
- Image wait/condition/tap nodes using on-device pixel matching.
- Typed root operations for Xiaomi HyperOS XSpace user `999`.
- Signed GitHub Actions APK builds with monotonically increasing version codes.

The initial target is `com.garena.game.kgvn` on Xiaomi HyperOS 3 with KernelSU. The project does not inject into or inspect game memory and is not intended for in-match automation.

## Build

Android builds run on GitHub Actions; no local Android SDK is required. The workflow builds Studio, bundles it into the APK, runs unit tests, signs the release, verifies the signature and uploads the APK artifact.

Required repository secrets:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

## Install and update

Download the latest signed APK from the repository's [Releases](https://github.com/vuisme/AIPhone/releases) page.

Connect the phone with USB debugging enabled:

```powershell
.\adb-tool\adb.exe install AIPhone-v0.1.5.apk
```

Future versions use the same application ID and GitHub signing key. Install them over the existing app while preserving data:

```powershell
.\adb-tool\adb.exe install -r AIPhone-v0.1.5.apk
```

Do not uninstall the existing app if its local workflows/templates must be preserved.

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

Docker serves the web UI at `127.0.0.1:4173`. The small USB bridge remains on the Windows host at `127.0.0.1:4174`, because Linux containers under Docker Desktop cannot reliably access Windows USB devices. Neither endpoint is exposed to the LAN.

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

1. Open `AIPhone Agent` on Android and grant root in KernelSU Manager.
2. Enable USB debugging and accept the computer's RSA key.
3. Open `http://127.0.0.1:4173` if it did not open automatically.
4. Select the phone shown by model and ADB serial.
5. Enter the pairing token shown in the Android app.

The PC host creates a separate ADB forward for the selected serial. The Agent remains bound to device loopback; Wi-Fi/LAN discovery is intentionally deferred.

## Repository layout

- `studio/web/` - React no-code editor and template crop UI.
- `studio/host/` - loopback-only Studio server and per-device USB ADB bridge.
- `studio/` - Docker, Compose and one-command launchers for the complete PC Studio.
- `android-agent/` - Kotlin Android Agent, local API and workflow executor.
- `contracts/` - versioned workflow JSON contract and examples.
- `docs/spec.md` - approved product specification.
- `tasks/` - implementation plan and checklist.

## Security boundaries

- The Agent listens on device loopback only; the desktop host manages ADB forwarding.
- Every API request requires the random pairing token shown by the Android app.
- Studio cannot send arbitrary shell commands.
- Clone actions are restricted to package `com.garena.game.kgvn` and user `999`.
- Signing keys are stored only in GitHub Secrets.
