# AIPhone Studio

This directory contains the complete PC-side Studio deployment:

- `web/` - React workflow editor.
- `host/` - loopback-only USB ADB bridge.
- `Dockerfile` and `compose.yml` - containerized web deployment.
- `start-docker.cmd` - starts the host USB bridge and Docker web container.
- `start-native.cmd` - runs the original all-native Node.js deployment.

## Docker on Windows

Requirements: Docker Desktop, Node.js 22 or newer, and ADB in `adb-tool/adb.exe` or `PATH`.

Start the published image:

```powershell
.\studio\start-docker.cmd
```

Build the image from the current checkout instead:

```powershell
.\studio\start-docker.cmd -Build
```

Stop both the container and USB bridge:

```powershell
.\studio\stop-docker.cmd
```

The container serves only the web UI on `127.0.0.1:4173`. The USB bridge runs directly on Windows at `127.0.0.1:4174` because Docker Desktop Linux containers do not have reliable direct access to Windows USB devices. Both endpoints remain loopback-only.
