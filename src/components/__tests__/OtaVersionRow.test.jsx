// OtaVersionRow is a read-only line in Settings. It reads the OTA plugin's LOCAL status
// (no network, so it is safe under I2/I3) and is hidden on web and in decoy/demo.
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ native: true, hidden: false, status: vi.fn() }))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => state.native, getPlatform: () => 'ios' },
  registerPlugin: () => ({}),
}))
vi.mock('@/wallet-core/deniabilitySession', () => ({ isDeniabilityOrDemoActive: () => state.hidden }))
vi.mock('@/lib/otaUpdate', () => ({ getOtaStatus: (...a) => state.status(...a) }))

import OtaVersionRow from '../OtaVersionRow'

const ok = { enabled: true, channel: 'production', nativeApi: 1, runningVersion: 202610011706, newestKnownVersion: 202610011706 }

beforeEach(() => {
  state.native = true
  state.hidden = false
  state.status = vi.fn().mockResolvedValue(ok)
})

describe('OtaVersionRow', () => {
  it('shows the running bundle version on a native app', async () => {
    render(<OtaVersionRow />)
    expect(await screen.findByTestId('ota-version-row')).toHaveTextContent('202610011706')
  })

  it('says when an update is staged for the next launch', async () => {
    state.status = vi.fn().mockResolvedValue({ ...ok, runningVersion: 202609231000 })
    render(<OtaVersionRow />)
    expect(await screen.findByTestId('ota-version-row')).toHaveTextContent(/staged/i)
  })

  it('renders nothing on web, and does not even ask the plugin', () => {
    state.native = false
    const { container } = render(<OtaVersionRow />)
    expect(container).toBeEmptyDOMElement()
    expect(state.status).not.toHaveBeenCalled()
  })

  it('renders nothing in a decoy or demo session, and does not ask the plugin (I3)', () => {
    state.hidden = true
    const { container } = render(<OtaVersionRow />)
    expect(container).toBeEmptyDOMElement()
    expect(state.status).not.toHaveBeenCalled()
  })

  it('renders nothing when OTA is disabled in the build', async () => {
    state.status = vi.fn().mockResolvedValue({ ...ok, enabled: false })
    const { container } = render(<OtaVersionRow />)
    await waitFor(() => expect(state.status).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('is rendered by Settings exactly once, as a component and not just imported', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync('src/pages/Settings.jsx', 'utf8')
    expect(src.match(/import OtaVersionRow from/g)).toHaveLength(1)
    expect(src.match(/<OtaVersionRow \/>/g)).toHaveLength(1)
  })

  it('renders nothing, and does not throw, when the plugin errors', async () => {
    state.status = vi.fn().mockRejectedValue(new Error('plugin missing'))
    const { container } = render(<OtaVersionRow />)
    await waitFor(() => expect(state.status).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })
})
