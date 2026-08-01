# Spec: Phone Automation Studio

Status: Draft for review

## Assumptions

1. Studio chạy trong trình duyệt trên máy tính; Android Agent phục vụ giao diện và API cục bộ.
2. Kết nối ưu tiên qua USB bằng `adb forward`; LAN là chế độ tùy chọn có mã ghép nối.
3. Khi workflow đã bắt đầu, điện thoại tiếp tục chạy nếu trình duyệt hoặc máy tính ngắt kết nối.
4. Thiết bị mục tiêu ban đầu là Xiaomi `2509FPN0BC`, Android 16/API 36, HyperOS `OS3.0.306.0`, ARM64.
5. KernelSU sẽ cấp quyền root cho Android Agent; không phụ thuộc vào quyền root của ADB shell.
6. Liên Quân được tự động hóa bằng screenshot, template matching, OCR và input; không hook hoặc đọc bộ nhớ tiến trình game.
7. App kép của HyperOS dùng clone profile `999` (`XSpace`). Cách tạo/xóa phải được xác minh trên thiết bị trước khi khóa implementation.

## Objective

Xây dựng một hệ thống no-code cho phép người dùng:

- Kéo-thả node để tạo kịch bản automation Android.
- Chụp màn hình điện thoại trực tiếp trong Studio, crop vùng ảnh và lưu thành template.
- Thay template hoặc chỉnh workflow mà không cần build lại APK.
- Chạy toàn bộ workflow trên điện thoại sau khi máy tính gửi lệnh start.
- Lưu log, ảnh kết quả và trạng thái cuối để máy tính lấy lại khi kết nối.
- Tự động hóa quy trình ngoài trận: tạo app kép Liên Quân, mở game, nhận quà, kiểm tra quà, dừng khi đúng hoặc xóa app kép và lặp lại.

## Non-goals

- Không điều khiển nhân vật trong trận.
- Không hook, inject, né anti-cheat hoặc reverse-engineer bộ nhớ game.
- Không yêu cầu UI hierarchy bên trong `unitySurfaceView`.
- Không phụ thuộc máy tính để xử lý ảnh hoặc quyết định bước tiếp theo trong lúc workflow chạy.
- Phiên bản USB hỗ trợ chọn một trong nhiều điện thoại đang hiện trong `adb devices`; mỗi lần chỉ điều khiển một máy đích trong Studio.

## Target Device

- Model: Xiaomi `2509FPN0BC` (`popsicle`)
- OS: Android 16, API 36
- HyperOS: `OS3.0.306.0.WPBCNXM`, HyperOS 3
- ABI: `arm64-v8a`
- Display: `1200x2608`, density `480`; game chạy landscape `2608x1200`
- Main user: `0`
- Security Space: `10`
- Clone profile/XSpace: `999`
- Root: KernelSU
- Target package: `com.garena.game.kgvn`

## Architecture

```text
Desktop Browser
    |
    | same-origin HTTP
    v
PC Studio Host (127.0.0.1)
    |-- serves the built Studio
    |-- enumerates authorized USB devices through adb
    `-- creates a per-serial adb forward and proxies Agent requests
         |
         v
Android Agent (127.0.0.1:8765 on each phone)
    |-- Embedded Studio static assets
    |-- Workflow and template API
    |-- Workflow validator/executor
    |-- Screenshot and vision engine
    |-- Root command gateway
    |-- HyperOS XSpace provider
    |-- Run log and artifact store
    `-- Foreground execution service
```

The Android Agent is the source of truth. Studio only edits resources and observes runs. Starting a run creates an immutable workflow snapshot so later edits cannot alter a run already in progress.

## Tech Stack

### Studio

- React `19.2.8`
- TypeScript `6.0.2`
- Vite `8.1.5`
- `@xyflow/react` `12.11.2` for the node canvas
- Zod `4.4.3` for boundary validation and shared workflow schemas
- Canvas-based crop editor that preserves native screenshot pixels

### PC Studio Host

- Node.js standard-library HTTP server bound to `127.0.0.1` only
- Serves the production Studio independently from the Android APK
- Enumerates USB devices using `adb devices -l`
- Creates isolated `adb forward` mappings per selected device serial
- Proxies only `/api/*` requests to the fixed Agent port `8765`
- Never accepts arbitrary target URLs, hosts, ports or shell arguments from the browser
- Supports a bridge-only mode at `127.0.0.1:4174` for the Docker-hosted Studio UI
- Allows cross-origin bridge requests only from local Studio origins on port `4173`

The listed web versions are locked in `studio/web/package-lock.json`.

### Android Agent

- Native Kotlin Android application
- `compileSdk` and `targetSdk`: 36
- Minimum SDK: 30
- Android foreground service for active runs
- Root command adapter compatible with KernelSU
- OpenCV Android for template matching
- ML Kit on-device Text Recognition for optional OCR
- Room/SQLite for workflow metadata and run history
- App-private storage for PNG templates, screenshots and exported workflow bundles
- Embedded local HTTP server with Server-Sent Events for logs/status

Android Gradle Plugin, Kotlin, OpenCV, ML Kit and embedded-server versions must be pinned during project bootstrap after compatibility verification against API 36. They are intentionally not guessed in this draft.

## Connection Modes

### USB, default

The Agent binds to device loopback only. The standalone PC Studio Host discovers connected devices and manages forwarding automatically. Manual forwarding remains available for diagnostics:

```powershell
.\adb-tool\adb.exe forward tcp:8765 tcp:8765
```

Standalone Studio is available at `http://127.0.0.1:4173`. The device picker shows only devices the signed-in account may use, including serial, model and connection state from ADB. Pairing tokens remain scoped to the exact device, are encrypted persistently by the host and are never returned to browser JavaScript.

### LAN, future

- Not implemented in the current release.
- A future LAN mode may use authenticated discovery, but must remain opt-in.
- The current Agent must continue binding to loopback so USB mode does not expand its network attack surface.

## Workflow Contract

Every saved workflow uses a versioned JSON contract:

```ts
interface WorkflowDocument {
  schemaVersion: 1;
  id: string;
  name: string;
  revision: number;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  templateIds: string[];
  createdAt: string;
  updatedAt: string;
}

type WorkflowNode =
  | StartNode
  | WaitForImageNode
  | IfImageNode
  | TapImageNode
  | TapPointNode
  | SwipeNode
  | DelayNode
  | OcrNode
  | IfTextNode
  | CaptureNode
  | LaunchAppNode
  | StopAppNode
  | CreateCloneNode
  | DeleteCloneNode
  | LoopNode
  | SuccessNode
  | FailureNode;

interface CommonNodeFields {
  disabled?: boolean;
}
```

Rules:

- Exactly one `START` node.
- Node IDs and edge IDs are unique.
- Every referenced template exists before a run can start.
- Branching nodes expose named output handles such as `FOUND`, `NOT_FOUND`, `TRUE`, `FALSE` and `TIMEOUT`.
- Coordinates and search regions are normalized to `[0, 1]` relative to screenshot width/height.
- Every graph path must reach a terminal node or a declared loop.
- Unbounded loops require an explicit `allowUnlimitedRuns` acknowledgement.
- Saved documents are validated both in Studio and again by the Agent.
- Disabled nodes remain in the graph but do not execute. They follow the default outgoing edge, or the first saved outgoing edge when a branch has no default.
- Schema evolution is additive. Breaking changes require a migration from an older `schemaVersion`.

## Initial Node Catalogue

### Flow

- `Start`
- `Delay`
- `Loop`
- `Success`
- `Failure`

### Vision

- `Wait for image`: polls until found or timeout.
- `If image`: performs one or more matches and branches.
- `Tap image`: matches, applies an optional offset and taps.
- `Capture screen`: stores a named run artifact.
- `OCR region`: recognizes text inside a selected region.
- `If text`: exact, contains or regular-expression branch.

### Input

- `Tap point`
- `Long press`
- `Swipe`
- `Back`

### Application and Clone

- `Launch app`
- `Force stop app`
- `Create clone`
- `Delete clone`
- `Clear clone data`

Clone actions operate only through a typed `CloneProvider` boundary. The first provider targets HyperOS XSpace user `999`; Studio must not embed raw shell commands in workflow documents.

## Template Capture and Management

### Capture flow

1. User clicks `Capture from phone`.
2. Agent captures a lossless PNG and returns native dimensions, rotation and timestamp.
3. Studio displays the image without resampling its source pixels.
4. User drags a crop rectangle with zoom and pixel-level coordinate feedback.
5. Studio shows the cropped template and lets the user name it.
6. User selects a default match threshold and optional search region.
7. `Test match` runs against the current screenshot and overlays every match with confidence.
8. Template is uploaded and stored with a content hash.

### Template capabilities

- Replace image while preserving template ID and all node references.
- Keep multiple variants under one logical template.
- Optional alpha mask for animated or irrelevant pixels.
- Configure threshold, grayscale/color mode and allowed scale range.
- Record source screenshot metadata for debugging.
- Version template changes so older run snapshots remain reproducible.
- Export/import workflows together with their template assets as one ZIP bundle.

### Accuracy requirements

- Crop coordinates must map to original screenshot pixels, not browser CSS pixels.
- Match output includes bounding box, center point, confidence and template variant.
- A tap can target center, a normalized point inside the match, or a pixel offset.
- Search regions reduce false positives and processing cost.
- OCR is supplementary; image templates are the primary detector for Unity UI.

## Execution Model

- The executor is a deterministic state machine running one node at a time.
- Each node records start time, duration, input, result and artifact references.
- Vision polling uses a configurable interval; default is 500 ms for out-of-match automation.
- Node timeout, retry and error policy are explicit configuration fields.
- `Stop` is cooperative first and forceful after a timeout.
- On process restart, unfinished runs are marked `INTERRUPTED`; automatic resume is not enabled in v1.
- Phone screen orientation is locked or verified before coordinate-sensitive actions.
- Wake lock and foreground notification remain active during a run.

## HyperOS Clone Lifecycle

The intended workflow is:

```text
Ensure XSpace user 999 exists
-> create/install Liên Quân for user 999
-> launch package as user 999
-> execute reward workflow
-> desired reward: store evidence and stop
-> otherwise: force stop and remove/clear clone
-> repeat
```

The implementation must prototype and verify which HyperOS 3 operation correctly provisions XSpace. If Package Manager alone does not trigger required Xiaomi bookkeeping, the provider may automate Xiaomi Settings/Security Center UI as a fallback. No destructive clone command is executed until its exact target user and package are checked.

## Local API

All error responses use:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Workflow contains a missing template",
    "details": {}
  }
}
```

Initial resources:

- `GET /api/device` - device, display, root and clone-provider health.
- `POST /api/screenshots` - capture a current screenshot.
- `GET /api/templates` - list templates.
- `POST /api/templates` - upload a template.
- `PATCH /api/templates/:id` - replace image or update matching settings.
- `POST /api/templates/:id/test` - test against a screenshot.
- `GET /api/workflows` - list workflows.
- `POST /api/workflows` - create a workflow.
- `PATCH /api/workflows/:id` - update with revision conflict checking.
- `POST /api/workflows/:id/validate` - validate without running.
- `POST /api/runs` - start an immutable workflow revision.
- `POST /api/node-tests` - start execution of exactly one saved workflow node without following graph edges.
- `GET /api/runs/:id` - current/final state.
- `POST /api/runs/:id/stop` - request stop.
- `GET /api/runs/:id/events` - SSE log stream.
- `GET /api/runs/:id/artifacts` - result screenshots and logs.

Run status includes a bounded structured `logs` array with timestamp, severity, optional node ID and message. Studio keeps it collapsed by default and automatically expands it when a run fails.

Mutating resources use optimistic revision checks and return `409 CONFLICT` when Studio edits stale data.

## Project Structure

```text
android-agent/                 Android application and embedded server
  app/src/main/
  app/src/test/
  app/src/androidTest/
studio/                        Complete PC Studio project
  web/                         React no-code editor
    src/features/workflows/
    src/features/templates/
    src/features/runs/
    src/api/
    src/**/*.test.ts(x)
  host/                        Standalone server and USB ADB bridge
    server.mjs
    adb.mjs
    test/
  Dockerfile
  compose.yml
  start-docker.cmd
contracts/                     Versioned JSON schemas and generated types
docs/                          Product and architecture documentation
tasks/                         Approved implementation plan and task list
```

## Commands

Planned commands after scaffolding:

```powershell
# Studio web
npm --prefix studio/web install
npm --prefix studio/web run dev
npm --prefix studio/web run test
npm --prefix studio/web run build

# Standalone PC Studio Host (build Studio first)
node --test studio/host/test/*.test.mjs
node studio/host/server.mjs

# Docker Studio plus Windows USB bridge
.\studio\start-docker.cmd

# Android
.\android-agent\gradlew.bat test
.\android-agent\gradlew.bat connectedAndroidTest
.\android-agent\gradlew.bat assembleDebug

# Device connection
.\adb-tool\adb.exe devices -l
.\adb-tool\adb.exe forward tcp:8765 tcp:8765
```

## Code Style

- TypeScript uses discriminated unions for node types and validates external JSON at boundaries.
- Kotlin separates root commands, vision, workflow execution and HTTP transport behind interfaces.
- No workflow node may execute arbitrary user-provided shell text.
- IDs are opaque UUID strings; UI labels are not identifiers.
- Node execution results use explicit sealed variants rather than nullable values.

```ts
type NodeResult =
  | { type: "MATCH_FOUND"; confidence: number; bounds: Rect }
  | { type: "TIMEOUT"; elapsedMs: number }
  | { type: "FAILED"; code: string; message: string };
```

## Testing Strategy

### Contract tests

- Validate every node variant and reject unknown/malformed input.
- Golden tests for schema migration and workflow export/import.

### Studio tests

- Node creation, connection rules, explicit edge deletion, undo/redo and validation feedback.
- USB device selection and per-device pairing state.
- Single-node play requests and destructive-node confirmation.
- Native-pixel crop coordinate conversion at multiple browser zoom levels.
- Template replacement preserves node references.
- Browser tests at desktop and tablet widths.

### Android unit tests

- Graph validation and deterministic branch execution.
- Coordinate normalization and rotation transforms.
- Retry, timeout, cancellation and run snapshot behavior.
- Root command argument validation.

### Device integration tests

- Screenshot includes the Unity SurfaceView and has expected dimensions.
- Template test returns correct bounds/confidence from known fixtures.
- Root authorization through KernelSU.
- Create, launch, clear and delete package only in XSpace user `999`.
- Run continues after Studio disconnects.
- Standalone Studio lists the connected phone through ADB and controls the selected serial only.
- `Play node` executes exactly the selected node and does not follow outgoing edges.
- Result artifacts remain available after reconnect.

## Boundaries

### Always

- Validate workflow and template input at every external boundary.
- Verify target package and user ID immediately before clone mutations.
- Store an immutable workflow/template snapshot for every run.
- Keep root operations in a small audited module with structured arguments.
- Preserve logs and final screenshot for success and failure.

### Ask first

- Destructive operations affecting user `0`, user `10` or packages other than the configured target.
- Enabling LAN access beyond the local network.
- Adding runtime instrumentation, memory inspection or network interception.
- Automatically resuming interrupted runs after reboot.

### Never

- Accept arbitrary shell commands from Studio or workflow JSON.
- Expose unauthenticated root actions over the network.
- Hook or inject into the game process.
- Perform clone deletion without resolving and checking the exact user/package target.
- Store authentication tokens or private game data in logs.

## Success Criteria

1. Studio opens through the USB-forwarded local address and reports device/root health.
2. User captures a `2608x1200` game screenshot, zooms and crops a template without coordinate drift.
3. User creates a graph containing `Start -> Wait for image -> If image -> Tap image -> Success/Loop` without writing code.
4. Replacing a template image updates future runs without rebuilding Android or Studio.
5. `Test match` visually overlays the detected rectangle and confidence on the screenshot.
6. Agent validates and starts a workflow, then continues after Studio disconnects.
7. Agent reports terminal status and preserves logs plus final screenshot for later retrieval.
8. HyperOS provider creates and removes only the Liên Quân clone in user `999` on the target device.
9. A configured desired reward causes the run to stop; a non-matching reward follows the loop branch.
10. Malformed workflows, missing templates, denied root and clone failures produce structured actionable errors.
11. Studio runs independently at `127.0.0.1:4173`, lists USB-connected phones and routes requests only to the selected serial.
12. Double-clicking an edge removes only that edge; selecting it also exposes `Xóa liên kết` and Delete/Backspace support.
13. Every node exposes compact Play, Disable/Enable and Delete actions on the card; Play executes only that node and Disable skips it during full runs.
14. Nodes that target an Android user show `App chính` or `App kép / XSpace` instead of a raw numeric user field.

## Open Questions Before Implementation

1. Determine whether HyperOS 3 XSpace can be provisioned reliably through Package Manager commands or requires Xiaomi UI/service integration.
2. Collect representative screenshots for buttons, reward results and failure/pop-up states.
3. Decide default maximum reroll attempts and storage retention limits.
4. Define an opt-in authenticated discovery protocol before implementing Wi-Fi/LAN mode.
