// @ts-nocheck
// lib/biometricUnlock.js — the biometric-gated VAULT-PASSWORD cache that powers
// one-tap "Face ID → dashboard" for returning users.
//
// ┌─────────────────────────────────────────────────────────────────────────┐
// │ WHAT THIS IS (and is NOT)                                                 │
// │ This is a CONVENIENCE cache layered OVER the existing vault — never a     │
// │ replacement for it, and never a new standalone secret:                    │
// │   - The vault password remains THE secret. It is what `keyStore.unlock()` │
// │     uses to decrypt the audited Argon2id+AES-GCM vault (untouched here).  │
// │   - This module stores a copy of that password behind the platform's      │
// │     biometric gate so a returning user can unlock with Face ID instead of │
// │     re-typing it. The password itself is ALWAYS the fallback — Face ID    │
// │     failing/being unavailable just routes the user to the password field. │
// │     No biometric, no funds: the cache is useless without also satisfying  │
// │     the vault decrypt.                                                     │
// │   - It introduces NO numeric PIN or other weak standalone unlock.         │
// │                                                                            │
// │ HOW THE BIOMETRIC GATE IS ENFORCED (read this — it is precise on purpose) │
// │   The underlying secure-storage plugin (@aparajita/capacitor-secure-      │
// │   storage) can pin an item's *accessibility* (whenPasscodeSetThisDevice-  │
// │   Only — Keychain/Keystore platform secure store, device-only, passcode-  │
// │   required) but it does NOT                                               │
// │   expose the iOS access-control / SecAccessControl biometry flags         │
// │   (kSecAccessControlBiometryCurrentSet / .userPresence) nor the Android   │
// │   Keystore setUserAuthenticationRequired equivalent. So the Keychain      │
// │   alone would release the cached password to any in-app caller on a       │
// │   merely-unlocked device — accessibility is NOT a biometric gate.         │
// │                                                                            │
// │   We therefore enforce the biometric requirement at a single STRUCTURAL   │
// │   CHOKEPOINT: `retrieveUnlockSecret()` is the ONLY path that releases the │
// │   plaintext, and on native it performs a REAL OS biometric authenticate   │
// │   (@aparajita/capacitor-biometric-auth, same policy as the audited        │
// │   keystore/native.js → authenticateOrThrow) as a hard precondition BEFORE │
// │   it reads the item. A cancelled/failed match throws; the secret is never │
// │   read. The raw store read is a private function with no other caller.    │
// │   `hasStoredUnlockSecret()` is a metadata-only presence check that does   │
// │   NOT prompt (so the entry screen can show the one-tap button without     │
// │   firing Face ID).                                                         │
// │                                                                            │
// │   LIMITATION (honest): this is an OS-enforced biometric match gating the  │
// │   release in code, NOT a Keychain-bound item. It does not get             │
// │   biometryCurrentSet's auto-invalidation (wipe the item if biometrics are │
// │   added/changed) — that needs a native shim and is a documented follow-up.│
// │   Because the cache and the vault blob are separate Keychain items, each   │
// │   biometric-gated independently, the native one-tap flow presents the OS  │
// │   biometric sheet TWICE (once here for the cache, once inside the          │
// │   untouchable keyStore.unlock() for the vault). That second sheet is the   │
// │   accepted, disclosed cost of OS-enforcing the cache without touching      │
// │   wallet-core crypto.                                                      │
// │                                                                            │
// │ It does NOT touch vault.js / vaultStore.js / signing / derivation /       │
// │ keystore. It is a separate, additive app-layer module.                    │
// │                                                                            │
// │ DEMO honesty: in demo the cache lives in localStorage and the prompt is a │
// │ clearly-labelled SIMULATION (see BiometricPrompt.jsx) — NOT real OS       │
// │ security, and NOT an OS authenticate(). On a real native device the cache │
// │ lives in the platform secure store (iOS Keychain / Android Keystore),     │
// │ ThisDeviceOnly, passcode-gated                                            │
// │ (same store class as keystore/native.js), and the real OS biometric sheet │
// │ gates the release as described above.                                     │
// └─────────────────────────────────────────────────────────────────────────┘

import { Capacitor } from '@capacitor/core';
import { DEMO } from '@/api/demoClient';

// DEMO cache lives in an in-memory module variable — session-scoped, cleared on
// page unload, never written to localStorage or any persistent store. This is a
// UI simulation; the real native path uses the platform secure store (iOS Keychain / Android Keystore).
// (VULN-2 fix: the previous localStorage path left the plaintext vault password
// readable by same-origin scripts and browser extensions for the session lifetime.)
const NATIVE_KEY = 'bio_unlock_secret';
// Mirror keystore/native.js's prefix/accessibility so the cached item gets the
// same ThisDeviceOnly, passcode-gated, never-synced protection as the vault blob.
const NATIVE_PREFIX = 'veyrnox_';

let _demoCache = null; // in-memory only; cleared when the module unloads

function isAndroidNativePlatform() {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform?.() === 'android';
  } catch {
    return false;
  }
}

function demoStore(pw) { _demoCache = pw; }
function demoGet() { return _demoCache; }
function demoClear() { _demoCache = null; }

// Native secure-storage helpers. Loaded lazily so the Capacitor plugin never
// reaches the web/test bundle (exactly like keystore/index.js does for native).
async function nativeStore(pw) {
  // H-NEW-5 STATUS (2026-08-20): ANDROID HALF is now shipped via the custom
  // AndroidBiometricCache plugin, which stores the cached secret encrypted at rest
  // and binds a separate Android Keystore invalidation sentinel to
  // setInvalidatedByBiometricEnrollment(true). If a biometric is added/changed, the
  // sentinel key invalidates and the cache is wiped on the next presence/read check.
  //
  // iOS half remains TARGET: kSecAccessControlBiometryCurrentSet still needs a
  // native Swift/ObjC shim. We do NOT pretend parity that does not exist (I4).
  //
  // M-10 (weekly audit 2026-08-25) — NOT a mechanical port, and here is why, so the
  // next reader does not re-derive it. On iOS there is no "invalidate on enrollment
  // change but do not require biometry" access-control flag: kSecAccessControl-
  // BiometryCurrentSet gives the auto-invalidation ONLY by making the item's DATA
  // biometry-gated. Android got both halves because it binds a SEPARATE Keystore
  // sentinel (AndroidBiometricCachePlugin invalidationAlias) and keeps the cache
  // blob readable without a prompt; the iOS Keychain has no equivalent split.
  //
  // So binding this item to biometryCurrentSet would re-introduce an OS prompt on
  // retrieveUnlockSecretDirect() — the KEK fast path (WalletProvider.jsx:2168),
  // whose entire purpose is that the SE gate inside getHardwareFactor() is already
  // the hardware-enforced biometric evaluation (see kek-single-prompt.test.js and
  // biometricUnlock.kekSinglePrompt.test.js, which pin the single-prompt property).
  // That is a product tradeoff — real enrollment-invalidation in exchange for a
  // second Face ID sheet per unlock on every KEK vault — not a bug fix, and it is
  // the owner's call, not an audit-remediation call. Deliberately NOT taken blind
  // from a machine with no iPhone and no iOS build. biometricUnlockSecurityMode()
  // stays 'app-gate' and this disclosure stays TARGET until it is really shipped.
  if (isAndroidNativePlatform()) {
    try {
      const cache = await import('@/plugins/androidBiometricCache.js');
      const available = await cache.isAvailable();
      if (available?.available === true) {
        await cache.putSecret(pw);
        // Issue #2039 C1 — dual-write to the unauth alias ONLY when the vault is
        // KEK-wrapped. On a KEK vault the cached PIN is the C-factor of DEK =
        // HKDF(H ‖ C) and H is producible only inside a StrongBox-gated Secure
        // Enclave op; the cached C alone is useless, so an unauth-alias entry
        // (whose read path skips the biometric prompt) is safe. On a NON-KEK
        // vault the cached PIN IS the vault password and the unauth alias
        // would strip the SOLE biometric gate — do NOT write it there.
        // hasVaultKekWrap() is consulted at write time; a caller-attested
        // "isEnrolled" flag would not be trustworthy here.
        // Fail-closed: any probe failure is treated as NOT wrapped.
        let kekWrapped = false;
        try {
          const { getKeyStore } = await import('@/wallet-core/keystore');
          const ks = getKeyStore();
          kekWrapped = typeof ks.hasVaultKekWrap === 'function'
            ? (await ks.hasVaultKekWrap()) === true
            : false;
        } catch { kekWrapped = false; }
        if (kekWrapped) {
          try {
            if (typeof cache.putSecretUnauth === 'function') {
              await cache.putSecretUnauth(pw);
            }
          } catch { /* unauth cache unavailable; migration path handles this on read */ }
        }
        return;
      }
    } catch {
      // Fall back to the generic secure-storage path on older/unsupported Android
      // builds so the cache remains usable instead of failing hard.
    }
  }
  const { SecureStorage, KeychainAccess } = await import('@aparajita/capacitor-secure-storage');
  await SecureStorage.setKeyPrefix(NATIVE_PREFIX);
  await SecureStorage.setSynchronize(false);
  await SecureStorage.setDefaultKeychainAccess(KeychainAccess.whenUnlockedThisDeviceOnly);
  await SecureStorage.set(NATIVE_KEY, pw);
}

// PRIVATE raw read — releases the PLAINTEXT cached password. Never exported and
// never called except from retrieveUnlockSecret() AFTER a successful biometric
// match. This single-caller structure is what makes the biometric gate
// non-bypassable in app code; a test pins it (biometricUnlock-native.test.js).
async function nativeReadSecret() {
  if (isAndroidNativePlatform()) {
    try {
      const cache = await import('@/plugins/androidBiometricCache.js');
      const available = await cache.isAvailable();
      if (available?.available === true) {
        return await cache.getSecret();
      }
    } catch {
      // Fall through to the generic secure-storage path for compatibility.
    }
  }
  const { SecureStorage } = await import('@aparajita/capacitor-secure-storage');
  await SecureStorage.setKeyPrefix(NATIVE_PREFIX);
  const v = await SecureStorage.get(NATIVE_KEY, false);
  const s = v == null ? null : String(v);
  // Guard against empty-string returns from Android SecureStorage (missing/corrupt
  // entry returns "" rather than null on some plugin versions — empty is no-secret).
  return (s != null && s.length > 0) ? s : null;
}

// PRIVATE unauth-alias read — releases the cached PLAINTEXT password WITHOUT
// firing an OS biometric prompt. Only safe to call from the KEK-enrolled unlock
// path (retrieveUnlockSecretDirect({ kekEnrolled: true })); see the security
// contract on that export. Fail-closed migration behaviour: if the unauth alias
// returns null (fresh install, first unlock after upgrade, alias not yet
// present) we fall through to nativeReadSecret() so wrong-PIN / no-secret
// semantics stay identical for the caller. On a successful fallback we
// re-persist to the unauth alias so the next unlock skips the prompt.
async function nativeReadSecretUnauth() {
  if (isAndroidNativePlatform()) {
    let cache;
    try {
      cache = await import('@/plugins/androidBiometricCache.js');
    } catch {
      // Plugin bundle import itself failed — degrade to the legacy path.
      return nativeReadSecret();
    }
    let available;
    try {
      available = await cache.isAvailable();
    } catch {
      return nativeReadSecret();
    }
    if (available?.available === true && typeof cache.getSecretUnauth === 'function') {
      // Issue #2039 H2 — distinguish "not present" (null return) from
      // Keystore fault (throw). Null is a legit fresh install / pre-#2037
      // migration state; throws are corrupt entry, alias clash, or
      // KeyPermanentlyInvalidatedException and MUST NOT be swallowed —
      // otherwise a wedged alias re-persists silently on every unlock.
      let s;
      try {
        s = await cache.getSecretUnauth();
      } catch (err) {
        // Wipe BOTH aliases (Kotlin plugin's clearAllState() sweeps
        // storageAlias, invalidationAlias, and storageUnauthAlias plus
        // both pref pairs) and surface the fault.
        try { await cache.clearSecret(); } catch { /* best-effort sweep */ }
        const surfaced = new Error(
          'AndroidBiometricCache unauth-alias read failed; cache wiped. '
          + 'Underlying: ' + (err && err.message ? err.message : String(err)),
        );
        surfaced.code = 'BIOMETRIC_CACHE_UNAUTH_FAULT';
        throw surfaced;
      }
      if (s != null && String(s).length > 0) return String(s);
      // Migration fallback: legacy vaults were written before the unauth
      // alias existed. Read via the auth-gated path (which on the current
      // Kotlin plugin does not itself fire a JS-layer prompt — the JS gate
      // lives in retrieveUnlockSecret, not here) and dual-write for next
      // time.
      const legacy = await nativeReadSecret();
      if (legacy != null && legacy.length > 0) {
        try {
          if (typeof cache.putSecretUnauth === 'function') {
            await cache.putSecretUnauth(legacy);
          }
        } catch { /* migration best-effort; next unlock will retry */ }
      }
      return legacy;
    }
  }
  return nativeReadSecret();
}

// PRIVATE presence check — metadata only (lists keys, never reads the value), so
// it neither releases the secret nor triggers a biometric prompt. Mirrors
// keystore/native.js's "hasVault is a presence check that does NOT prompt".
async function nativeHasSecret() {
  if (isAndroidNativePlatform()) {
    try {
      const cache = await import('@/plugins/androidBiometricCache.js');
      const available = await cache.isAvailable();
      if (available?.available === true) {
        return await cache.hasSecret();
      }
    } catch {
      // Fall through to the generic secure-storage path for compatibility.
    }
  }
  try {
    const { SecureStorage } = await import('@aparajita/capacitor-secure-storage');
    await SecureStorage.setKeyPrefix(NATIVE_PREFIX);
    const result = /** @type {any} */ (await SecureStorage.keys());
    // keys() returns either an array or { keys: string[] } depending on platform
    const keys = Array.isArray(result) ? result : (Array.isArray(result?.keys) ? result.keys : []);
    // keys() may return prefixed or unprefixed keys depending on the platform
    // implementation — check both to be safe.
    return keys.includes(NATIVE_KEY) || keys.includes(NATIVE_PREFIX + NATIVE_KEY);
  } catch {
    return false;
  }
}

// Hard OS biometric precondition for releasing the cached password. Same policy
// as the audited keystore/native.js → authenticateOrThrow: require a real
// biometric match (no silent passcode fallback), with a deliberate ONE-TIME
// device-credential fallback only on biometryLockout, and a passcode fallback
// when biometrics are not enrolled but the device IS secured. THROWS on
// cancel/failure/lockout so the secret is never read on a failed match.
async function nativeAuthenticateOrThrow() {
  const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth');
  const { getCachedBiometry } = await import('./biometricProbe.js');
  const info = (await getCachedBiometry()) ?? { isAvailable: false, deviceIsSecure: false };

  // No device security at all → a passcode-gated item cannot have been stored,
  // and there is nothing to authenticate against.
  if (!info.isAvailable && !info.deviceIsSecure) {
    throw new Error(
      'This device has no passcode or biometrics set; cannot release the cached unlock secret',
    );
  }

  const reason = 'Unlock your VEYRNOX wallet';
  if (info.isAvailable) {
    try {
      await BiometricAuth.authenticate({
        reason,
        cancelTitle: 'Cancel',
        androidTitle: 'VEYRNOX',
        androidSubtitle: 'Unlock your wallet',
        allowDeviceCredential: false,
      });
      return;
    } catch (err) {
      // Lockout (too many failed biometric attempts) → fall back ONCE to the
      // device credential, exactly like the keystore unlock policy.
      if (err && err.code === 'biometryLockout') {
        await BiometricAuth.authenticate({ reason, allowDeviceCredential: true });
        return;
      }
      throw err;
    }
  }

  // Biometrics not enrolled but device IS secured → deliberate passcode fallback.
  await BiometricAuth.authenticate({ reason, allowDeviceCredential: true });
}

async function nativeClear() {
  if (isAndroidNativePlatform()) {
    try {
      const cache = await import('@/plugins/androidBiometricCache.js');
      const available = await cache.isAvailable();
      if (available?.available === true) {
        await cache.clearSecret();
        return;
      }
    } catch {
      // Fall through to the generic secure-storage path for compatibility.
    }
  }
  try {
    const { SecureStorage } = await import('@aparajita/capacitor-secure-storage');
    await SecureStorage.setKeyPrefix(NATIVE_PREFIX);
    await SecureStorage.remove(NATIVE_KEY);
  } catch { /* may already be gone */ }
}

/**
 * Can this platform offer biometric one-tap unlock at all? DEMO (simulated) and
 * any native platform can; plain web has no platform biometric, so the password
 * is the only path there (unchanged).
 * @returns {boolean}
 */
export function biometricUnlockSupported() {
  return DEMO || Capacitor.isNativePlatform();
}

/**
 * Cache the vault password behind the biometric gate. Only callers that legitimately
 * hold the plaintext password (first-run create/import, or a password change) use
 * this. Storing does NOT release a secret, so it does not itself prompt for
 * biometrics. No-op on plain web (returns false).
 *
 * H-NEW-5 honest limit: Android now uses a custom native cache plugin with a real
 * biometric-enrollment invalidation sentinel, but iOS still does NOT bind the cache
 * to biometryCurrentSet. Full cross-platform parity remains TARGET.
 * @returns {Promise<boolean>} true if stored.
 */
export async function storeUnlockSecret(password) {
  if (DEMO) { demoStore(password); return true; }
  if (Capacitor.isNativePlatform()) { await nativeStore(password); return true; }
  return false;
}

/**
 * Retrieve the cached vault password — THE single chokepoint that releases the
 * plaintext. On native this performs a REAL OS biometric authenticate as a hard
 * precondition (throws on cancel/failure; the item is never read on a failed
 * match), so the secret is unreleasable without a fresh biometric match enforced
 * by the OS — not just app-layer convention. In demo the caller shows the
 * clearly-labelled SIMULATED prompt (unchanged); this returns the in-memory
 * demo cache directly. Plain web caches nothing → null.
 *
 * @remarks
 * **DEMO-MODE CALLER CONTRACT:** In demo mode (`DEMO === true`) this function
 * returns the cached demo password immediately with NO authentication gate.
 * There is no OS prompt and no internal simulation — the gate is entirely the
 * caller's responsibility. CALLERS MUST show a simulated biometric prompt
 * (e.g. via `biometricPreview()` / BiometricPrompt.jsx) BEFORE calling this
 * function in demo mode. A future caller that skips the prompt will silently
 * bypass the simulated authentication gate and release the cached password with
 * no user interaction. Add a `if (DEMO)` guard in the caller, confirm the
 * prompt was shown, then call this function.
 *
 * @returns {Promise<string|null>}
 * @throws on native biometric cancel/failure/lockout (a BiometryError).
 */
export async function retrieveUnlockSecret() {
  if (DEMO) return demoGet();
  if (Capacitor.isNativePlatform()) {
    await nativeAuthenticateOrThrow(); // hard OS biometric precondition
    return nativeReadSecret();
  }
  return null;
}

/**
 * Retrieve the cached vault password WITHOUT the app-layer OS biometric cache-gate.
 *
 * ⚠️ SECURITY CONTRACT — READ THIS. Unlike retrieveUnlockSecret(), this does NOT call
 * nativeAuthenticateOrThrow() first. It is ONLY safe to call from the KEK-enrolled
 * native unlock path, where the Secure Enclave / StrongBox hardware gate (fired inside
 * keyStore.unlock() → getHardwareFactor, one biometric evaluation per ACL-gated SE
 * operation) is the sole, hardware-enforced biometric protection. On a KEK vault the
 * cached PIN is the C-factor ONLY; the DEK = HKDF(H ‖ C) and H is producible ONLY by
 * passing that SE gate — so the cached C alone is useless and the app-layer cache-gate
 * is redundant (it only added a THIRD biometric prompt per unlock).
 *
 * Calling this on a NON-KEK vault (web password vault, bare native vault) would BYPASS
 * the SOLE biometric gate protecting the cached password — a security downgrade. The
 * caller (WalletProvider.unlockWithBiometric) MUST gate this behind a confirmed
 * hasVaultKekWrap() === true check. On web there is no cached secret → null.
 *
 * Codex P1 2026-08-15 — the security contract is now enforced at RUNTIME as well as
 * in the doc block. Callers must explicitly pass `{ kekEnrolled: true }` after
 * evaluating `keyStore.hasVaultKekWrap()`. A missing or false assertion throws — so a
 * future non-KEK caller cannot silently bypass the biometric gate.
 *
 * @param {{ kekEnrolled?: boolean }} [assert]
 * @returns {Promise<string|null>}
 */
export async function retrieveUnlockSecretDirect(assert) {
  if (!assert || assert.kekEnrolled !== true) {
    throw new Error(
      'retrieveUnlockSecretDirect requires an explicit `{ kekEnrolled: true }` assertion '
      + 'from a caller that has already checked keyStore.hasVaultKekWrap(). Without KEK the '
      + 'app-layer biometric gate is the SOLE protection; calling this directly bypasses it. '
      + 'See the security contract in the doc block above.',
    );
  }
  if (DEMO) return demoGet();
  if (Capacitor.isNativePlatform()) {
    // Issue #2039 C2 — verify hasVaultKekWrap() in-function, do NOT trust the
    // caller's kekEnrolled hint alone. A buggy or hostile caller that passes
    // { kekEnrolled: true } on a NON-KEK vault would otherwise bypass the SOLE
    // biometric gate (auth-gated cache read) with no OS prompt. The caller's
    // flag is now a hint; the keystore is the source of truth. If a legit
    // caller reasonably passes it and it does not hold, that is a bug the
    // caller needs to hear about — throw, do not silently degrade.
    let kekWrapped = false;
    try {
      const { getKeyStore } = await import('@/wallet-core/keystore');
      const ks = getKeyStore();
      kekWrapped = typeof ks.hasVaultKekWrap === 'function'
        ? (await ks.hasVaultKekWrap()) === true
        : false;
    } catch { kekWrapped = false; }
    if (!kekWrapped) {
      throw new Error(
        'retrieveUnlockSecretDirect: hasVaultKekWrap() did not confirm a KEK-wrapped vault. '
        + 'The kekEnrolled assertion is a hint, not the gate — this function itself checks '
        + 'the keystore because the unauth cache read has no OS prompt. Refusing to release '
        + 'the cached secret.',
      );
    }
    return nativeReadSecretUnauth();
  }
  return null;
}

/** Remove the cached password from every store (called on disable/panic/reset). */
export async function clearUnlockSecret() {
  demoClear();
  if (Capacitor.isNativePlatform()) await nativeClear();
}

/**
 * Whether a cached password is currently present. METADATA ONLY — this never
 * reads the secret and never prompts for biometrics, so the entry screen can
 * decide whether to offer the one-tap button without firing Face ID.
 * @returns {Promise<boolean>}
 */
export async function hasStoredUnlockSecret() {
  if (DEMO) return demoGet() != null;
  if (Capacitor.isNativePlatform()) return nativeHasSecret();
  return false;
}

/**
 * Codex P1 2026-08-15 — surface the CURRENT protection level to downstream UI /
 * audit tools so honest disclosure is possible without re-reading the header
 * comment above.
 *
 *   'app-gate'  — biometric requirement enforced at the JS chokepoint (the
 *                 current retrieveUnlockSecret() / retrieveUnlockSecretDirect()
 *                 gate). Keychain/Keystore accessibility is
 *                 `whenPasscodeSetThisDeviceOnly`, NOT a biometry-ACL bound
 *                 key. Biometric-enrollment change does NOT auto-invalidate.
 *                 This is what ships today.
 *   'key-bound' — Keychain item pinned to `kSecAccessControlBiometryCurrentSet`
 *                 (iOS) / `setUserAuthenticationRequired`+
 *                 `setInvalidatedByBiometricEnrollment` (Android). Biometric-
 *                 enrollment change wipes the item at the OS. Android now has
 *                 a PARTIAL native cache plugin that ships the invalidation half,
 *                 but the release gate is still the JS chokepoint and iOS still
 *                 lacks the biometryCurrentSet shim.
 *   'demo'      — non-native fallback: in-memory only, no cryptographic gate.
 *   'unavailable' — web (no cache, no gate).
 *
 * @returns {'app-gate' | 'key-bound' | 'demo' | 'unavailable'}
 */
export function biometricUnlockSecurityMode() {
  if (DEMO) return 'demo';
  if (!Capacitor.isNativePlatform()) return 'unavailable';
  // Android now ships enrollment invalidation via a native plugin, but the release
  // gate is still app-layer and iOS still lacks a biometryCurrentSet item ACL.
  return 'app-gate';
}
