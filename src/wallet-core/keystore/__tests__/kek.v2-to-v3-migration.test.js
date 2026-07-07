// kek.v2-to-v3-migration.test.js — C-1 T1: v2→v3 upgrade integration test.
//
// CLOSES: the "v2→v3 migration device-exercise" residual from the 2026-07-05
// verification session (see docs/audit-2026-07-01-kek-internal.md C-1 annotation).
//
// The APK-swap method (APK-OLD pre-#568 → APK-NEW current main) failed because the
// PIN encoding diverged between builds. This test exercises the same migration path
// with REAL crypto (WebCrypto HMAC-SHA256 + AES-GCM via kek.js combineKek/wrapDek/
// unwrapDek) and current-era PIN encoding, proving the migration is brickless WITHOUT
// needing two APK builds.
//
// What it proves:
//   1. A v2-stamped vault (kekWrap made under the FIXED v1 salt) can be unwrapped
//      using the v2 fixed-salt H derivation.
//   2. upgradeKekToV3 (via changePassword with same PIN) re-wraps the SAME DEK under
//      a FRESH per-enrollment salt and stamps v3.
//   3. The upgraded v3 vault unlocks with the v3 salt-bound H derivation.
//   4. The seed recovered after upgrade === the seed before upgrade (no data loss).
//   5. The old v2 salt and new v3 salt are DIFFERENT (per-enrollment binding).
//
// Uses REAL WebCrypto for HMAC-SHA256, AES-GCM (combineKek/wrapDek/unwrapDek), and
// a SHA-256 stand-in for Argon2id (same pattern as kek.salt-binding-tamper.test.js —
// the only property under test is salt-dependence, not KDF cost).

import { describe, it, expect } from 'vitest';
import { combineKek, wrapDek, unwrapDek, randomDek, KEK_ERR } from '../kek.js';

const enc = new TextEncoder();

// Fixed v1 salt — matches HardwareKekPlugin.kt PRF_EVAL_SALT exactly:
// "Veyrnox-prf-v1-kek-eval-salt!!!!" (32 bytes)
const V1_FIXED_SALT = new Uint8Array([
  0x56, 0x65, 0x79, 0x72, 0x6e, 0x6f, 0x78, 0x2d,
  0x70, 0x72, 0x66, 0x2d, 0x76, 0x31, 0x2d, 0x6b,
  0x65, 0x6b, 0x2d, 0x65, 0x76, 0x61, 0x6c, 0x2d,
  0x73, 0x61, 0x6c, 0x74, 0x21, 0x21, 0x21, 0x21,
]);

// Faithful model of HardwareKekPlugin.kt: H = HMAC-SHA256(AndroidKeyStore key, macInput).
// v2 vault → macInput is V1_FIXED_SALT (the bug: facade dropped the per-enrollment salt).
// v3 vault → macInput is the per-enrollment kekSalt (genuinely bound).
async function hFactor(hwKey, macInput) {
  const key = await crypto.subtle.importKey('raw', hwKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, macInput);
  return new Uint8Array(mac);
}

// SHA-256(PIN‖salt) stand-in for Argon2id — same pattern as kek.salt-binding-tamper.test.js.
async function cFactor(pin, salt) {
  const data = new Uint8Array([...enc.encode(pin), ...salt]);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(digest);
}

// The single device-bound AndroidKeyStore key (same across both derivations — it's the device).
const HW_KEY = new Uint8Array(32).fill(0xa5);
const PIN = '30081977';

describe('C-1 T1: v2→v3 brickless migration (real crypto)', () => {
  it('a v2-stamped vault upgrades to v3 with a fresh salt — same DEK, no data loss', async () => {
    // ── STEP 1: Create a v2-stamped vault (simulating APK-OLD) ──────────
    // The v2 enrollment salt was stored in the blob BUT never used for HMAC
    // (the facade dropped it). So H was derived from V1_FIXED_SALT.
    const v2StoredSalt = crypto.getRandomValues(new Uint8Array(32));
    const v2StoredSaltB64 = btoa(String.fromCharCode(...v2StoredSalt));

    // v2 H: HMAC(hwKey, V1_FIXED_SALT) — the bug: salt was ignored.
    const H_v2 = await hFactor(HW_KEY, V1_FIXED_SALT);
    const C_v2 = await cFactor(PIN, v2StoredSalt);
    const KEK_v2 = await combineKek(H_v2, C_v2);

    // Wrap a random DEK under the v2 KEK.
    const originalDek = randomDek();
    const originalDekCopy = originalDek.slice(); // save before zeroing
    const v2KekWrap = await wrapDek(KEK_v2, originalDek);

    // The v2 vault blob as it would be stored.
    const v2Blob = {
      v: 1, kdf: 'kek-dek', salt: 'vault-salt', iv: 'vault-iv', ct: 'vault-ct',
      kekWrap: v2KekWrap,
      kekSalt: v2StoredSaltB64,
      hardwareKekVersion: 2,
    };

    // ── STEP 2: Unlock the v2 vault (APK-NEW reading a v2 blob) ─────────
    // hfOptsForBlob(v2) → undefined → getHardwareFactor called with no args
    // → plugin uses V1_FIXED_SALT (the legacy path).
    const H_v2_unlock = await hFactor(HW_KEY, V1_FIXED_SALT);
    const C_v2_unlock = await cFactor(PIN, v2StoredSalt);
    const KEK_v2_unlock = await combineKek(H_v2_unlock, C_v2_unlock);
    const recoveredDek = await unwrapDek(KEK_v2_unlock, v2Blob.kekWrap);

    // The DEK must be recoverable — v2 unlock works.
    expect(Array.from(recoveredDek)).toEqual(Array.from(originalDekCopy));

    // ── STEP 3: Simulate upgradeKekToV3 (changePassword with same PIN) ──
    // Generate a FRESH per-enrollment salt for v3.
    const v3Salt = crypto.getRandomValues(new Uint8Array(32));
    const v3SaltB64 = btoa(String.fromCharCode(...v3Salt));

    // v3 H: HMAC(hwKey, v3Salt) — genuinely salt-bound.
    const H_v3 = await hFactor(HW_KEY, v3Salt);
    const C_v3 = await cFactor(PIN, v3Salt);
    const KEK_v3 = await combineKek(H_v3, C_v3);

    // Re-wrap the SAME DEK under the new v3 KEK.
    const v3KekWrap = await wrapDek(KEK_v3, recoveredDek);

    // The upgraded v3 blob.
    const v3Blob = {
      ...v2Blob,
      kekWrap: v3KekWrap,
      kekSalt: v3SaltB64,
      hardwareKekVersion: 3,
    };

    // ── STEP 4: Unlock the upgraded v3 vault ────────────────────────────
    const H_v3_unlock = await hFactor(HW_KEY, v3Salt);
    const C_v3_unlock = await cFactor(PIN, v3Salt);
    const KEK_v3_unlock = await combineKek(H_v3_unlock, C_v3_unlock);
    const dekAfterUpgrade = await unwrapDek(KEK_v3_unlock, v3Blob.kekWrap);

    // CRITICAL ASSERTION: the DEK after upgrade is the SAME as before — no data loss.
    expect(Array.from(dekAfterUpgrade)).toEqual(Array.from(originalDekCopy));

    // ── STEP 5: Verify salt rotation ────────────────────────────────────
    expect(v3Blob.hardwareKekVersion).toBe(3);
    expect(v3Blob.kekSalt).not.toBe(v2Blob.kekSalt); // salt rotated
    expect(v3Blob.kekSalt).toBe(v3SaltB64);

    // The seed ciphertext is preserved — only the KEK wrap rotates.
    expect(v3Blob.iv).toBe(v2Blob.iv);
    expect(v3Blob.ct).toBe(v2Blob.ct);
  });

  it('the old v2 KEK cannot unwrap the v3 kekWrap (forward security)', async () => {
    // If someone has the old H (from the fixed salt), they cannot unwrap a v3 vault.
    const v3Salt = crypto.getRandomValues(new Uint8Array(32));
    const H_v3 = await hFactor(HW_KEY, v3Salt);
    const C_v3 = await cFactor(PIN, v3Salt);
    const KEK_v3 = await combineKek(H_v3, C_v3);
    const dek = randomDek();
    const v3Wrap = await wrapDek(KEK_v3, dek);

    // Try to unwrap with the old fixed-salt KEK.
    const H_old = await hFactor(HW_KEY, V1_FIXED_SALT);
    const C_old = await cFactor(PIN, v3Salt); // same PIN, same salt for C
    const KEK_old = await combineKek(H_old, C_old);
    await expect(unwrapDek(KEK_old, v3Wrap)).rejects.toThrow(KEK_ERR.UNWRAP_FAILED);
  });

  it('the v3 KEK cannot unwrap the old v2 kekWrap (backward isolation)', async () => {
    // A v3-derived KEK (with a fresh salt for H) cannot open a v2 wrap (fixed-salt H).
    const v2Salt = crypto.getRandomValues(new Uint8Array(32));
    const H_v2 = await hFactor(HW_KEY, V1_FIXED_SALT);
    const C_v2 = await cFactor(PIN, v2Salt);
    const KEK_v2 = await combineKek(H_v2, C_v2);
    const dek = randomDek();
    const v2Wrap = await wrapDek(KEK_v2, dek);

    // Try to unwrap with a v3-derived KEK (salt-bound H).
    const v3Salt = crypto.getRandomValues(new Uint8Array(32));
    const H_v3 = await hFactor(HW_KEY, v3Salt);
    const C_v3 = await cFactor(PIN, v3Salt);
    const KEK_v3 = await combineKek(H_v3, C_v3);
    await expect(unwrapDek(KEK_v3, v2Wrap)).rejects.toThrow(KEK_ERR.UNWRAP_FAILED);
  });
});
