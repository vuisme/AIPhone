# ADR-005: Device Runtime Capabilities and File References

## Status

Accepted

## Date

2026-08-02

## Context

Workflows are reused across phones, but installed TTS engines, voice models and Android AI services vary by device. A raw Android file path is also ambiguous: it may refer to the Studio PC, another fleet device, private Agent storage or a file visible to Android's system picker.

## Decision

- Agent discovers TTS engines and voices from Android `TextToSpeech` APIs on the selected run device.
- Agent discovers speech-recognition and text-classifier services only through Android public service intents. It does not invent a universal list of OEM LLM models because Android provides no such registry.
- Studio treats runtime capability results as device-specific and refreshable. Workflows keep portable preferences such as language and preferred voice, with Agent-side fallback when another phone lacks the exact model.
- File-producing nodes return an additive `AIPHONE_ARTIFACT` reference with `scope=CURRENT_RUN_DEVICE` and `visibility=AGENT_PRIVATE`.
- Runtime variables support dotted references such as `{{ttsResult.file.path}}` and `{{ttsResult.file.artifactId}}`.
- Private artifact paths are not presented as system-picker paths. A future select-file workflow must explicitly export or share the artifact before another app can browse it.

## File Reference Contract

```json
{
  "kind": "AIPHONE_ARTIFACT",
  "scope": "CURRENT_RUN_DEVICE",
  "visibility": "AGENT_PRIVATE",
  "artifactId": "87b6b073-f3a6-4e0b-9c06-794e79f7e3b8",
  "fileName": "87b6b073-f3a6-4e0b-9c06-794e79f7e3b8.wav",
  "mimeType": "audio/wav",
  "sizeBytes": 1024,
  "path": "/data/user/0/com.aiphone.agent/files/audio/87b6b073-f3a6-4e0b-9c06-794e79f7e3b8.wav",
  "uri": "aiphone://artifact/87b6b073-f3a6-4e0b-9c06-794e79f7e3b8",
  "downloadPath": "/api/runs/audio/87b6b073-f3a6-4e0b-9c06-794e79f7e3b8"
}
```

## Consequences

- Studio can show the exact engines, languages and voice IDs present on the phone being edited or debugged.
- A workflow remains portable because runtime model discovery is separated from its preferred model configuration.
- Direct Agent upload nodes can resolve `artifactId` or `path` without confusing Android and PC filesystems.
- System-picker automation requires a separate export/share step instead of relying on an inaccessible app-private path.
