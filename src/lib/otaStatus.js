// Turns the native OTA plugin's local status() into what Settings shows.
//
// Local only: no network, no trust decision. It exists so the owner can see which web
// bundle a device is running, since an OTA update is otherwise invisible.
//
// Fail honest (I4): anything that is not a real, positive integer version shows nothing
// rather than a guessed or partial value. The version is digits only by construction.
//
// STATUS: BUILT, INTERNAL — not device-verified.

const isVersion = (n) => Number.isSafeInteger(n) && n > 0

/**
 * @param {unknown} status result of VeyrnoxOta.status()
 * @returns {{ version: string, staged: boolean } | null}
 */
export function describeOtaStatus(status) {
  if (!status || typeof status !== 'object') return null
  /** @type {{ enabled?: unknown, runningVersion?: number, newestKnownVersion?: number }} */
  const { enabled, runningVersion, newestKnownVersion } = status
  if (enabled !== true || runningVersion === undefined || !isVersion(runningVersion)) return null
  // A newer bundle is known: it is staged and boots on the next cold start.
  const staged = newestKnownVersion !== undefined && isVersion(newestKnownVersion) && newestKnownVersion > runningVersion
  return { version: String(runningVersion), staged }
}
