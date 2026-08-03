# ADR-006: Root and Accessibility Capability Matrix

## Status

Accepted

## Date

2026-08-03

## Context

AIPhone supports rooted and non-rooted Android devices. Capability checks had drifted across the workflow executor, Agent health response and Studio catalog. In particular, image actions were marked root-only even though the Agent already supported screenshots and gestures through its Accessibility service.

Root status alone is not a sufficient capability model. Some actions need no privileged integration, some specifically need the Android accessibility hierarchy, and others can use either KernelSU shell access or Accessibility screenshot/gesture APIs.

## Decision

Use the following four requirements everywhere:

| Requirement | Meaning |
| --- | --- |
| `NONE` | No root or Accessibility dependency. Normal Android app APIs are sufficient. |
| `ACCESSIBILITY` | Requires AIPhone UI Inspector because the action reads or clicks the accessibility hierarchy. Root may enable the service automatically, but cannot replace it. |
| `ACCESSIBILITY_OR_ROOT` | The Agent may use KernelSU shell/screencap or Accessibility screenshot/gesture APIs. |
| `ROOT` | Requires a privileged shell operation that has no implemented rootless equivalent. |

### Workflow actions

| Action | Requirement | Notes |
| --- | --- | --- |
| `START`, `DELAY`, `LOOP`, `SUCCESS`, `FAILURE` | `NONE` | Workflow control only. |
| `SET_VARIABLE`, `IF`, `LOG` | `NONE` | In-process data operations. |
| `TTS_SPEAK` | `NONE` | Uses Android `TextToSpeech`; engine availability is device-specific. |
| `LAUNCH_APP` with Android user `0` | `NONE` | Uses the normal package launch intent. |
| `TAP_TEXT` | `ACCESSIBILITY` | Requires hierarchy text/content/resource matching. |
| `WAIT_IMAGE`, `IF_IMAGE`, `TAP_IMAGE` | `ACCESSIBILITY_OR_ROOT` | Screenshot uses root first and Accessibility as fallback; tap follows the same strategy. |
| `TAP_POINT`, `SWIPE` | `ACCESSIBILITY_OR_ROOT` | Uses shell input or an Accessibility gesture. |
| `CREATE_CLONE`, `DELETE_CLONE`, `CLEAR_CLONE` | `ROOT` | Modifies Xiaomi XSpace user `999`. |
| `FORCE_STOP_APP` | `ROOT` | Current implementation uses `am force-stop`. |
| `LAUNCH_APP` with Android user `999` | `ROOT` | Resolves and starts an activity in XSpace. |
| Legacy executor action `CAPTURE` | `ACCESSIBILITY_OR_ROOT` | Kept for backward compatibility; it is not currently exposed as a Studio node. |

### Agent features

| Feature | Requirement |
| --- | --- |
| Pairing, Cloud Callback, workflow sync, logs | `NONE` |
| TTS capability discovery and synthesis | `NONE` |
| UI hierarchy / selector capture | `ACCESSIBILITY` |
| Agent screenshot, image matching, screen OCR, tap, swipe | `ACCESSIBILITY_OR_ROOT` |
| XSpace management and silent APK update | `ROOT` |
| Interactive APK update | `NONE` (requires user confirmation in Android installer UI) |

The Agent health API reports screenshot, image-matching and OCR availability when either root or a ready Accessibility service is present. Studio displays the requirement on every public node and calculates `LAUNCH_APP` dynamically from its selected Android user.

## Alternatives Considered

### Treat every visual action as root-only

Rejected because Android Accessibility provides screenshot and gesture APIs on supported versions, and this unnecessarily blocks non-rooted phones.

### Treat root as a replacement for Accessibility everywhere

Rejected because text and UI-selector matching depend on the accessibility node hierarchy. A shell screenshot cannot provide those semantics.

### Maintain separate capability labels in Agent and Studio

Rejected because the previous drift caused Studio, health checks and runtime validation to disagree. Both implementations now use the same four-value matrix and regression tests.

## Consequences

- Non-rooted phones can run image, coordinate and OCR operations after the user enables AIPhone UI Inspector.
- Secure Android windows may still reject Accessibility screenshots; this is a runtime limitation, not a root classification change.
- Root remains mandatory for XSpace lifecycle operations, force-stop, clone-user launch and silent update.
- New workflow actions must be assigned one of the four requirements in both Android policy tests and Studio catalog tests.
