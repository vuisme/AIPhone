# ADR-001: Workflow-Scoped Assets and Accessibility Inspector

## Status

Accepted

## Date

2026-07-31

## Context

The MVP stores one workflow and calls reusable image crops `templates`. That is too narrow for multiple automation scenarios, makes image replacement difficult, and cannot target accessible WebView text directly. Shell `uiautomator dump` also fails on continuously animated game screens because it waits for an idle UI state.

## Decision

- Introduce workflow-scoped `Asset` records with `IMAGE` and `UI_SELECTOR` variants.
- Make `assets/assetId` canonical while retaining legacy reads and API aliases for `templates/templateId`.
- Store multiple workflow documents on the Agent and execute the workflow ID supplied by Studio.
- Use an in-process Android `AccessibilityService` for live hierarchy snapshots and semantic clicks. Studio receives structured nodes plus XML for inspection and renders node bounds over a screenshot.
- Preserve image matching as the fallback for Unity surfaces and inaccessible WebViews.

## Alternatives Considered

### Continue using `uiautomator dump`

- Pros: no accessibility service declaration.
- Cons: can fail with `could not get idle state` on animated games and only supports coordinate injection.
- Rejected: unreliable for the target game and weaker for WebView controls.

### Treat text selectors as node-only configuration

- Pros: smaller schema.
- Cons: selectors cannot be named, reused or managed with other automation resources.
- Rejected: conflicts with the requested Asset library and duplicates selector data across nodes.

### Remove legacy template fields immediately

- Pros: clean schema.
- Cons: breaks saved workflows and existing APK/Studio combinations.
- Rejected: migration must be additive and upgrade-safe.

## Consequences

- The Android app requires an accessibility service and a safe root-assisted enable flow.
- Studio gains explicit workspace navigation for workflows and Assets.
- Workflow JSON migration logic remains until legacy fields can be deprecated in a future major version.
- Unity content still requires image Assets when the accessibility tree contains only `SurfaceView`.
