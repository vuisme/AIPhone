export interface RuntimeVariableReference {
  name: string
  type: 'JSON' | 'STRING' | 'NUMBER'
  description: string
}

const TTS_RESULT_FIELDS: Array<Omit<RuntimeVariableReference, 'name'> & { suffix: string }> = [
  { suffix: '', type: 'JSON', description: 'Toàn bộ kết quả TTS' },
  { suffix: '.file', type: 'JSON', description: 'File reference thuộc điện thoại đang chạy workflow' },
  { suffix: '.file.path', type: 'STRING', description: 'Đường dẫn private trên Android Agent; dùng cho node chạy trên chính máy này' },
  { suffix: '.file.artifactId', type: 'STRING', description: 'ID file ổn định để node Agent tải hoặc upload trực tiếp' },
  { suffix: '.file.downloadPath', type: 'STRING', description: 'API path để lấy file qua Agent/Cloud Callback' },
  { suffix: '.file.fileName', type: 'STRING', description: 'Tên file WAV' },
  { suffix: '.file.mimeType', type: 'STRING', description: 'MIME type audio/wav' },
  { suffix: '.file.sizeBytes', type: 'NUMBER', description: 'Kích thước file theo byte' },
  { suffix: '.engine', type: 'STRING', description: 'Package TTS engine đã sử dụng' },
  { suffix: '.voice', type: 'STRING', description: 'Voice/model thực tế đã sử dụng' },
  { suffix: '.languageTag', type: 'STRING', description: 'Ngôn ngữ thực tế của voice' },
  { suffix: '.durationMs', type: 'NUMBER', description: 'Thời lượng audio theo mili giây' },
]

export function ttsRuntimeVariableReferences(rootName: string): RuntimeVariableReference[] {
  if (!rootName) return []
  return TTS_RESULT_FIELDS.map((field) => ({ name: `${rootName}${field.suffix}`, type: field.type, description: field.description }))
}
