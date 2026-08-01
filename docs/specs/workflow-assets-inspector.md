# Spec: Workflow Assets and UI Inspector

## Objective

Extend AIPhone Studio from a single-workflow image-template editor into a multi-workflow automation workspace. Each workflow owns reusable Assets, and Assets may be either an image target or an Android UI selector captured from the live accessibility hierarchy. Users can manage workflows, replace image Assets, inspect UI text visually, and create a text-click node without editing JSON.

## Tech Stack

- Studio: React 19, TypeScript 6, Vite 8, Vitest.
- USB bridge: Node.js 22, loopback-only ADB forwarding.
- Agent: Kotlin, Android API 36, KernelSU, loopback HTTP server.
- UI inspection: Android `AccessibilityService`; root is used only to enable the service while preserving other enabled accessibility services.

## Commands

- Studio test: `npm test` in `studio/web/`.
- Studio typecheck: `npm run typecheck` in `studio/web/`.
- Studio build: `npm run build` in `studio/web/`.
- Bridge test: `npm test` in `studio/host/`.
- Docker build: `docker compose -f studio/compose.yml build`.
- Docker restart: `docker compose -f studio/compose.yml up -d --force-recreate`.
- Android test/build: GitHub Actions workflow `.github/workflows/android-apk.yml`.

## Project Structure

- `studio/web/src/contracts/`: workflow, Asset and selector contracts.
- `studio/web/src/features/workflows/`: workflow list and graph authoring.
- `studio/web/src/features/assets/`: workflow-scoped Asset library and editor.
- `studio/web/src/features/capture/`: image crop and UI inspector modes.
- `android-agent/.../storage/`: workflow and Asset persistence.
- `android-agent/.../accessibility/`: hierarchy capture, selector matching and click actions.
- `android-agent/.../server/`: versioned local REST resources.

## Code Style

Contracts use discriminated unions and additive migration fields:

```ts
type AssetRecord = ImageAsset | UiSelectorAsset

interface ImageAsset {
  type: 'IMAGE'
  id: string
  workflowId: string
  name: string
}
```

UI labels say `Asset`; `template` remains only in legacy migration code and compatibility endpoints.

## Testing Strategy

- Pure unit tests cover workflow migration, Asset validation, display selection, selector matching and tap confirmation.
- Studio component tests cover workflow and Asset management state.
- Bridge tests cover the expanded allowlisted Agent API paths.
- GitHub Actions runs Android unit tests and builds the signed upgradeable APK.
- Manual verification is performed by the user through the rebuilt local Docker Studio.

## Boundaries

- Always: preserve legacy `templates/templateId` reads; validate workflow and Asset IDs; keep HTTP/ADB endpoints loopback-only.
- Ask first: adding third-party dependencies, exposing Agent beyond loopback, or deleting the last workflow.
- Never: expose arbitrary shell execution, overwrite unrelated accessibility services, or assume Unity `SurfaceView` content is inspectable.

## Success Criteria

- Studio lists, creates, renames, selects and deletes workflows.
- Asset Library groups Assets by workflow and can replace, rename and delete image Assets.
- New data uses `assets/assetId`; legacy workflow JSON still loads and migrates without losing images.
- Capture Lab toggles between image crop and a visual UI inspector over the current phone screenshot.
- Selecting an accessible text node can create a reusable `UI_SELECTOR` Asset and a `TAP_TEXT` node.
- `TAP_TEXT` clicks the matched accessibility node, falling back to its bounds only when `ACTION_CLICK` is unavailable.
- Inspector errors clearly explain when only a Unity `SurfaceView` is visible.
- Studio tests/build and Android CI pass; Docker is rebuilt and restarted.

## Open Questions Resolved by Default

- Asset ownership is exclusive to one workflow; copying across workflows is deferred.
- Workflow deletion is blocked when it is the final remaining workflow.
- Image search and old image node type names remain compatible; only user-facing terminology and new fields change.
