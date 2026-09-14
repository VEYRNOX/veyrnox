import { describe, expect, it, vi } from 'vitest'
import { runOtaUpdate } from '../otaUpdate.js'

function fakes({ status = {}, remote = 202609141300, missing = ['assets/a.js', 'index.html'], failOn } = {}) {
  const calls = []
  const ota = {
    notifyReady: vi.fn(async () => calls.push('notifyReady')),
    status: vi.fn(async () => ({ enabled: true, channel: 'production', newestKnownVersion: 202609141200, ...status })),
    begin: vi.fn(async ({ version }) => { calls.push(`begin:${version}`); return { path: 'VeyrnoxOTA/202609141300' } }),
    prepare: vi.fn(async () => { calls.push('prepare'); return { missing } }),
    stage: vi.fn(async () => calls.push('stage')),
  }
  const filesystem = {
    downloadFile: vi.fn(async ({ url, path, directory }) => {
      if (failOn && url.endsWith(failOn)) throw new Error('network')
      calls.push(`get ${url} -> ${directory}:${path}`)
    }),
  }
  const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ bundleVersion: remote }) }))
  return { calls, ota, filesystem, fetchImpl, baseUrl: 'https://u.test' }
}

describe('runOtaUpdate', () => {
  it('does nothing but report ready when OTA is disabled', async () => {
    const f = fakes({ status: { enabled: false } })
    expect(await runOtaUpdate(f)).toBe('disabled')
    expect(f.ota.notifyReady).toHaveBeenCalled()
    expect(f.fetchImpl).not.toHaveBeenCalled()
  })

  it('stops when the remote version is not newer than anything native has seen', async () => {
    const f = fakes({ remote: 202609141200 })
    expect(await runOtaUpdate(f)).toBe('current')
    expect(f.ota.begin).not.toHaveBeenCalled()
  })

  it('ignores a garbage pointer', async () => {
    const f = fakes({ remote: 'latest' })
    expect(await runOtaUpdate(f)).toBe('current')
    expect(f.ota.begin).not.toHaveBeenCalled()
  })

  it('downloads manifest + signature, then only what native says is missing, then stages', async () => {
    const f = fakes()
    expect(await runOtaUpdate(f)).toBe('staged')
    expect(f.fetchImpl).toHaveBeenCalledWith('https://u.test/production/latest.json', { cache: 'no-store' })
    const r = 'https://u.test/production/202609141300'
    expect(f.calls.slice(0, 5)).toEqual([
      'notifyReady',
      'begin:202609141300',
      `get ${r}/ota-manifest.json -> LIBRARY:VeyrnoxOTA/202609141300/ota-manifest.json`,
      `get ${r}/ota-manifest.sig -> LIBRARY:VeyrnoxOTA/202609141300/ota-manifest.sig`,
      'prepare',
    ])
    expect(f.calls.slice(5, 7).sort()).toEqual([
      `get ${r}/files/assets/a.js -> LIBRARY:VeyrnoxOTA/202609141300/assets/a.js`,
      `get ${r}/files/index.html -> LIBRARY:VeyrnoxOTA/202609141300/index.html`,
    ])
    expect(f.calls.at(-1)).toBe('stage')
  })

  it('never stages when a download fails', async () => {
    const f = fakes({ failOn: 'files/index.html' })
    await expect(runOtaUpdate(f)).rejects.toThrow('network')
    expect(f.ota.stage).not.toHaveBeenCalled()
  })
})
