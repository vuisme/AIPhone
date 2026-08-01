# AIPhone Studio

This directory contains the complete account-aware PC-side Studio deployment:

- `web/` - React workflow editor.
- `host/` - authenticated loopback-only Studio API and USB ADB bridge.
- `Dockerfile` and `compose.yml` - web UI, PostgreSQL and Redis deployment.
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

The first start generates `studio/.runtime/studio.env` with random database, Redis and AES credential-encryption secrets. Keep this ignored file together with the PostgreSQL volume when moving or restoring an installation; replacing the AES key makes existing encrypted pairing tokens unreadable.

Compose starts PostgreSQL on `127.0.0.1:55432`, Redis on `127.0.0.1:56379`, and the web UI on `127.0.0.1:4173`. The authenticated USB bridge runs directly on Windows at `127.0.0.1:4174` because Docker Desktop Linux containers do not have reliable direct access to Windows USB devices. All endpoints remain loopback-only.

On the first visit, create the initial administrator. Administrators can manage all members, workflows, devices and grants. Users can manage owned resources and use resources explicitly granted to them. Pairing tokens are encrypted in PostgreSQL and are never returned to browser JavaScript.

`stop-docker.cmd` stops services without deleting the named `postgres-data` or `redis-data` volumes. Do not run `docker compose down --volumes` unless permanent account, workflow and device data deletion is intended.
