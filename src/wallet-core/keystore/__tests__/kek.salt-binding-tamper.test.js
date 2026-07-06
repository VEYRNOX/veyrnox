// kek.salt-binding-tamper.test.js — C-1 (audit F2.4): per-enrollment kekSalt tamper → fail closed.
//
// Independent-audit follow-up (docs/audit-triage/independent-audit-2026-07-06-android-kek-suite.md).
// The C-1 v3 binding derives BOTH KEK factors from the per-enrollment kekSalt stored in the
// vault blob:
//   H = HMAC-SHA256(hardware key, kekSalt)   — HardwareKekPlugin.kt (Android)
//   C = Argon2id(PIN, kekSalt)               — vault.js deriveKekC
// so a wrap made under salt s1 must NEVER unwrap under a DIFFERENT valid salt s2: the AES-GCM
// tag fails and unwrapDek returns the GENERIC KEK_ERR.UNWRAP_FAILED (deniability-safe oracle).
//
// COVERAGE GAP THIS CLOSES: existing tests exercised an EMPTY/degenerate salt
// (native.kek-v3-migration §E) and a tampered wrap-VERSION byte (kek.wrap-aad §c), but NOT a
// valid-but-different salt value — the exact "attacker rewrites the stored kekSalt" case the
// audit flagged as asserted-by-construction-only.
//
// This uses REAL WebCrypto (combineKek/wrapDek/unwrapDek from kek.js) and models each factor's
// salt-dependence faithfully:
//   • H(salt): a real HMAC-SHA256 over the salt with a fixed key — this is EXACTLY the Android
//     plugin's construction, so it is the same primitive, not a stand-in.
//   • C(salt): a deterministic SHA-256(PIN‖salt) stand-in for Argon2id — the only property
//     under test is "different salt ⇒ different C", which SHA-256 preserves without the
//     multi-hundred-ms Argon2 cost (Argon2id itself is covered by vault.js tests).
//
// NOTE: combineKek zeroes H and C in place, so every combine is given FRESH factor bytes.

import { describe, it, expect } from 'vitest';
import { combineKek, wrapDek, unwrapDek, randomDek, KEK_ERR } from '../kek.js';

const enc = new TextEncoder();

// Faithful model of HardwareKekPlugin.kt: H = HMAC-SHA256(AndroidKeyStore key, kekSalt).
async function hFactor(hwKey, salt) {
  const key = await crypto.subtle.importKey('raw', hwKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, salt);
  return new Uint8Array(mac); // 32 bytes
}

// Stand-in for vault.js deriveKekC = Argon2id(PIN, salt). The ONLY property under test is
// salt-dependence, so SHA-256(PIN‖salt) suffices (fast, deterministic, salt-bound).
async function cFactor(pin, salt) {
  const data = new Uint8Array([...enc.encode(pin), ...salt]);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(digest); // 32 bytes
}

// Derive the KEK the production combine would produce for (hardware key, PIN, kekSalt).
async function kekFor(hwKey, pin, salt) {
  return combineKek(await hFactor(hwKey, salt), await cFactor(pin, salt));
}

const HW_KEY = new Uint8Array(32).fill(0xa5); // the single device-bound Keystore key
const PIN = '123456';
const SALT_1 = new Uint8Array(32).fill(0x11); // the enrollment salt (valid, 32 bytes)
const SALT_2 = new Uint8Array(32).fill(0x22); // a DIFFERENT valid 32-byte salt (the tamper)

describe('C-1 salt binding — a valid-but-different kekSalt fails closed (audit F2.4)', () => {
  it('positive control: the intact enrollment salt unwraps the DEK', async () => {
    const dek = randomDek();
    const wrapped = await wrapDek(await kekFor(HW_KEY, PIN, SALT_1), dek);
    const recovered = await unwrapDek(await kekFor(HW_KEY, PIN, SALT_1), wrapped);
    expect(recovered).toEqual(dek);
  });

  it('tampering the kekSalt to another valid value → UNWRAP_FAILED (both factors rebind)', async () => {
    const dek = randomDek();
    const wrapped = await wrapDek(await kekFor(HW_KEY, PIN, SALT_1), dek);
    // Attacker swaps the stored kekSalt s1 → s2; unlock re-derives BOTH H and C under s2.
    await expect(
      unwrapDek(await kekFor(HW_KEY, PIN, SALT_2), wrapped),
    ).rejects.toThrow(KEK_ERR.UNWRAP_FAILED);
  });

  it('salt binds the HARDWARE factor H: salt-2 H with salt-1 C → UNWRAP_FAILED', async () => {
    const dek = randomDek();
    const wrapped = await wrapDek(
      await combineKek(await hFactor(HW_KEY, SALT_1), await cFactor(PIN, SALT_1)),
      dek,
    );
    // Only H's salt is tampered (C still under s1): H is salt-bound, so the KEK differs.
    await expect(
      unwrapDek(await combineKek(await hFactor(HW_KEY, SALT_2), await cFactor(PIN, SALT_1)), wrapped),
    ).rejects.toThrow(KEK_ERR.UNWRAP_FAILED);
  });

  it('salt binds the SET factor C: salt-1 H with salt-2 C → UNWRAP_FAILED', async () => {
    const dek = randomDek();
    const wrapped = await wrapDek(
      await combineKek(await hFactor(HW_KEY, SALT_1), await cFactor(PIN, SALT_1)),
      dek,
    );
    // Only C's salt is tampered (H still under s1): C is salt-bound, so the KEK differs.
    await expect(
      unwrapDek(await combineKek(await hFactor(HW_KEY, SALT_1), await cFactor(PIN, SALT_2)), wrapped),
    ).rejects.toThrow(KEK_ERR.UNWRAP_FAILED);
  });
});
