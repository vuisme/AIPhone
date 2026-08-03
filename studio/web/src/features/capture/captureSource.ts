import { ApiError, type CapturePreview } from '../../api/client'

export type CaptureSource =
  | ({ mode: 'SESSION' } & CapturePreview)
  | { mode: 'LEGACY'; preview: Blob }

export async function acquireCaptureSource(
  capturePreview: () => Promise<CapturePreview>,
  captureLegacy: () => Promise<Blob>,
): Promise<CaptureSource> {
  try {
    return { mode: 'SESSION', ...await capturePreview() }
  } catch (reason) {
    if (!(reason instanceof ApiError) || ![404, 405].includes(reason.status)) throw reason
    return { mode: 'LEGACY', preview: await captureLegacy() }
  }
}
