/**
 * Memoised biometric-hardware probe.
 *
 * `BiometricAuth.checkBiometry()` is an IPC to Android `system_server`
 * (`BiometricService/PreAuthInfo`). On a cold unlock every gate — WalletProvider,
 * biometric.js status render, biometricUnlock precheck, native keystore
 * capability probe, passkey status, PasskeySetup mount — fires the same probe
 * independently. On a Pixel 10 Pro cold start six probes fire back-to-back
 * (visible in logcat as repeated `getCanAuthenticateInternal Modality:10` lines),
 * and each is a synchronous round-trip to another process.
 *
 * The probe's answer — `{ isAvailable, deviceIsSecure }` — reflects OS-level
 * enrollment state, which does not change without an event we can hook. So we
 * cache the promise for the process lifetime and hand every caller the same
 * result. This is a probe cache ONLY: `BiometricAuth.authenticate()` is NEVER
 * cached — every auth attempt still runs the OS prompt.
 *
 * Invalidation (honest):
 *   - `invalidateBiometryProbe()` forces the next call to re-probe.
 *   - Call after a `KeyPermanentlyInvalidatedException` (biometrics re-enrolled),
 *     or after a panic-wipe / hardware-credential clear, so the next status
 *     read reflects reality rather than a stale "available" answer.
 *   - Not wired to `checkBiometry`-time failure: a rejected probe short-circuits
 *     to null (fail-closed, matching every existing caller's try/catch policy)
 *     and is retried next call, not cached.
 *
 * Suppressed under I3? No — this module makes no backend calls; it only
 * memoises an OS query. Deniability sessions still need biometric status to
 * render their own honest UI ("Biometrics unavailable" etc.).
 */

let cachedPromise = null;

/**
 * Return the cached BiometricAuth.checkBiometry() result, probing at most
 * once per process. Callers who need the raw plugin (e.g. to call
 * `authenticate()`) still import it directly; this API is only for the probe.
 *
 * On a probe failure the promise resolves to `null` and the cache is cleared,
 * so the next caller re-probes rather than seeing the stale rejection.
 *
 * @returns {Promise<{ isAvailable: boolean, deviceIsSecure: boolean } | null>}
 */
export function getCachedBiometry() {
  if (cachedPromise) return cachedPromise;
  cachedPromise = (async () => {
    try {
      const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth');
      return await BiometricAuth.checkBiometry();
    } catch {
      // Fail closed: next caller re-probes rather than reading a poisoned cache.
      cachedPromise = null;
      return null;
    }
  })();
  return cachedPromise;
}

/**
 * Drop the cached probe. The next `getCachedBiometry()` call re-probes.
 * Safe to call from anywhere; safe to call when nothing is cached.
 */
export function invalidateBiometryProbe() {
  cachedPromise = null;
}
