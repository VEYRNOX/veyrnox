// src/wallet-core/keystore/__tests__/kek-single-prompt.test.js
//
// SINGLE-BIOMETRIC-PROMPT invariant for KEK write paths (2026-07-16).
//
// BUG: on iOS + Android, enrollKek / changePassword (KEK branch) / upgradeKekToV3 each
// fired TWO OS biometric sheets per operation:
//   Prompt A — authenticateOrThrow() at the top of the method (an APP-LAYER intent gate)
//   Prompt B — the very next getHardwareFactor() call, which materialises the SE/StrongBox
//              key. The SE ACL is .biometryCurrentSet (iOS) / setUserAuthenticationRequired
//              (Android), so the OS demands a fresh biometric on this call. This is the
//              guarantee that makes the key "hardware-protected" and CANNOT be skipped.
// changePassword's KEK branch calls getHardwareFactor TWICE (unwrap under the OLD salt +
// re-wrap under the NEW salt), so today it fires THREE prompts. Target: TWO.
//
// FIX (mirrors the already-solved single-prompt fix on the unlock path — see
// native.unlock-single-biometric.test.js and native.js:311-312): remove the standalone
// authenticateOrThrow() at the top and let getHardwareFactor be the sole biometric gate on
// the happy path. authenticateOrThrow() is preserved as a FALLBACK that engages ONLY when
// getHardwareFactor fails with a lockout-shaped error (NO_HARDWARE_FACTOR — the code the JS
// bridge classifies BiometricPrompt.ERROR_LOCKOUT/ERROR_LOCKOUT_PERMANENT into; see
// hardware.js:236 "no-enrollment, lockout, HW unavailable, unknown → generic
// no-hardware-factor"). The fallback preserves the H16-DEVIATION device-credential path
// (see native.js:260-265) so a user in biometric lockout can still reach the vault via PIN.
//
// This test file pins:
//   (i)   happy-path prompt counts (0 app-layer authenticate calls, N getHF calls);
//   (ii)  the lockout fallback engages ONLY on the specific error class, then retries once;
//   (iii) enrollKek runs decryptVault BEFORE getHF so a wrong PIN fires ZERO prompts (no
//         Face ID / fingerprint flash for a mistyped password).
//
// Mocking pattern mirrors native.unlock-single-biometric.test.js.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Match the real KEK_ERR code so caller-level branching matches production. The keystore
// mock below re-exports this same value.
const NO_HARDWARE_FACTOR = 'KEK_NO_HARDWARE_FACTOR';

const VAULT_KEY = 'vault_v1';
const store = new Map();
const setVault = (v) => { if (v === null || v === undefined) store.delete(VAULT_KEY); else store.set(VAULT_KEY, v); };
const secureStoreMock = {
  setKeyPrefix: vi.fn(async () => {}),
  setSynchronize: vi.fn(async () => {}),
  setDefaultKeychainAccess: vi.fn(async () => {}),
  get: vi.fn(async (key) => (store.has(key) ? store.get(key) : null)),
  set: vi.fn(async (key, data) => { store.set(key, data); }),
  remove: vi.fn(async (key) => { const e = store.has(key); store.delete(key); return e; }),
};
vi.mock('@aparajita/capacitor-secure-storage', () => ({
  SecureStorage: secureStoreMock,
  KeychainAccess: { whenPasscodeSetThisDeviceOnly: 'whenPasscodeSetThisDeviceOnly' },
}));

// authenticateMock counts APP-LAYER intent-gate prompts. On happy paths this must stay 0
// (the SE/StrongBox getHF prompt is the sole biometric gate).
const authenticateMock = vi.fn(async () => {});
const checkBiometryMock = vi.fn(async () => ({ isAvailable: true, deviceIsSecure: true }));
vi.mock('@aparajita/capacitor-biometric-auth', () => ({
  BiometricAuth: {
    checkBiometry: checkBiometryMock,
    authenticate: authenticateMock,
  },
}));
vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn() } }));

const vaultMock = {
  encryptVault: vi.fn(async () => ({ v: 1, kdf: 'argon2id', salt: 's', iv: 'bareiv', ct: 'barect' })),
  decryptVault: vi.fn(async () => 'seed'),
  deriveKekC: vi.fn(async () => new Uint8Array(32).fill(7)),
  encryptVaultWithDek: vi.fn(async () => ({ iv: 'newiv', ct: 'newct' })),
  decryptVaultWithDek: vi.fn(async () => 'seed'),
};
vi.mock('../../vault.js', () => vaultMock);

const kekMock = {
  combineKek: vi.fn(async () => new Uint8Array(32).fill(9)),
  randomDek: vi.fn(() => new Uint8Array(32).fill(3)),
  wrapDek: vi.fn(async () => ({ v: 1, iv: 'reiv', ct: 'rect' })),
  unwrapDek: vi.fn(async () => new Uint8Array(32).fill(4)),
  decodeKekSalt: vi.fn((s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))),
  parseVaultBlob: vi.fn((raw) => (typeof raw === 'string' ? JSON.parse(raw) : raw)),
  KEK_ERR: {
    NO_HARDWARE_FACTOR,
    UNWRAP_FAILED: 'KEK_UNWRAP_FAILED',
    MALFORMED_VAULT: 'KEK_MALFORMED_VAULT',
    NOT_ENROLLED: 'KEK_NOT_ENROLLED',
    USER_CANCELLED: 'KEK_USER_CANCELLED',
    KEY_PERMANENTLY_INVALIDATED: 'KEK_KEY_PERMANENTLY_INVALIDATED',
  },
};
vi.mock('../kek.js', () => kekMock);

const clearHardwareCredentialMock = vi.fn(async () => {});
vi.mock('../hardware.js', () => ({
  getHardwareFactor: vi.fn(async () => new Uint8Array(32).fill(1)),
  clearHardwareCredential: clearHardwareCredentialMock,
}));

const { nativeKeyStore } = await import('../native.js');

const kekSalt = btoa('s'.repeat(32));
const newHF = () => new Uint8Array(32).fill(1);
const bareVault = () => JSON.stringify({ v: 1, kdf: 'argon2id', salt: 's', iv: 'x', ct: 'y' });
const v3blob = () => JSON.stringify({
  v: 1, kdf: 'kek-dek', iv: 'oldiv', ct: 'oldct',
  kekWrap: { v: 1, iv: 'wrapiv', ct: 'wrapct' }, kekSalt, hardwareKekVersion: 3,
});
const lockoutErr = () => Object.assign(new Error(NO_HARDWARE_FACTOR), { code: NO_HARDWARE_FACTOR });

beforeEach(() => {
  vi.clearAllMocks();
  store.clear();
  secureStoreMock.get.mockImplementation(async (key) => (store.has(key) ? store.get(key) : null));
  secureStoreMock.set.mockImplementation(async (key, data) => { store.set(key, data); });
  secureStoreMock.remove.mockImplementation(async (key) => { const e = store.has(key); store.delete(key); return e; });
  checkBiometryMock.mockResolvedValue({ isAvailable: true, deviceIsSecure: true });
  vaultMock.deriveKekC.mockResolvedValue(new Uint8Array(32).fill(7));
  vaultMock.decryptVault.mockResolvedValue('seed');
  vaultMock.decryptVaultWithDek.mockResolvedValue('seed');
  vaultMock.encryptVault.mockResolvedValue({ v: 1, kdf: 'argon2id', salt: 's', iv: 'bareiv', ct: 'barect' });
  vaultMock.encryptVaultWithDek.mockResolvedValue({ iv: 'newiv', ct: 'newct' });
  kekMock.combineKek.mockResolvedValue(new Uint8Array(32).fill(9));
  kekMock.unwrapDek.mockResolvedValue(new Uint8Array(32).fill(4));
  kekMock.wrapDek.mockResolvedValue({ v: 1, iv: 'reiv', ct: 'rect' });
  kekMock.randomDek.mockReturnValue(new Uint8Array(32).fill(3));
  kekMock.decodeKekSalt.mockImplementation((s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));
});

// ── enrollKek ───────────────────────────────────────────────────────────────────────
describe('enrollKek — single biometric prompt on happy path', () => {
  it('happy path: authenticate=0 (no app-layer gate), getHardwareFactor=1', async () => {
    setVault(bareVault());
    const getHF = vi.fn(async () => newHF());

    await nativeKeyStore.enrollKek('pw', { getHardwareFactor: getHF });

    // On happy path: the SE/StrongBox getHF prompt IS the biometric gate.
    // The old standalone authenticateOrThrow() at native.js:808 must be gone.
    expect(authenticateMock).toHaveBeenCalledTimes(0);
    expect(getHF).toHaveBeenCalledTimes(1);
  });

  // Wrong-PIN ordering: decryptVault must run BEFORE getHF so a mistyped password
  // does NOT fire a biometric prompt. Today's code flashes Face ID / fingerprint
  // for a typo — a real UX + honesty problem (I4: honest, unsurprising failure).
  it('wrong PIN: getHardwareFactor is NEVER called (no biometric prompt on typo)', async () => {
    setVault(bareVault());
    vaultMock.decryptVault.mockRejectedValueOnce(new Error('wrong password'));
    const getHF = vi.fn(async () => newHF());

    await expect(
      nativeKeyStore.enrollKek('wrong-pw', { getHardwareFactor: getHF }),
    ).rejects.toThrow();

    expect(getHF).toHaveBeenCalledTimes(0);
    expect(authenticateMock).toHaveBeenCalledTimes(0);
    // And critically: no orphaned hardware credential to roll back either.
    expect(clearHardwareCredentialMock).not.toHaveBeenCalled();
  });

  // Lockout fallback: getHF throws NO_HARDWARE_FACTOR (the JS classification of a
  // BiometricPrompt lockout — see hardware.js:236). Fallback engages: authenticateOrThrow
  // fires with allowDeviceCredential (the H16-DEVIATION path), then getHF is retried once.
  it('biometric lockout: engages authenticateOrThrow fallback, then retries getHardwareFactor', async () => {
    setVault(bareVault());
    const getHF = vi.fn()
      .mockRejectedValueOnce(lockoutErr()) // first call: OS reports lockout
      .mockResolvedValue(newHF());           // retry after device-credential auth: succeeds

    await nativeKeyStore.enrollKek('pw', { getHardwareFactor: getHF });

    // authenticate fired exactly ONCE (the fallback), and getHF was retried exactly once.
    expect(authenticateMock).toHaveBeenCalledTimes(1);
    expect(getHF).toHaveBeenCalledTimes(2);
  });

  // A NON-lockout getHF failure (e.g. USER_CANCELLED, KEY_PERMANENTLY_INVALIDATED, or a
  // raw bridge throw) MUST propagate immediately with NO fallback authenticate call and
  // NO retry (I4 fail-closed). This pins that the fallback branch is narrow.
  it('non-lockout getHardwareFactor throw: propagates, no fallback, no retry', async () => {
    setVault(bareVault());
    const err = Object.assign(new Error('KEK_USER_CANCELLED'), { code: 'KEK_USER_CANCELLED' });
    const getHF = vi.fn().mockRejectedValue(err);

    await expect(
      nativeKeyStore.enrollKek('pw', { getHardwareFactor: getHF }),
    ).rejects.toThrow('KEK_USER_CANCELLED');

    expect(authenticateMock).toHaveBeenCalledTimes(0);
    expect(getHF).toHaveBeenCalledTimes(1);
    // I4 rollback still fires (credential may have been materialised before the throw).
    expect(clearHardwareCredentialMock).toHaveBeenCalledTimes(1);
  });
});

// ── enrollKek — reviewer T1 follow-ups (2026-07-16): coverage gaps ──────────────────
// (T1.1/1.2/1.3 are regression pins for already-correct behaviour; T1.4 is a genuine
// RED — the .cause preservation didn't exist in the first-cut wrapper.)
describe('enrollKek — reviewer T1 coverage: rollback + already-enrolled + double-lockout + cause preservation', () => {
  // T1.1 — pin that a clean enroll does NOT touch the rollback path.
  it('happy path: clearHardwareCredential is NOT called on success', async () => {
    setVault(bareVault());
    const getHF = vi.fn(async () => newHF());

    await nativeKeyStore.enrollKek('pw', { getHardwareFactor: getHF });

    expect(clearHardwareCredentialMock).not.toHaveBeenCalled();
  });

  // T1.2 — pin that the KEK_ALREADY_ENROLLED early throw beats any biometric prompt.
  // A user re-tapping "Enable Hardware Protection" on an already-enrolled vault must
  // NOT be shown Face ID or a fingerprint sheet before the honest error surfaces.
  it('KEK_ALREADY_ENROLLED: fires ZERO prompts (no authenticate, no getHF, no rollback)', async () => {
    const enrolledBlob = JSON.stringify({
      v: 1, kdf: 'kek-dek', iv: 'oldiv', ct: 'oldct',
      kekWrap: { v: 1, iv: 'wrapiv', ct: 'wrapct' }, kekSalt, hardwareKekVersion: 3,
    });
    setVault(enrolledBlob);
    const getHF = vi.fn(async () => newHF());

    await expect(
      nativeKeyStore.enrollKek('pw', { getHardwareFactor: getHF }),
    ).rejects.toThrow('KEK_ALREADY_ENROLLED');

    expect(authenticateMock).toHaveBeenCalledTimes(0);
    expect(getHF).toHaveBeenCalledTimes(0);
    // Nothing was materialised, so nothing to roll back.
    expect(clearHardwareCredentialMock).not.toHaveBeenCalled();
  });

  // T1.3 — double lockout: the wrapper must bound the retry (single retry, no loop) so
  // a hard-lockout device does not spin authenticateOrThrow forever.
  it('double-lockout: retry ALSO throws lockout → authenticate=1 (no loop), rollback still fires', async () => {
    setVault(bareVault());
    const getHF = vi.fn()
      .mockRejectedValueOnce(lockoutErr())  // primary getHF: OS lockout
      .mockRejectedValueOnce(lockoutErr()); // retry: STILL locked out

    await expect(
      nativeKeyStore.enrollKek('pw', { getHardwareFactor: getHF }),
    ).rejects.toMatchObject({ code: NO_HARDWARE_FACTOR });

    // Exactly ONE fallback authenticateOrThrow call — no second attempt after retry fails.
    expect(authenticateMock).toHaveBeenCalledTimes(1);
    expect(getHF).toHaveBeenCalledTimes(2);
    // enrollKek's outer catch still rolls back the orphaned hardware credential (I4).
    expect(clearHardwareCredentialMock).toHaveBeenCalledTimes(1);
  });

  // T1.4 — the review's specific ask: when authenticateOrThrow itself throws (user
  // cancels the device-credential fallback), the propagated error must carry the
  // ORIGINAL getHF lockout error as .cause so the UI can honestly distinguish
  // "cancelled while recovering from lockout" from "cancelled the primary prompt".
  it('authenticateOrThrow cancels inside the wrapper: propagated error carries original lockout as .cause + .origCode sidecar; NO retry; rollback fires', async () => {
    setVault(bareVault());
    const lockout = lockoutErr();
    const getHF = vi.fn().mockRejectedValueOnce(lockout);
    const cancelErr = Object.assign(new Error('User cancelled'), { code: 'biometryCancel' });
    authenticateMock.mockRejectedValueOnce(cancelErr);

    let caught;
    await nativeKeyStore.enrollKek('pw', { getHardwareFactor: getHF }).catch((e) => { caught = e; });

    expect(caught).toBeDefined();
    // Original lockout preserved as .cause AND on a .origCode sidecar (belt + suspenders,
    // some environments strip Error.cause across await boundaries).
    expect(caught.cause).toBe(lockout);
    expect(caught.origCode).toBe(NO_HARDWARE_FACTOR);
    // The fallback authenticateOrThrow was attempted exactly ONCE; no getHF retry.
    expect(authenticateMock).toHaveBeenCalledTimes(1);
    expect(getHF).toHaveBeenCalledTimes(1);
    // enrollKek's outer catch still rolls back (a hardware credential may have been
    // materialised by the primary getHF before it threw — I4 fail-closed).
    expect(clearHardwareCredentialMock).toHaveBeenCalledTimes(1);
  });
});

// ── changePassword (KEK branch) ─────────────────────────────────────────────────────
describe('changePassword (KEK vault) — single biometric per prompt on happy path', () => {
  it('happy path: authenticate=0, getHardwareFactor=2 (old-salt + new-salt)', async () => {
    setVault(v3blob());
    const getHF = vi.fn(async () => newHF());

    await nativeKeyStore.changePassword('old-pw', 'new-pw', { getHardwareFactor: getHF });

    // Target: TWO prompts total (down from THREE). Each getHF call fires one OS sheet;
    // the JS-layer authenticateOrThrow is suppressed on happy path.
    expect(authenticateMock).toHaveBeenCalledTimes(0);
    expect(getHF).toHaveBeenCalledTimes(2);
  });

  it('biometric lockout on the first getHF: fallback engages, retries the failing call', async () => {
    setVault(v3blob());
    const getHF = vi.fn()
      .mockRejectedValueOnce(lockoutErr()) // first getHF (old-salt unwrap) reports lockout
      .mockResolvedValueOnce(newHF())        // retry succeeds (H)
      .mockResolvedValueOnce(newHF());       // second getHF (new-salt wrap) succeeds

    await nativeKeyStore.changePassword('old-pw', 'new-pw', { getHardwareFactor: getHF });

    expect(authenticateMock).toHaveBeenCalledTimes(1);
    expect(getHF).toHaveBeenCalledTimes(3); // 2 happy-path calls + 1 retry
  });

  // Bare-vault (non-KEK) branch is unchanged: it MUST still fire authenticateOrThrow (no
  // SE prompt to inherit from) so the operation remains biometric-gated end-to-end.
  it('bare (non-KEK) vault: authenticate=1 (preserves the standalone app-layer gate)', async () => {
    setVault(bareVault());

    await nativeKeyStore.changePassword('old-pw', 'new-pw', {});

    // Bare vault: no getHF, so the app-layer prompt is the ONLY biometric gate.
    expect(authenticateMock).toHaveBeenCalledTimes(1);
  });
});

// ── upgradeKekToV3 ──────────────────────────────────────────────────────────────────
describe('upgradeKekToV3 — single biometric per prompt on happy path', () => {
  // v1/v2 vault that genuinely needs upgrading — the two getHF calls are the two OS
  // biometric sheets (old-salt unwrap + new-salt re-wrap). The app-layer gate must go.
  it('v2 vault: authenticate=0, getHardwareFactor=2 (old + new)', async () => {
    const v2blob = JSON.stringify({
      v: 1, kdf: 'kek-dek', iv: 'oldiv', ct: 'oldct',
      kekWrap: { v: 1, iv: 'wrapiv', ct: 'wrapct' }, kekSalt, hardwareKekVersion: 2,
    });
    setVault(v2blob);
    const getHF = vi.fn(async () => newHF());

    await nativeKeyStore.upgradeKekToV3('pw', { getHardwareFactor: getHF });

    expect(authenticateMock).toHaveBeenCalledTimes(0);
    expect(getHF).toHaveBeenCalledTimes(2);
  });

  it('biometric lockout on the first getHF: fallback engages, retries the failing call', async () => {
    const v2blob = JSON.stringify({
      v: 1, kdf: 'kek-dek', iv: 'oldiv', ct: 'oldct',
      kekWrap: { v: 1, iv: 'wrapiv', ct: 'wrapct' }, kekSalt, hardwareKekVersion: 2,
    });
    setVault(v2blob);
    const getHF = vi.fn()
      .mockRejectedValueOnce(lockoutErr())
      .mockResolvedValueOnce(newHF())
      .mockResolvedValueOnce(newHF());

    await nativeKeyStore.upgradeKekToV3('pw', { getHardwareFactor: getHF });

    expect(authenticateMock).toHaveBeenCalledTimes(1);
    expect(getHF).toHaveBeenCalledTimes(3);
  });

  // Regression guards for the two no-op cases that MUST stay prompt-free (they were
  // already prompt-free in the current code; pin the guarantee against a refactor).
  it('already-v3 vault: authenticate=0, getHardwareFactor=0 (no-op, no prompt)', async () => {
    setVault(v3blob());
    const getHF = vi.fn(async () => newHF());

    const result = await nativeKeyStore.upgradeKekToV3('pw', { getHardwareFactor: getHF });

    expect(result).toEqual({ upgraded: false, version: 3 });
    expect(authenticateMock).toHaveBeenCalledTimes(0);
    expect(getHF).toHaveBeenCalledTimes(0);
  });

  it('bare (non-KEK) vault: authenticate=0, getHardwareFactor=0 (throws before either)', async () => {
    setVault(bareVault());
    const getHF = vi.fn(async () => newHF());

    await expect(
      nativeKeyStore.upgradeKekToV3('pw', { getHardwareFactor: getHF }),
    ).rejects.toThrow();

    expect(authenticateMock).toHaveBeenCalledTimes(0);
    expect(getHF).toHaveBeenCalledTimes(0);
  });
});

// ── _unlockInner (via unlock) — B1 lockout-fallback coverage ──────────────────────────
describe('unlock (KEK vault) — lockout-fallback wrapper (B1)', () => {
  it('happy path: authenticate=0, getHardwareFactor=1', async () => {
    setVault(v3blob());
    const getHF = vi.fn(async () => newHF());

    await nativeKeyStore.unlock('pw', { getHardwareFactor: getHF });

    expect(authenticateMock).toHaveBeenCalledTimes(0);
    expect(getHF).toHaveBeenCalledTimes(1);
  });

  it('biometric lockout: engages authenticateOrThrow fallback, then retries getHardwareFactor', async () => {
    setVault(v3blob());
    const getHF = vi.fn()
      .mockRejectedValueOnce(lockoutErr())
      .mockResolvedValue(newHF());

    await nativeKeyStore.unlock('pw', { getHardwareFactor: getHF });

    expect(authenticateMock).toHaveBeenCalledTimes(1);
    expect(getHF).toHaveBeenCalledTimes(2);
  });

  it('double-lockout: retry also throws → authenticate=1 (no loop)', async () => {
    setVault(v3blob());
    const getHF = vi.fn()
      .mockRejectedValueOnce(lockoutErr())
      .mockRejectedValueOnce(lockoutErr());

    await expect(
      nativeKeyStore.unlock('pw', { getHardwareFactor: getHF }),
    ).rejects.toMatchObject({ code: NO_HARDWARE_FACTOR });

    expect(authenticateMock).toHaveBeenCalledTimes(1);
    expect(getHF).toHaveBeenCalledTimes(2);
  });

  it('non-lockout getHF throw: propagates immediately, no fallback', async () => {
    setVault(v3blob());
    const err = Object.assign(new Error('KEK_USER_CANCELLED'), { code: 'KEK_USER_CANCELLED' });
    const getHF = vi.fn().mockRejectedValue(err);

    await expect(
      nativeKeyStore.unlock('pw', { getHardwareFactor: getHF }),
    ).rejects.toThrow('KEK_USER_CANCELLED');

    expect(authenticateMock).toHaveBeenCalledTimes(0);
    expect(getHF).toHaveBeenCalledTimes(1);
  });

  it('authenticateOrThrow cancel inside wrapper: .cause + .origCode preserved', async () => {
    setVault(v3blob());
    const lockout = lockoutErr();
    const getHF = vi.fn().mockRejectedValueOnce(lockout);
    const cancelErr = Object.assign(new Error('User cancelled'), { code: 'biometryCancel' });
    authenticateMock.mockRejectedValueOnce(cancelErr);

    let caught;
    await nativeKeyStore.unlock('pw', { getHardwareFactor: getHF }).catch((e) => { caught = e; });

    expect(caught).toBeDefined();
    expect(caught.cause).toBe(lockout);
    expect(caught.origCode).toBe(NO_HARDWARE_FACTOR);
    expect(authenticateMock).toHaveBeenCalledTimes(1);
    expect(getHF).toHaveBeenCalledTimes(1);
  });
});

// ── saveVaultContents — B1 lockout-fallback coverage ──────────────────────────────────
describe('saveVaultContents (KEK vault) — lockout-fallback wrapper (B1)', () => {
  it('happy path: authenticate=0, getHardwareFactor=1', async () => {
    setVault(v3blob());
    const getHF = vi.fn(async () => newHF());

    await nativeKeyStore.saveVaultContents('newseed', 'pw', { getHardwareFactor: getHF });

    expect(authenticateMock).toHaveBeenCalledTimes(0);
    expect(getHF).toHaveBeenCalledTimes(1);
  });

  it('biometric lockout: engages authenticateOrThrow fallback, then retries getHardwareFactor', async () => {
    setVault(v3blob());
    const getHF = vi.fn()
      .mockRejectedValueOnce(lockoutErr())
      .mockResolvedValue(newHF());

    await nativeKeyStore.saveVaultContents('newseed', 'pw', { getHardwareFactor: getHF });

    expect(authenticateMock).toHaveBeenCalledTimes(1);
    expect(getHF).toHaveBeenCalledTimes(2);
  });

  it('double-lockout: retry also throws → authenticate=1 (no loop)', async () => {
    setVault(v3blob());
    const getHF = vi.fn()
      .mockRejectedValueOnce(lockoutErr())
      .mockRejectedValueOnce(lockoutErr());

    await expect(
      nativeKeyStore.saveVaultContents('newseed', 'pw', { getHardwareFactor: getHF }),
    ).rejects.toMatchObject({ code: NO_HARDWARE_FACTOR });

    expect(authenticateMock).toHaveBeenCalledTimes(1);
    expect(getHF).toHaveBeenCalledTimes(2);
  });

  it('non-lockout getHF throw: propagates immediately, no fallback', async () => {
    setVault(v3blob());
    const err = Object.assign(new Error('KEK_USER_CANCELLED'), { code: 'KEK_USER_CANCELLED' });
    const getHF = vi.fn().mockRejectedValue(err);

    await expect(
      nativeKeyStore.saveVaultContents('newseed', 'pw', { getHardwareFactor: getHF }),
    ).rejects.toThrow('KEK_USER_CANCELLED');

    expect(authenticateMock).toHaveBeenCalledTimes(0);
    expect(getHF).toHaveBeenCalledTimes(1);
  });

  it('authenticateOrThrow cancel inside wrapper: .cause + .origCode preserved', async () => {
    setVault(v3blob());
    const lockout = lockoutErr();
    const getHF = vi.fn().mockRejectedValueOnce(lockout);
    const cancelErr = Object.assign(new Error('User cancelled'), { code: 'biometryCancel' });
    authenticateMock.mockRejectedValueOnce(cancelErr);

    let caught;
    await nativeKeyStore.saveVaultContents('newseed', 'pw', { getHardwareFactor: getHF }).catch((e) => { caught = e; });

    expect(caught).toBeDefined();
    expect(caught.cause).toBe(lockout);
    expect(caught.origCode).toBe(NO_HARDWARE_FACTOR);
    expect(authenticateMock).toHaveBeenCalledTimes(1);
    expect(getHF).toHaveBeenCalledTimes(1);
  });
});

// ── unenrollKek — B1 lockout-fallback coverage ────────────────────────────────────────
describe('unenrollKek — lockout-fallback wrapper (B1)', () => {
  it('happy path: authenticate=0, getHardwareFactor=1', async () => {
    setVault(v3blob());
    const getHF = vi.fn(async () => newHF());

    await nativeKeyStore.unenrollKek('pw', { getHardwareFactor: getHF });

    expect(authenticateMock).toHaveBeenCalledTimes(0);
    expect(getHF).toHaveBeenCalledTimes(1);
  });

  it('biometric lockout: engages authenticateOrThrow fallback, then retries getHardwareFactor', async () => {
    setVault(v3blob());
    const getHF = vi.fn()
      .mockRejectedValueOnce(lockoutErr())
      .mockResolvedValue(newHF());

    await nativeKeyStore.unenrollKek('pw', { getHardwareFactor: getHF });

    expect(authenticateMock).toHaveBeenCalledTimes(1);
    expect(getHF).toHaveBeenCalledTimes(2);
    expect(clearHardwareCredentialMock).toHaveBeenCalledTimes(1);
  });

  it('double-lockout: retry also throws → authenticate=1 (no loop), no unenroll', async () => {
    setVault(v3blob());
    const getHF = vi.fn()
      .mockRejectedValueOnce(lockoutErr())
      .mockRejectedValueOnce(lockoutErr());

    await expect(
      nativeKeyStore.unenrollKek('pw', { getHardwareFactor: getHF }),
    ).rejects.toMatchObject({ code: NO_HARDWARE_FACTOR });

    expect(authenticateMock).toHaveBeenCalledTimes(1);
    expect(getHF).toHaveBeenCalledTimes(2);
    // Unenroll did NOT complete — credential must be preserved (I4 fail-closed).
    expect(clearHardwareCredentialMock).not.toHaveBeenCalled();
  });

  it('non-lockout getHF throw: propagates immediately, no fallback', async () => {
    setVault(v3blob());
    const err = Object.assign(new Error('KEK_USER_CANCELLED'), { code: 'KEK_USER_CANCELLED' });
    const getHF = vi.fn().mockRejectedValue(err);

    await expect(
      nativeKeyStore.unenrollKek('pw', { getHardwareFactor: getHF }),
    ).rejects.toThrow('KEK_USER_CANCELLED');

    expect(authenticateMock).toHaveBeenCalledTimes(0);
    expect(getHF).toHaveBeenCalledTimes(1);
    expect(clearHardwareCredentialMock).not.toHaveBeenCalled();
  });

  it('authenticateOrThrow cancel inside wrapper: .cause + .origCode preserved, no unenroll', async () => {
    setVault(v3blob());
    const lockout = lockoutErr();
    const getHF = vi.fn().mockRejectedValueOnce(lockout);
    const cancelErr = Object.assign(new Error('User cancelled'), { code: 'biometryCancel' });
    authenticateMock.mockRejectedValueOnce(cancelErr);

    let caught;
    await nativeKeyStore.unenrollKek('pw', { getHardwareFactor: getHF }).catch((e) => { caught = e; });

    expect(caught).toBeDefined();
    expect(caught.cause).toBe(lockout);
    expect(caught.origCode).toBe(NO_HARDWARE_FACTOR);
    expect(authenticateMock).toHaveBeenCalledTimes(1);
    expect(getHF).toHaveBeenCalledTimes(1);
    expect(clearHardwareCredentialMock).not.toHaveBeenCalled();
  });
});
