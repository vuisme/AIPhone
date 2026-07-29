# AIPhone

AIPhone is a rooted Android visual-automation agent with a browser-based no-code workflow Studio. It is designed for Unity/SurfaceView applications where Android's accessibility tree cannot expose internal buttons.

## MVP capabilities

- Drag-and-drop workflow nodes with branches and loops.
- Capture the current Android screen and crop native-pixel PNG templates in the browser.
- Replace templates without rebuilding the APK.
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

Connect the phone with USB debugging enabled:

```powershell
.\adb-tool\adb.exe install AIPhone-v0.1.1.apk
```

Future versions use the same application ID and GitHub signing key. Install them over the existing app while preserving data:

```powershell
.\adb-tool\adb.exe install -r AIPhone-v0.1.2.apk
```

Do not uninstall the existing app if its local workflows/templates must be preserved.

## Start Studio

1. Open `AIPhone Agent` on Android and grant root in KernelSU Manager.
2. Copy the 128-bit pairing token shown in the app.
3. Keep the Agent foreground notification enabled.
4. Forward the local port:

```powershell
.\adb-tool\adb.exe forward tcp:8765 tcp:8765
```

5. Open `http://127.0.0.1:8765` on the computer and enter the pairing token. The browser retains it only for the current session.

## Repository layout

- `studio/` - React no-code editor and template crop UI.
- `android-agent/` - Kotlin Android Agent, local API and workflow executor.
- `contracts/` - versioned workflow JSON contract and examples.
- `docs/spec.md` - approved product specification.
- `tasks/` - implementation plan and checklist.

## Security boundaries

- The Agent listens on device loopback only; use ADB port forwarding.
- Every API request requires the random pairing token shown by the Android app.
- Studio cannot send arbitrary shell commands.
- Clone actions are restricted to package `com.garena.game.kgvn` and user `999`.
- Signing keys are stored only in GitHub Secrets.
