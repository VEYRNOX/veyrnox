// verify-live is the last gate before latest.json: it fetches a release back from
// the public host and proves every byte matches what was signed. These tests pin
// the failure modes that matter — above all a host that rewrites a file in transit
// (found on 2026-10-01, when Cloudflare email obfuscation changed one HTML file).
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MANIFEST_NAME, SIGNATURE_NAME } from '../../../scripts/ota/manifest.mjs'
import { assertSafeBase, verifyLive } from '../../../scripts/ota/verify-live.mjs'

const BASE = 'https://updates.example.test'
const sha = (b) => createHash('sha256').update(b).digest('hex')

// A prepared + sealed release on disk, plus a fake host serving it byte for byte.
function makeRelease(extraFiles = {}) {
  const files = { 'index.html': '<html>wallet</html>', 'assets/app.js': 'console.log(1)', ...extraFiles }
  const manifest = {
    v: 1,
    channel: 'staging',
    bundleVersion: 202610010509,
    minNativeApi: 1,
    files: Object.fromEntries(Object.entries(files).map(([p, c]) => [p, sha(Buffer.from(c))])),
  }
  const dir = mkdtempSync(join(tmpdir(), 'ota-live-'))
  const manifestBytes = Buffer.from(JSON.stringify(manifest))
  const sigBytes = Buffer.from('c2lnbmF0dXJl')
  writeFileSync(join(dir, MANIFEST_NAME), manifestBytes)
  writeFileSync(join(dir, SIGNATURE_NAME), sigBytes)
  for (const [p, c] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, 'files', p)), { recursive: true })
    writeFileSync(join(dir, 'files', p), c)
  }
  const prefix = `${BASE}/staging/202610010509`
  const host = new Map([
    [`${prefix}/${MANIFEST_NAME}`, manifestBytes],
    [`${prefix}/${SIGNATURE_NAME}`, sigBytes],
    ...Object.entries(files).map(([p, c]) => [`${prefix}/files/${p}`, Buffer.from(c)]),
  ])
  return { dir, host, prefix, files }
}

// Fake fetch over a Map<url, Buffer | { status } | Error | fn>. Records every call.
function fakeFetch(host) {
  const calls = []
  const impl = async (url, opts) => {
    calls.push({ url, opts })
    let hit = host.get(url)
    if (typeof hit === 'function') hit = hit(calls.filter((c) => c.url === url).length, opts)
    if (hit instanceof Error) throw hit
    if (hit === undefined) return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) }
    if (Buffer.isBuffer(hit)) {
      return { ok: true, status: 200, arrayBuffer: async () => hit.buffer.slice(hit.byteOffset, hit.byteOffset + hit.byteLength) }
    }
    return { ok: hit.status < 400, status: hit.status, arrayBuffer: async () => new ArrayBuffer(0) }
  }
  return { impl, calls }
}

const run = (dir, host, opts = {}) => {
  const f = fakeFetch(host)
  return verifyLive(dir, BASE, { fetchImpl: f.impl, retryDelayMs: 0, ...opts }).then((r) => ({ ...r, calls: f.calls }))
}

describe('verifyLive', () => {
  it('passes when every file, the manifest and the signature match the host', async () => {
    const { dir, host } = makeRelease()
    const r = await run(dir, host)
    expect(r.ok).toBe(true)
    expect(r.failures).toEqual([])
    expect(r.checked).toBe(4) // 2 files + manifest + signature
  })

  it('fails when the host rewrites a file in transit, and reports the size change', async () => {
    const { dir, host, prefix } = makeRelease()
    host.set(`${prefix}/files/index.html`, Buffer.from('<html>wallet</html><script src="/cdn-cgi/x.js"></script>'))
    const r = await run(dir, host)
    expect(r.ok).toBe(false)
    expect(r.failures).toHaveLength(1)
    expect(r.failures[0]).toMatchObject({ path: 'index.html', reason: 'hash mismatch' })
    expect(r.failures[0].liveBytes).toBeGreaterThan(r.failures[0].localBytes)
  })

  // Found 2026-10-02: Cloudflare injected its analytics beacon into index.html, but only
  // for requests whose Accept includes text/html. Android's HTTP client sends that;
  // plain fetch and iOS send */*. A check from one client profile cannot see it.
  const ANDROID_ACCEPT = /text\/html/
  const acceptOf = (c) => c.opts?.headers?.Accept ?? ''

  it('fails when the host rewrites a file only for an Android-style Accept: text/html', async () => {
    const { dir, host, prefix, files } = makeRelease()
    const good = Buffer.from(files['index.html'])
    const rewritten = Buffer.from(`${files['index.html']}<script src="https://static.cloudflareinsights.com/beacon.js"></script>`)
    host.set(`${prefix}/files/index.html`, (_n, opts) => (ANDROID_ACCEPT.test(opts?.headers?.Accept ?? '') ? rewritten : good))
    const r = await run(dir, host)
    expect(r.ok).toBe(false)
    expect(r.failures).toHaveLength(1)
    expect(r.failures[0]).toMatchObject({ path: 'index.html', reason: 'hash mismatch', client: 'android' })
    expect(r.failures[0].liveBytes).toBeGreaterThan(r.failures[0].localBytes)
  })

  it('requests every object a second time with an Android-style Accept, and the first time without one', async () => {
    const { dir, host, prefix } = makeRelease()
    const r = await run(dir, host)
    const hits = r.calls.filter((c) => c.url === `${prefix}/files/index.html`)
    expect(hits).toHaveLength(2)
    expect(ANDROID_ACCEPT.test(acceptOf(hits[0]))).toBe(false)
    expect(ANDROID_ACCEPT.test(acceptOf(hits[1]))).toBe(true)
    expect(hits.every((c) => c.opts?.cache === 'no-store')).toBe(true)
  })

  it('does not run the Android check for an object the default check already failed', async () => {
    const { dir, host, prefix } = makeRelease()
    host.delete(`${prefix}/files/index.html`)
    const r = await run(dir, host)
    expect(r.failures).toEqual([{ path: 'index.html', reason: 'http 404' }])
    expect(r.calls.filter((c) => c.url === `${prefix}/files/index.html`)).toHaveLength(1)
  })

  it('fails on a file the host does not have', async () => {
    const { dir, host, prefix } = makeRelease()
    host.delete(`${prefix}/files/assets/app.js`)
    const r = await run(dir, host)
    expect(r.ok).toBe(false)
    expect(r.failures).toEqual([{ path: 'assets/app.js', reason: 'http 404' }])
  })

  it('fails when the live manifest is not the one that was signed', async () => {
    const { dir, host, prefix } = makeRelease()
    host.set(`${prefix}/${MANIFEST_NAME}`, Buffer.from('{"v":1,"tampered":true}'))
    const r = await run(dir, host)
    expect(r.ok).toBe(false)
    expect(r.failures.map((f) => f.path)).toEqual([MANIFEST_NAME])
  })

  it('fails when the signature is missing from the host', async () => {
    const { dir, host, prefix } = makeRelease()
    host.delete(`${prefix}/${SIGNATURE_NAME}`)
    const r = await run(dir, host)
    expect(r.ok).toBe(false)
    expect(r.failures).toEqual([{ path: SIGNATURE_NAME, reason: 'http 404' }])
  })

  it('fails when the host serves a different signature than the one sealed locally', async () => {
    const { dir, host, prefix } = makeRelease()
    host.set(`${prefix}/${SIGNATURE_NAME}`, Buffer.from('b3RoZXItc2ln'))
    const r = await run(dir, host)
    expect(r.ok).toBe(false)
    expect(r.failures.map((f) => f.path)).toEqual([SIGNATURE_NAME])
    expect(r.failures[0].reason).toBe('hash mismatch')
  })

  it('retries a network error and a 5xx, then passes', async () => {
    const { dir, host, prefix, files } = makeRelease()
    const good = Buffer.from(files['index.html'])
    host.set(`${prefix}/files/index.html`, (n) => (n === 1 ? new Error('reset') : n === 2 ? { status: 503 } : good))
    const r = await run(dir, host)
    expect(r.ok).toBe(true)
    // Three default-client requests (error, 503, success); the Android-profile check is a fourth call.
    const hits = r.calls.filter((c) => c.url === `${prefix}/files/index.html`)
    expect(hits.filter((c) => !ANDROID_ACCEPT.test(acceptOf(c)))).toHaveLength(3)
    expect(hits).toHaveLength(4)
  })

  it('reports a permanently unreachable file once retries are spent', async () => {
    const { dir, host, prefix } = makeRelease()
    host.set(`${prefix}/files/index.html`, () => new Error('down'))
    const r = await run(dir, host, { retries: 2 })
    expect(r.ok).toBe(false)
    expect(r.failures).toEqual([{ path: 'index.html', reason: 'unreachable' }])
    expect(r.calls.filter((c) => c.url === `${prefix}/files/index.html`)).toHaveLength(3)
  })

  it('does not retry a 404 (the object is not there; asking again changes nothing)', async () => {
    const { dir, host, prefix } = makeRelease()
    host.delete(`${prefix}/files/index.html`)
    const r = await run(dir, host)
    expect(r.calls.filter((c) => c.url === `${prefix}/files/index.html`)).toHaveLength(1)
  })

  it('never lets a cache answer: every request is no-store', async () => {
    const { dir, host } = makeRelease()
    const r = await run(dir, host)
    expect(r.calls.length).toBeGreaterThan(0)
    expect(r.calls.every((c) => c.opts?.cache === 'no-store')).toBe(true)
  })

  it('builds URLs from the manifest channel and version, so the wrong channel cannot be checked', async () => {
    const { dir, host } = makeRelease()
    const r = await run(dir, host)
    expect(r.calls.every((c) => c.url.startsWith(`${BASE}/staging/202610010509/`))).toBe(true)
  })

  it('requests the exact URL a device builds: `${release}/files/${path}`, path unescaped', async () => {
    // src/lib/otaUpdate.js downloads `${releaseUrl}/files/${path}` with the raw path.
    // Escaping here would check URLs no device ever asks for. '@' is in the bundle's
    // safe path alphabet and must stay as is.
    const { dir, host, prefix } = makeRelease({ 'assets/@scope/a.js': 'x' })
    const r = await run(dir, host)
    expect(r.ok).toBe(true)
    expect(r.calls.some((c) => c.url === `${prefix}/files/assets/@scope/a.js`)).toBe(true)
    expect(r.calls.some((c) => c.url.includes('%40'))).toBe(false)
  })

  it('refuses an unsafe manifest path before making any request', async () => {
    const { dir, host } = makeRelease()
    const m = JSON.parse(await (await import('node:fs/promises')).readFile(join(dir, MANIFEST_NAME), 'utf8'))
    m.files['../escape.js'] = sha(Buffer.from('x'))
    writeFileSync(join(dir, MANIFEST_NAME), JSON.stringify(m))
    const f = fakeFetch(host)
    await expect(verifyLive(dir, BASE, { fetchImpl: f.impl })).rejects.toThrow(/unsafe path/i)
    expect(f.calls).toHaveLength(0)
  })

  it('refuses a manifest with no files', async () => {
    const { dir, host } = makeRelease()
    writeFileSync(join(dir, MANIFEST_NAME), JSON.stringify({ v: 1, channel: 'staging', bundleVersion: 1, files: {} }))
    const f = fakeFetch(host)
    await expect(verifyLive(dir, BASE, { fetchImpl: f.impl })).rejects.toThrow(/no files/i)
  })
})

describe('assertSafeBase', () => {
  it('accepts https', () => {
    expect(assertSafeBase('https://updates.veyrnox.com')).toBe('https://updates.veyrnox.com')
  })
  it('strips a trailing slash so URLs do not double up', () => {
    expect(assertSafeBase('https://updates.veyrnox.com/')).toBe('https://updates.veyrnox.com')
  })
  it('refuses plain http to a real host: a check over http proves nothing about what devices get', () => {
    expect(() => assertSafeBase('http://updates.veyrnox.com')).toThrow(/https/)
  })
  it('allows http to localhost for local rehearsal', () => {
    expect(assertSafeBase('http://localhost:8787')).toBe('http://localhost:8787')
    expect(assertSafeBase('http://127.0.0.1:8787')).toBe('http://127.0.0.1:8787')
  })
  it('refuses a non-URL and credentials in the URL', () => {
    expect(() => assertSafeBase('not a url')).toThrow()
    expect(() => assertSafeBase('https://user:pw@updates.veyrnox.com')).toThrow(/credentials/i)
  })
})
