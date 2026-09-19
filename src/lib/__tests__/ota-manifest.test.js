// @vitest-environment node
// OTA manifest + release tooling. The manifest is the signed payload the native
// loader trusts, so its shape and the release guards are pinned here; the native
// verifier's own tests live in android/app/src/test/.../OtaBundleVerifierTest.kt.
import { generateKeyPairSync, sign } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildManifest, MANIFEST_NAME, NATIVE_API, SIGNATURE_NAME, timestampVersion } from '../../../scripts/ota/manifest.mjs'
import { pinnedPublicKeys, prepareRelease, sealRelease, toDerSignature, verifyRelease } from '../../../scripts/ota/release.mjs'

const CLEAN_FLAGS = JSON.stringify({ VITE_BYPASS_RASP: null, VITE_DEV_UNGATE_SEND: '0', VITE_DEMO_MODE: null })

function makeDist(files = { 'index.html': '<html>', 'assets/a.js': 'a()', 'ota-build-flags.json': CLEAN_FLAGS }) {
  const dir = mkdtempSync(join(tmpdir(), 'ota-dist-'))
  for (const [p, c] of Object.entries(files)) {
    mkdirSync(join(dir, p, '..'), { recursive: true })
    writeFileSync(join(dir, p), c)
  }
  return dir
}

function writeManifest(dir, opts = { channel: 'production', bundleVersion: 202609141230 }) {
  const m = buildManifest(dir, opts)
  writeFileSync(join(dir, MANIFEST_NAME), JSON.stringify(m))
  return m
}

describe('buildManifest', () => {
  it('hashes every file in a fixed key order and skips its own files', () => {
    const dir = makeDist()
    writeFileSync(join(dir, MANIFEST_NAME), 'old')
    writeFileSync(join(dir, SIGNATURE_NAME), 'old')
    const m = buildManifest(dir, { channel: 'staging', bundleVersion: 7 })
    expect(Object.keys(m)).toEqual(['v', 'channel', 'bundleVersion', 'minNativeApi', 'files'])
    expect(Object.keys(m.files)).toEqual(['assets/a.js', 'index.html', 'ota-build-flags.json'])
    expect(m.files['index.html']).toMatch(/^[0-9a-f]{64}$/)
    expect(m.minNativeApi).toBe(NATIVE_API)
  })

  it('refuses a bundle without index.html, a bad channel or a bad version', () => {
    expect(() => buildManifest(makeDist({ 'a.js': 'x' }), { channel: 'production', bundleVersion: 1 })).toThrow(/index.html/)
    expect(() => buildManifest(makeDist(), { channel: 'dev', bundleVersion: 1 })).toThrow(/channel/)
    expect(() => buildManifest(makeDist(), { channel: 'production', bundleVersion: 0 })).toThrow(/bundleVersion/)
  })

  it('refuses file names outside the safe character set', () => {
    expect(() => buildManifest(makeDist({ 'index.html': 'x', 'a b.js': 'x' }), { channel: 'production', bundleVersion: 1 })).toThrow(/unsafe/)
  })

  it('timestamp versions are monotonic yyyyMMddHHmm integers', () => {
    expect(timestampVersion(new Date(Date.UTC(2026, 8, 14, 9, 5)))).toBe(202609140905)
    expect(timestampVersion(new Date(Date.UTC(2026, 8, 14, 9, 6)))).toBeGreaterThan(202609140905)
  })
})

describe('release tooling', () => {
  it('lays out the upload tree', () => {
    const dist = makeDist()
    const m = writeManifest(dist)
    const out = mkdtempSync(join(tmpdir(), 'ota-out-'))
    const { releaseDir } = prepareRelease(dist, out)
    expect(readFileSync(join(releaseDir, 'files/assets/a.js'), 'utf8')).toBe('a()')
    expect(readFileSync(join(releaseDir, MANIFEST_NAME), 'utf8')).toBe(JSON.stringify(m))
    expect(JSON.parse(readFileSync(join(out, 'production/latest.json'), 'utf8'))).toEqual({ bundleVersion: 202609141230 })
  })

  it('refuses a dist that changed after the manifest was written', () => {
    const dist = makeDist()
    writeManifest(dist)
    writeFileSync(join(dist, 'assets/a.js'), 'steal()')
    expect(() => prepareRelease(dist, mkdtempSync(join(tmpdir(), 'ota-out-')))).toThrow(/changed/)
  })

  it.each(['VITE_BYPASS_RASP', 'VITE_DEV_UNGATE_SEND', 'VITE_DEMO_MODE'])('refuses a bundle with %s:"1"', (flag) => {
    const dist = makeDist({ 'index.html': 'x', 'assets/a.js': `{${flag}:"1"}`, 'ota-build-flags.json': CLEAN_FLAGS })
    writeManifest(dist)
    expect(() => prepareRelease(dist, mkdtempSync(join(tmpdir(), 'ota-out-')))).toThrow(flag)
  })

  it.each(['VITE_BYPASS_RASP', 'VITE_DEV_UNGATE_SEND', 'VITE_DEMO_MODE'])('refuses an obfuscated bundle whose build flags set %s=1', (flag) => {
    const dist = makeDist({ 'index.html': 'x', 'assets/a.js': '_0x1f2e("a2V5")', 'ota-build-flags.json': JSON.stringify({ [flag]: '1' }) })
    writeManifest(dist)
    expect(() => prepareRelease(dist, mkdtempSync(join(tmpdir(), 'ota-out-')))).toThrow(`${flag}=1`)
  })

  it('refuses a bundle built without the build-flags file', () => {
    const dist = makeDist({ 'index.html': 'x' })
    writeManifest(dist)
    expect(() => prepareRelease(dist, mkdtempSync(join(tmpdir(), 'ota-out-')))).toThrow(/ota-build-flags/)
  })

  it('allows the flag names with a "0" value (Vite inlines the whole env object)', () => {
    const dist = makeDist({ 'index.html': 'x', 'assets/a.js': '{VITE_BYPASS_RASP:"0"}', 'ota-build-flags.json': CLEAN_FLAGS })
    writeManifest(dist)
    expect(() => prepareRelease(dist, mkdtempSync(join(tmpdir(), 'ota-out-')))).not.toThrow()
  })

  it('verify accepts a pinned key only, over the exact manifest bytes (DER ECDSA P-256)', () => {
    const dist = makeDist()
    writeManifest(dist)
    const { releaseDir } = prepareRelease(dist, mkdtempSync(join(tmpdir(), 'ota-out-')))
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
    const other = generateKeyPairSync('ec', { namedCurve: 'P-256' })
    const spki = (k) => k.export({ format: 'der', type: 'spki' }).toString('base64')
    const manifestPath = join(releaseDir, MANIFEST_NAME)
    writeFileSync(join(releaseDir, SIGNATURE_NAME), sign('sha256', readFileSync(manifestPath), privateKey).toString('base64'))

    expect(verifyRelease(releaseDir, spki(publicKey))).toBe(true)
    expect(verifyRelease(releaseDir, spki(other.publicKey))).toBe(false)
    writeFileSync(manifestPath, readFileSync(manifestPath, 'utf8').replace('202609141230', '202609141231'))
    expect(verifyRelease(releaseDir, spki(publicKey))).toBe(false)
  })

  it('verify without a key reads the pinned native keys, and refuses when none is pinned', () => {
    const kt = join(mkdtempSync(join(tmpdir(), 'ota-kt-')), 'V.kt')
    writeFileSync(kt, '    val PUBLIC_KEYS_SPKI_B64: List<String> = listOf(\n        "MFkwA",\n        "MFkwB",\n    )\n')
    expect(pinnedPublicKeys(kt)).toEqual(['MFkwA', 'MFkwB'])
    writeFileSync(kt, '    val PUBLIC_KEYS_SPKI_B64: List<String> = emptyList()\n')
    expect(() => pinnedPublicKeys(kt)).toThrow(/disabled/)
  })

  // One key per hardware token: a YubiKey key cannot be backed up, so losing a
  // token must not stop releases. Either token's signature has to be accepted.
  it('a signature from EITHER pinned token verifies, and an unpinned key never does', () => {
    const dist = makeDist()
    writeManifest(dist)
    const { releaseDir } = prepareRelease(dist, mkdtempSync(join(tmpdir(), 'ota-out-')))
    const tokenA = generateKeyPairSync('ec', { namedCurve: 'P-256' })
    const tokenB = generateKeyPairSync('ec', { namedCurve: 'P-256' })
    const stranger = generateKeyPairSync('ec', { namedCurve: 'P-256' })
    const spki = (k) => k.export({ format: 'der', type: 'spki' }).toString('base64')
    const pinned = [spki(tokenA.publicKey), spki(tokenB.publicKey)]
    const manifestPath = join(releaseDir, MANIFEST_NAME)
    const signWith = (key) =>
      writeFileSync(join(releaseDir, SIGNATURE_NAME), sign('sha256', readFileSync(manifestPath), key).toString('base64'))

    signWith(tokenA.privateKey)
    expect(verifyRelease(releaseDir, pinned)).toBe(true)
    signWith(tokenB.privateKey)
    expect(verifyRelease(releaseDir, pinned)).toBe(true)
    signWith(stranger.privateKey)
    expect(verifyRelease(releaseDir, pinned)).toBe(false)
    // A lost token is dropped from the list; its old signatures stop being accepted.
    signWith(tokenA.privateKey)
    expect(verifyRelease(releaseDir, [spki(tokenB.publicKey)])).toBe(false)
  })
})

describe('seal (hardware-token signatures)', () => {
  // PKCS#11 tools emit raw r||s; the app verifies DER. Seal converts and proves it.
  function sealed(rawOrDer) {
    const dist = makeDist()
    writeManifest(dist)
    const { releaseDir } = prepareRelease(dist, mkdtempSync(join(tmpdir(), 'ota-out-')))
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
    const spki = publicKey.export({ format: 'der', type: 'spki' }).toString('base64')
    const der = sign('sha256', readFileSync(join(releaseDir, MANIFEST_NAME)), privateKey)
    const raw = sign('sha256', readFileSync(join(releaseDir, MANIFEST_NAME)), { key: privateKey, dsaEncoding: 'ieee-p1363' })
    return { releaseDir, spki, sig: rawOrDer === 'raw' ? raw : der }
  }

  it.each(['raw', 'der'])('accepts a %s signature and stores DER that verifies', (form) => {
    const { releaseDir, spki, sig } = sealed(form)
    sealRelease(releaseDir, sig, [spki])
    expect(verifyRelease(releaseDir, [spki])).toBe(true)
    const stored = Buffer.from(readFileSync(join(releaseDir, SIGNATURE_NAME), 'utf8').trim(), 'base64')
    expect(stored[0]).toBe(0x30) // DER SEQUENCE
  })

  it('refuses a signature that does not verify, leaving no file behind', () => {
    const { releaseDir, spki } = sealed('der')
    const stranger = generateKeyPairSync('ec', { namedCurve: 'P-256' })
    const bad = sign('sha256', Buffer.from('other bytes'), stranger.privateKey)
    expect(() => sealRelease(releaseDir, bad, [spki])).toThrow(/does NOT verify/)
    expect(existsSync(join(releaseDir, SIGNATURE_NAME))).toBe(false)
  })

  it('keeps a raw signature with high bit set valid (DER needs the 0x00 pad)', () => {
    // Sweep keys until r or s has the high bit set, which is where naive DER encoding breaks.
    for (let i = 0; i < 40; i++) {
      const { releaseDir, spki, sig } = sealed('raw')
      if (!(sig[0] & 0x80) && !(sig[32] & 0x80)) continue
      sealRelease(releaseDir, sig, [spki])
      expect(verifyRelease(releaseDir, [spki])).toBe(true)
      return
    }
    throw new Error('no high-bit signature generated in 40 attempts')
  })

  it('leaves a DER signature byte-identical', () => {
    const der = Buffer.from('3045022012340220abcd', 'hex')
    expect(toDerSignature(der).equals(der)).toBe(true)
  })
})

describe('native constants', () => {
  const swift = readFileSync('ios/App/App/VeyrnoxOta.swift', 'utf8')
  const kotlin = readFileSync('android/app/src/main/java/com/veyrnox/app/OtaBundleVerifier.kt', 'utf8')

  it('NATIVE_API matches iOS and Android', () => {
    expect(swift).toMatch(new RegExp(`^\\s*static let nativeApi = ${NATIVE_API}$`, 'm'))
    expect(kotlin).toMatch(new RegExp(`^\\s*const val NATIVE_API = ${NATIVE_API}$`, 'm'))
  })

  it('iOS and Android pin the same signing keys, in the same order', () => {
    const swiftList = swift.match(/static let publicKeysSpkiB64: \[String\] = \[([^\]]*)\]/)?.[1]
    const kotlinList = kotlin.match(/PUBLIC_KEYS_SPKI_B64:\s*List<String>\s*=\s*(?:listOf\(([^)]*)\)|emptyList\(\))/)?.[1] ?? ''
    expect(swiftList).toBeTypeOf('string')
    const keysIn = (s) => [...s.matchAll(/"([^"]+)"/g)].map((m) => m[1])
    expect(keysIn(swiftList)).toEqual(keysIn(kotlinList))
  })

  // OTA was DISARMED for 1.0.2 (2026-09-19, owner decision): both pinned lists
  // are empty, which disables OTA entirely (I4).
  //
  // That alone would make the parity test above pass VACUOUSLY -- [] equals []
  // no matter how far the two platforms drift. Same shape as the flag-disabled
  // block in #1418: coverage that reads as present and is not. So while
  // disarmed, parity is enforced on the COMMENTED keys instead, and the empty
  // state is pinned so re-arming has to come through here.
  const commentedKeys = (src) =>
    [...src.matchAll(/^\s*\/\/ OTA_PINNED_KEY "([^"]+)"$/gm)].map((m) => m[1])

  it('is disarmed on both platforms', () => {
    expect(swift).toMatch(/static let publicKeysSpkiB64: \[String\] = \[\]/)
    expect(kotlin).toMatch(/PUBLIC_KEYS_SPKI_B64:\s*List<String>\s*=\s*emptyList\(\)/)
  })

  it('keeps the real keys recorded, and identical across platforms, while disarmed', () => {
    const ios = commentedKeys(swift)
    const android = commentedKeys(kotlin)
    // Two tokens were provisioned 2026-09-18; losing one from a comment during a
    // refactor would make re-arming a git-history dig.
    expect(ios).toHaveLength(2)
    expect(ios).toEqual(android)
  })

  // THE TRIPWIRE. Re-arming turns the two tests above red, which is the point:
  // docs/ota-updates.md gates arming on (1) owner sign-off against I3's "zero
  // backend calls" wording and (2) a privacy-policy disclosure of the
  // cold-start update check. Both were unmet when the keys were provisioned.
  // When you re-arm, delete the two tests above and restore parity on the live
  // lists -- do not weaken them to make a build pass.
  it('names what must happen before OTA is re-armed', () => {
    const runbook = readFileSync('docs/ota-updates.md', 'utf8')
    expect(runbook).toMatch(/DISARMED for 1\.0\.2/)
    expect(runbook).toMatch(/sign-off against\s+I3/)
    expect(runbook).toMatch(/privacy-policy disclosure/)
  })

  // JS downloads via Filesystem({ directory: 'LIBRARY' }) into the relative path
  // native returns; native then reads <LIBRARY>/<root>/<version>. Both halves
  // must name the same folder, and the plugin must keep mapping LIBRARY there.
  it('staging root is where Filesystem LIBRARY writes, on both platforms', () => {
    const plugin = 'node_modules/@capacitor/filesystem'
    const androidRoot = readFileSync('android/app/src/main/java/com/veyrnox/app/OtaUpdatePlugin.kt', 'utf8')
      .match(/const val OTA_ROOT = "([^"]+)"/)?.[1]
    expect(androidRoot).toBe('VeyrnoxOTA')
    expect(swift).toMatch(/static let rootName = "VeyrnoxOTA"/)
    expect(readFileSync(`${plugin}/android/src/main/kotlin/com/capacitorjs/plugins/filesystem/LegacyFilesystemImplementation.kt`, 'utf8'))
      .toMatch(/"DATA", "LIBRARY" -> return c\.filesDir/)
    expect(readFileSync(`${plugin}/ios/Sources/FilesystemPlugin/LegacyFilesystemImplementation.swift`, 'utf8'))
      .toMatch(/case "LIBRARY":\s*return \.libraryDirectory/)
    expect(swift).toMatch(/urls\(for: \.libraryDirectory/)
    expect(androidRoot && readFileSync('android/app/src/main/java/com/veyrnox/app/OtaUpdatePlugin.kt', 'utf8')).toMatch(/File\(ctx\.filesDir, OTA_ROOT\)/)
  })

  it("Capacitor's unverified persisted server path is switched off", () => {
    const cfg = JSON.parse(readFileSync('capacitor.config.json', 'utf8'))
    expect(cfg.cordova?.preferences?.DisableDeploy).toBe('true')
  })
})
