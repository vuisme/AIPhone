import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { nodeDefinition } from './nodeCatalog'
import { NodeInspectorFields } from './NodeInspectorFields'

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
      onChange={vi.fn()}
    />)

    expect(screen.getByLabelText('TTS engine')).toHaveTextContent('Speech Services by Google')
    expect(screen.getByLabelText(/Voice \/ model ưu tiên/)).toHaveTextContent('vi-vn-local')
    expect(screen.getByLabelText(/Voice \/ model ưu tiên/)).not.toHaveTextContent('en-us-local')
    expect(screen.getByLabelText(/Nội dung đọc/)).toBeInTheDocument()
  })
})
