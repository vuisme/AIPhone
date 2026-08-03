import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nodeDefinition } from './nodeCatalog'
import { NodeInspectorFields } from './NodeInspectorFields'

afterEach(cleanup)

describe('TTS inspector', () => {
  it('shows engines and compatible local or cloud voice models from the selected phone', () => {
    const definition = nodeDefinition('TTS_SPEAK')
    render(<NodeInspectorFields
      definition={definition}
      nodeType="TTS_SPEAK"
      config={{ ...definition.defaultConfig, languageTag: 'vi-VN', engine: 'com.google.android.tts', voice: '' }}
      assets={[]}
      variables={['playerName']}
      ttsCapabilities={{
        available: true,
        defaultEngine: 'com.google.android.tts',
        engines: [{
          packageName: 'com.google.android.tts',
          label: 'Speech Services by Google',
          voices: [
            { name: 'vi-vn-local', languageTag: 'vi-VN', quality: 400, latency: 200, requiresNetwork: false, features: [] },
            { name: 'en-us-local', languageTag: 'en-US', quality: 400, latency: 200, requiresNetwork: false, features: [] },
          ],
        }],
      }}
      onRefreshTtsCapabilities={vi.fn()}
      onChange={vi.fn()}
    />)

    expect(screen.getByLabelText('TTS engine')).toHaveTextContent('Speech Services by Google')
    expect(screen.getByLabelText(/Voice \/ model ưu tiên/)).toHaveTextContent('On-device')
    expect(screen.getByLabelText(/Voice \/ model ưu tiên/)).toHaveTextContent('vi-vn-local')
    expect(screen.getByLabelText(/Voice \/ model ưu tiên/)).not.toHaveTextContent('en-us-local')
    expect(screen.getByLabelText(/Ngôn ngữ/)).toHaveTextContent('vi-VN')
    expect(screen.getByText('1 engine · 2 voice trên máy đang chọn')).toBeInTheDocument()
    expect(screen.getByLabelText('Quét lại TTS model trên điện thoại')).toBeInTheDocument()
    expect(screen.getByLabelText(/Nội dung đọc/)).toBeInTheDocument()
  })
})

describe('coordinate inspector actions', () => {
  it.each([
    ['TAP_POINT', 'Lấy điểm chạm từ Capture Lab'],
    ['SWIPE', 'Lấy hướng vuốt từ Capture Lab'],
  ] as const)('opens Capture Lab for %s', (nodeType, accessibleName) => {
    const definition = nodeDefinition(nodeType)
    const onPickCoordinates = vi.fn()
    render(<NodeInspectorFields
      definition={definition}
      nodeType={nodeType}
      config={definition.defaultConfig}
      assets={[]}
      variables={[]}
      onPickCoordinates={onPickCoordinates}
      onChange={vi.fn()}
    />)

    screen.getByRole('button', { name: accessibleName }).click()
    expect(onPickCoordinates).toHaveBeenCalledOnce()
  })

  it('does not show coordinate capture for unrelated nodes', () => {
    const definition = nodeDefinition('DELAY')
    const view = render(<NodeInspectorFields
      definition={definition}
      nodeType="DELAY"
      config={definition.defaultConfig}
      assets={[]}
      variables={[]}
      onPickCoordinates={vi.fn()}
      onChange={vi.fn()}
    />)

    expect(view.container.querySelector('.coordinate-picker-launch')).toBeNull()
  })
})
