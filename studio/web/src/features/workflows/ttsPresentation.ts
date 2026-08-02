import type { TtsVoiceCapability } from '../../api/client'

export function languageDisplayName(languageTag: string, displayLocale = 'vi'): string {
  try {
    return new Intl.DisplayNames([displayLocale], { type: 'language' }).of(languageTag) || languageTag
  } catch {
    return languageTag
  }
}

export function voiceQualityLabel(quality: number): string {
  if (quality >= 500) return 'Rất cao'
  if (quality >= 400) return 'Cao'
  if (quality >= 300) return 'Tiêu chuẩn'
  if (quality >= 200) return 'Thấp'
  return 'Rất thấp'
}

export function voiceDisplayLabel(voice: TtsVoiceCapability): string {
  return `${languageDisplayName(voice.languageTag)} · ${voice.requiresNetwork ? 'Cloud' : 'On-device'} · ${voiceQualityLabel(voice.quality)} · ${voice.name}`
}
