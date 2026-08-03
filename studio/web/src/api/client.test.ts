import { afterEach, describe, expect, it, vi } from 'vitest'
import { agentApi, apiErrorMessage, buildAgentPath, buildBridgeDevicePath, isStandaloneLocation, setAgentDeviceSerial } from './client'

afterEach(() => {
  vi.unstubAllGlobals()
  setAgentDeviceSerial('')
})

describe('isStandaloneLocation', () => {
  it('treats a secure same-origin deployment as account-aware Studio', () => {
    expect(isStandaloneLocation({ protocol: 'https:', port: '' }, '')).toBe(true)
  })

  it('keeps the Android Agent HTTP origin in embedded mode', () => {
    expect(isStandaloneLocation({ protocol: 'http:', port: '8765' }, '')).toBe(false)
  })
})

describe('buildAgentPath', () => {
  it('routes through the selected ADB serial', () => {
    expect(buildAgentPath('/api/device', 'phone:5555')).toBe('/bridge/devices/phone%3A5555/api/device')
  })

  it('keeps direct Agent paths for the embedded Studio', () => {
    expect(buildAgentPath('/api/device', '')).toBe('/api/device')
  })
})

describe('buildBridgeDevicePath', () => {
  it('builds a host-side USB screen endpoint without going through the Agent API', () => {
    expect(buildBridgeDevicePath('/screen', 'phone:5555')).toBe('/bridge/devices/phone%3A5555/screen')
  })
})

describe('apiErrorMessage', () => {
  it('extracts the Agent error message used by Studio notices', () => {
    expect(apiErrorMessage('{"error":{"code":"CONFLICT","message":"Workflow is running"}}', 409)).toBe('Workflow is running')
  })

  it('preserves plain bridge failures', () => {
    expect(apiErrorMessage('ADB device is not connected', 404)).toBe('ADB device is not connected')
  })

  it('replaces Cloudflare HTML gateway pages with a concise timeout message', () => {
    const html = '<!DOCTYPE html><html><head><title>504: Gateway time-out</title></head><body>Host Error</body></html>'

    expect(apiErrorMessage(html, 504)).toBe('Cloud Callback quá thời gian phản hồi (HTTP 504). Hãy thử lại.')
  })
})

describe('Agent capture sessions', () => {
  it('reads a lightweight preview and its source dimensions from response headers', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('preview', {
      status: 200,
      headers: {
        'Content-Type': 'image/webp',
        'X-AIPhone-Capture-Id': '87b6b073-f3a6-4e0b-9c06-794e79f7e3b8',
        'X-AIPhone-Source-Width': '2608',
        'X-AIPhone-Source-Height': '1200',
        'X-AIPhone-Preview-Width': '1280',
        'X-AIPhone-Preview-Height': '589',
        'X-AIPhone-Capture-Expires-At': '1785744000000',
      },
    })))

    const capture = await agentApi.capturePreview()

    expect(capture.captureId).toBe('87b6b073-f3a6-4e0b-9c06-794e79f7e3b8')
    expect(capture.sourceSize).toEqual({ width: 2608, height: 1200 })
    expect(capture.previewSize).toEqual({ width: 1280, height: 589 })
    expect(capture.preview.type).toBe('image/webp')
    expect(capture.expiresAt).toBe(1785744000000)
  })

  it('requests a lossless crop using normalized coordinates', async () => {
    const fetchMock = vi.fn(async () => new Response('png', {
      status: 200,
      headers: { 'Content-Type': 'image/png' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const crop = await agentApi.cropCapture('87b6b073-f3a6-4e0b-9c06-794e79f7e3b8', {
      x: 0.1,
      y: 0.2,
      width: 0.3,
      height: 0.4,
    })

    expect(crop.type).toBe('image/png')
    expect(fetchMock).toHaveBeenCalledWith('/api/captures/87b6b073-f3a6-4e0b-9c06-794e79f7e3b8/crop', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 }),
    }))
  })
})
