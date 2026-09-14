// OTA web-bundle updates — JS half. See docs/ota-updates.md.
//
// This file makes NO trust decisions. It only moves bytes into a staging
// directory the native VeyrnoxOta plugin created; native verifies the offline
// signature, every file hash, and version ordering, and only a fully verified
// bundle is booted — on the next cold start, never mid-session.
//
// Runs once per cold start, before unlock, identically in real, decoy and demo
// sessions: the request pattern must not reveal which session is open (I3).
//
// STATUS: BUILT, INTERNAL — not device-verified, no key provisioned.
import { Capacitor, registerPlugin } from '@capacitor/core'

export const OTA_BASE_URL = 'https://updates.veyrnox.com'
const MANIFEST_NAME = 'ota-manifest.json'
const SIGNATURE_NAME = 'ota-manifest.sig'
const CONCURRENCY = 6

let started = false

export async function runOtaUpdate({
  ota = registerPlugin('VeyrnoxOta'),
  filesystem,
  fetchImpl = fetch,
  baseUrl = OTA_BASE_URL,
} = {}) {
  await ota.notifyReady()
  const status = await ota.status()
  if (!status.enabled) return 'disabled'

  const channelUrl = `${baseUrl}/${status.channel}`
  const res = await fetchImpl(`${channelUrl}/latest.json`, { cache: 'no-store' })
  if (!res.ok) return 'unavailable'
  const version = Number((await res.json())?.bundleVersion)
  if (!Number.isSafeInteger(version) || version <= status.newestKnownVersion) return 'current'

  const fs = filesystem ?? (await import('@capacitor/filesystem')).Filesystem
  const releaseUrl = `${channelUrl}/${version}`
  // Native returns the staging dir relative to LIBRARY, which the Filesystem
  // plugin maps to the same place native reads from (Android filesDir, iOS
  // Library). An absolute file:// path would be joined onto a default directory.
  const { path: dir } = await ota.begin({ version })
  const download = (remote, local) =>
    fs.downloadFile({ url: `${releaseUrl}/${remote}`, path: `${dir}/${local}`, directory: 'LIBRARY', recursive: true })

  await download(MANIFEST_NAME, MANIFEST_NAME)
  await download(SIGNATURE_NAME, SIGNATURE_NAME)
  const { missing } = await ota.prepare({ version })

  const queue = [...missing]
  const worker = async () => {
    while (queue.length) {
      const path = queue.shift()
      await download(`files/${path}`, path)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  await ota.stage({ version })
  return 'staged'
}

// Fire-and-forget from main.jsx. Every failure leaves the current bundle in
// place; native discards a half-downloaded directory on the next attempt.
export function startOtaUpdate() {
  if (started || !Capacitor.isNativePlatform()) return
  started = true
  runOtaUpdate().catch((e) => {
    if (import.meta.env.DEV) console.error('[ota]', e)
  })
}
