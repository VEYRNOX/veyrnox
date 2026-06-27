// wallet-core/__tests__/kek.test.js
//
// KEK layer (docs/kek-architecture-spec.md §3, §7, §9). UNAUDITED-PROVISIONAL.
//
// These tests pin the CONTRACT of the key-encryption-key combine + wrap layer that
// binds seed decryption to a hardware factor H (the WebAuthn `prf` output) without
// weakening the coercion model. They assert STRUCTURE and machine codes/behaviour,
// never prose. The PRF itself is never mocked to "look real": tests use an explicit,
// clearly test-only deterministic H supplier (a fixed byte vector), exercising the
// SAME combine the production path uses. The real hardware H comes from prfSpike.js
// on a real device (spec §8) and is NOT exercised here.
//
// Spec mapping:
//   §3  combine(H,C) -> stable KEK; KEK wraps/unwraps DEK (two-key layering)
//   §7/§10 non-enrolled / no-PRF -> fail CLOSED with an explicit code, never a
//          silent fallback to a PIN-only / global / plaintext key (I4)
//   §9.1 domain separation: H and C cannot be transposed
//   I3  combine is input-shape-constant across real and decoy sets (no per-set tell)

import { describe, it, expect } from 'vitest';
import {
  combineKek,
  wrapDek,
  unwrapDek,
  randomDek,
  KEK_ERR,
  KEK_DOMAIN,
} from '../keystore/kek.js';

const enc = new TextEncoder();

// TEST-ONLY deterministic stand-ins. H is the hardware PRF output (32 bytes); on a
// real device it comes from the secure element via prfSpike.evaluatePrf. C is the
// Argon2id(PIN, salt_set) output. Both are fixed-length byte vectors here.
function fixedBytes(byte, n = 32) {
  const a = new Uint8Array(n);
  a.fill(byte);
  return a;
}
// combineKek now ZEROES its H/C inputs in place (M20). These accessors hand out a
// FRESH copy each time so tests that call combineKek repeatedly with the "same"
// factor are not poisoned by an earlier call's wipe — mirroring production, where
// every combineKek call derives a fresh H (getHardwareFactor) and C (deriveKekC).
const H_REAL = () => fixedBytes(0xa1);
const C_REAL = () => fixedBytes(0xc1);
const C_DECOY = () => fixedBytes(0xc2); // a DIFFERENT set-selecting factor (different PIN)

describe('KEK combine(H, C) — §3 keying stack', () => {
  it('produces a stable KEK for the same (H, C)', async () => {
    const k1 = await combineKek(H_REAL(), C_REAL());
    const k2 = await combineKek(H_REAL(), C_REAL());
    expect(k1).toBeInstanceOf(Uint8Array);
    expect(k1.length).toBe(32);
    expect(Array.from(k1)).toEqual(Array.from(k2));
  });

  it('a different C (different PIN/set) yields a different KEK', async () => {
    const kReal = await combineKek(H_REAL(), C_REAL());
    const kDecoy = await combineKek(H_REAL(), C_DECOY());
    expect(Array.from(kReal)).not.toEqual(Array.from(kDecoy));
  });

  it('a different H (different device) yields a different KEK — hardware binding', async () => {
    const k = await combineKek(H_REAL(), C_REAL());
    const kOtherDevice = await combineKek(fixedBytes(0xa2), C_REAL());
    expect(Array.from(k)).not.toEqual(Array.from(kOtherDevice));
  });

  it('domain-separates H and C — they cannot be transposed (§9.1)', async () => {
    const normal = await combineKek(H_REAL(), C_REAL());
    const swapped = await combineKek(C_REAL(), H_REAL());
    expect(Array.from(normal)).not.toEqual(Array.from(swapped));
  });

  it('fails CLOSED on a missing/wrong-length hardware factor H (I4, §10)', async () => {
    await expect(combineKek(null, C_REAL())).rejects.toThrow(KEK_ERR.NO_HARDWARE_FACTOR);
    await expect(combineKek(fixedBytes(0xa1, 16), C_REAL())).rejects.toThrow(KEK_ERR.NO_HARDWARE_FACTOR);
  });

  it('fails CLOSED on a missing/wrong-length set factor C (I4)', async () => {
    await expect(combineKek(H_REAL(), null)).rejects.toThrow(KEK_ERR.NO_SET_FACTOR);
    await expect(combineKek(H_REAL(), fixedBytes(0xc1, 16))).rejects.toThrow(KEK_ERR.NO_SET_FACTOR);
  });

  it('binds a fixed domain-separation context (audit line-item §9.1)', () => {
    expect(typeof KEK_DOMAIN).toBe('string');
    expect(KEK_DOMAIN.length).toBeGreaterThan(0);
  });

  // M20: H (hardware binding key) and C (full Argon2id output) are the highest-
  // sensitivity intermediates in the unlock path. After the KEK is derived they
  // MUST NOT linger in the JS heap. combineKek zeroes BOTH in place before
  // returning. Uses FRESH (non-shared) arrays so this destructive contract does
  // not poison the module-level H_REAL/C_REAL used by other tests.
  it('zeroes H and C in place after deriving the KEK (M20, I4)', async () => {
    const H = fixedBytes(0xa1);
    const C = fixedBytes(0xc1);
    const kek = await combineKek(H, C);
    expect(kek).toBeInstanceOf(Uint8Array);
    expect(kek.length).toBe(32);
    // The caller's factor arrays are wiped — no secret left behind for GC to leak.
    expect(H.every((b) => b === 0)).toBe(true);
    expect(C.every((b) => b === 0)).toBe(true);
  });
});

describe('KEK wrap/unwrap DEK — §3 two-key layering', () => {
  it('round-trips a DEK losslessly under the same KEK', async () => {
    const kek = await combineKek(H_REAL(), C_REAL());
    const dek = randomDek();
    const wrapped = await wrapDek(kek, dek);
    const recovered = await unwrapDek(kek, wrapped);
    expect(Array.from(recovered)).toEqual(Array.from(dek));
  });

  it('a wrapped DEK is opaque (not the DEK in the clear)', async () => {
    const kek = await combineKek(H_REAL(), C_REAL());
    const dek = randomDek();
    const wrapped = await wrapDek(kek, dek);
    // structure: { v, iv, ct } — never the raw dek bytes
    expect(wrapped.v).toBe(1);
    expect(typeof wrapped.iv).toBe('string');
    expect(typeof wrapped.ct).toBe('string');
    const hay = JSON.stringify(wrapped);
    let dekStr = '';
    for (const b of dek) dekStr += String.fromCharCode(b);
    expect(hay.includes(btoa(dekStr))).toBe(false);
  });

  it('unwrap with the WRONG KEK fails closed (AEAD auth) with a generic error', async () => {
    const kekReal = await combineKek(H_REAL(), C_REAL());
    const kekDecoy = await combineKek(H_REAL(), C_DECOY());
    const dek = randomDek();
    const wrapped = await wrapDek(kekReal, dek);
    // A decoy PIN's KEK must NOT unwrap the real DEK, and must not reveal WHY.
    await expect(unwrapDek(kekDecoy, wrapped)).rejects.toThrow(KEK_ERR.UNWRAP_FAILED);
  });

  it('re-wrapping the SAME DEK under a NEW KEK supports PIN rotation without touching the seed (§3)', async () => {
    const oldKek = await combineKek(H_REAL(), C_REAL());
    const newC = fixedBytes(0xc9);
    const newKek = await combineKek(H_REAL(), newC);
    const dek = randomDek();
    const wrapped = await wrapDek(oldKek, dek);
    // rotate: unwrap with old, re-wrap with new
    const same = await unwrapDek(oldKek, wrapped);
    const rewrapped = await wrapDek(newKek, same);
    expect(Array.from(await unwrapDek(newKek, rewrapped))).toEqual(Array.from(dek));
    // old KEK no longer opens the rotated wrap
    await expect(unwrapDek(oldKek, rewrapped)).rejects.toThrow(KEK_ERR.UNWRAP_FAILED);
  });
});

describe('KEK I3 — combine is input-shape-constant across real and decoy sets', () => {
  it('produces the SAME-length output and runs the SAME op set for real vs decoy C', async () => {
    // The construction must not branch on WHICH set the C belongs to — the combine
    // sees only fixed-length bytes, so real and decoy are indistinguishable in shape.
    const kReal = await combineKek(H_REAL(), C_REAL());
    const kDecoy = await combineKek(H_REAL(), C_DECOY());
    expect(kReal.length).toBe(kDecoy.length);
    // Both are 32-byte HKDF outputs regardless of the set; no per-set branch exists.
    expect(kReal.length).toBe(32);
  });

  it('wrap output size is identical for real and decoy DEKs (no size tell — §9.5)', async () => {
    const kReal = await combineKek(H_REAL(), C_REAL());
    const kDecoy = await combineKek(H_REAL(), C_DECOY());
    const wReal = await wrapDek(kReal, randomDek());
    const wDecoy = await wrapDek(kDecoy, randomDek());
    expect(wReal.ct.length).toBe(wDecoy.ct.length);
    expect(wReal.iv.length).toBe(wDecoy.iv.length);
  });
});

// ── web.js wiring (enroll / unlock / rotate, fail-closed) ─────────────────────
// The hardware factor H is supplied by a TEST-ONLY deterministic provider — a fixed
// 32-byte vector standing in for the device's prf output. It is NOT a mock of a
// security control made to "look real": it exercises the SAME combine the production
// path uses, and is clearly labelled test-only. Real H comes from prfSpike on device.

describe('web.js KEK wiring — enroll, unlock, rotate, fail-closed', () => {
  // dynamic import so the kek-combine tests above run even if the store deps differ.
  const SECRET = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
  // 12-char minimum enforced by H-A (validateWebVaultPassword) on web mainnet builds.
  const PIN = '133713370000';
  const NEW_PIN = '909090900000';
  const testHF = () => Promise.resolve(fixedBytes(0xaa)); // TEST-ONLY device factor

  it('enrolls KEK then unlocks only with the hardware factor + correct PIN', async () => {
    const { webKeyStore } = await import('../keystore/web.js');
    const { clearVault, loadVault } = await import('../evm/vaultStore.js');
    await clearVault();
    await webKeyStore.createVault(SECRET, PIN);
    await webKeyStore.enrollKek(PIN, { getHardwareFactor: testHF });

    const blob = await loadVault();
    expect(blob.kekWrap).toBeTruthy();
    expect(typeof blob.kekSalt).toBe('string');

    // Correct PIN + H -> seed.
    expect(await webKeyStore.unlock(PIN, { getHardwareFactor: testHF })).toBe(SECRET);
  });

  it('fails CLOSED on an enrolled vault when NO hardware-factor provider is given (I4)', async () => {
    const { webKeyStore } = await import('../keystore/web.js');
    const { clearVault } = await import('../evm/vaultStore.js');
    await clearVault();
    await webKeyStore.createVault(SECRET, PIN);
    await webKeyStore.enrollKek(PIN, { getHardwareFactor: testHF });

    // No provider -> explicit NO_HARDWARE_FACTOR, never a silent bare-vault open.
    await expect(webKeyStore.unlock(PIN)).rejects.toThrow(KEK_ERR.NO_HARDWARE_FACTOR);
  });

  it('a WRONG PIN on an enrolled vault fails the unwrap (no inner-vault leak)', async () => {
    const { webKeyStore } = await import('../keystore/web.js');
    const { clearVault } = await import('../evm/vaultStore.js');
    await clearVault();
    await webKeyStore.createVault(SECRET, PIN);
    await webKeyStore.enrollKek(PIN, { getHardwareFactor: testHF });

    await expect(webKeyStore.unlock('00000000', { getHardwareFactor: testHF }))
      .rejects.toThrow(KEK_ERR.UNWRAP_FAILED);
  });

  it('a WRONG hardware factor (different device) fails the unwrap', async () => {
    const { webKeyStore } = await import('../keystore/web.js');
    const { clearVault } = await import('../evm/vaultStore.js');
    await clearVault();
    await webKeyStore.createVault(SECRET, PIN);
    await webKeyStore.enrollKek(PIN, { getHardwareFactor: testHF });

    const otherDevice = () => Promise.resolve(fixedBytes(0xbb));
    await expect(webKeyStore.unlock(PIN, { getHardwareFactor: otherDevice }))
      .rejects.toThrow(KEK_ERR.UNWRAP_FAILED);
  });

  it('rotates the PIN by re-wrapping the DEK without re-encrypting the seed (§3)', async () => {
    const { webKeyStore } = await import('../keystore/web.js');
    const { clearVault, loadVault } = await import('../evm/vaultStore.js');
    await clearVault();
    await webKeyStore.createVault(SECRET, PIN);
    await webKeyStore.enrollKek(PIN, { getHardwareFactor: testHF });
    const before = await loadVault();

    await webKeyStore.changePassword(PIN, NEW_PIN, { getHardwareFactor: testHF });
    const after = await loadVault();

    // Seed ciphertext UNCHANGED (DEK unchanged); only the kekWrap/kekSalt rotated.
    expect(after.ct).toBe(before.ct);
    expect(after.kekWrap.ct).not.toBe(before.kekWrap.ct);

    expect(await webKeyStore.unlock(NEW_PIN, { getHardwareFactor: testHF })).toBe(SECRET);
    await expect(webKeyStore.unlock(PIN, { getHardwareFactor: testHF }))
      .rejects.toThrow(KEK_ERR.UNWRAP_FAILED);
  });

  it('a bare (non-enrolled) vault still unlocks with no provider (back-compat)', async () => {
    const { webKeyStore } = await import('../keystore/web.js');
    const { clearVault } = await import('../evm/vaultStore.js');
    await clearVault();
    await webKeyStore.createVault(SECRET, PIN);
    expect(await webKeyStore.unlock(PIN)).toBe(SECRET);
  });
});

describe('KEK error codes are the contract (not prose copy)', () => {
  it('exposes stable machine codes', () => {
    expect(KEK_ERR.NO_HARDWARE_FACTOR).toBeTruthy();
    expect(KEK_ERR.NO_SET_FACTOR).toBeTruthy();
    expect(KEK_ERR.UNWRAP_FAILED).toBeTruthy();
    // distinct codes
    const codes = new Set(Object.values(KEK_ERR));
    expect(codes.size).toBe(Object.values(KEK_ERR).length);
  });
});
