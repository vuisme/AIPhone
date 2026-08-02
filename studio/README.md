# AIPhone Studio

This directory contains the complete account-aware PC-side Studio deployment:

- `web/` - React workflow editor.
- `host/` - authenticated loopback-only Studio API and USB ADB bridge.
- `Dockerfile`, `compose.yml` and `compose.tunnel.yml` - web UI, PostgreSQL and Redis deployment.
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

Compose starts PostgreSQL on `127.0.0.1:55432`, Redis on `127.0.0.1:56379`, and the single full Studio UI/API on `127.0.0.1:4175`. The authenticated USB bridge runs directly on Windows at `127.0.0.1:4174` because Docker Desktop Linux containers do not have reliable direct access to Windows USB devices. The obsolete local UI on port `4173` is no longer started on Windows.

On the first visit, create the initial administrator. Administrators can manage all members, workflows, devices and grants. Users can manage owned resources and use resources explicitly granted to them. Pairing tokens are encrypted in PostgreSQL and are never returned to browser JavaScript.

`stop-docker.cmd` stops services without deleting the named `postgres-data` or `redis-data` volumes. Do not run `docker compose down --volumes` unless permanent account, workflow and device data deletion is intended.

## Cloud Callback on a VPS

Cloud Callback runs the full Studio API inside Docker and does not require ADB. Copy `cloud.env.example` to a private environment file, replace all placeholder values, then run:

```bash
docker compose --env-file cloud.env -f compose.yml -f compose.cloud.yml up -d --build
```

Keep Studio bound to `127.0.0.1:4173` and put Caddy, Nginx or another reverse proxy in front of it. The public origin must use a valid HTTPS certificate and proxy WebSocket upgrades for `/callback/v1/connect`. Caddy handles the upgrade automatically:

```caddyfile
studio.example.com {
    reverse_proxy 127.0.0.1:4173
}
```

In Android Agent, open **Cloud Callback**, enter `https://studio.example.com`, enable the connection, then enter the displayed 10-character code through **Thiết bị → Thêm máy Cloud** in Studio. The phone initiates the connection, so it works through NAT/4G without an inbound phone port.

The initial callback gateway supports one Studio API replica. Do not horizontally scale the `studio` service until a shared socket gateway is introduced.

## Cloudflare Tunnel and local USB mode

On a Windows Studio host, the same full Studio instance on loopback port `4175` serves both Cloud Callback and the local USB bridge on port `4174`:

```powershell
docker compose --env-file .\studio\.runtime\studio.env -f .\studio\compose.yml -f .\studio\compose.tunnel.yml up -d --build studio-cloud
```

Point the Cloudflare Tunnel hostname at `http://localhost:4175`. This instance disables ADB and uses Secure session cookies, while sharing the existing PostgreSQL and Redis data. Cloudflare must proxy WebSocket upgrades for `/callback/v1/connect`, which Tunnel ingress does automatically.
