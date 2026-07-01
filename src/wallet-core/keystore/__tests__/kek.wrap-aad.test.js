// kek.wrap-aad.test.js — L7 (ECC Hardware KEK audit): versioned GCM AAD on the DEK wrap.
//
// wrapDek/unwrapDek bind AES-GCM. Before L7 they authenticated only the ciphertext, so
// the wrap's own format `version` was malleable (not folded into the GCM tag). L7 adds
// OPTIONAL defence-in-depth: NEW wraps are v2 and bind the format version (the only
// self-contained metadata available at this layer — callers pass no kekSalt) as GCM AAD.
//
// HARD BACKWARD-COMPAT CONSTRAINT: real devices already hold v1 wraps written WITHOUT
// AAD. These MUST keep unwrapping unchanged. These tests pin:
//   (a) a legacy v1 blob still unwraps (no AAD) after the change,
//   (b) a fresh wrap is v2 and round-trips,
//   (c) a v2 blob with a tampered version byte fails closed (KEK_ERR.UNWRAP_FAILED),
//       proving the version is now authenticated into the tag.
//
// Codes are the contract (KEK_ERR.UNWRAP_FAILED), not prose.

import { describe, it, expect } from 'vitest';
import { wrapDek, unwrapDek, randomDek, KEK_ERR } from '../kek.js';

// A deterministic 32-byte KEK stand-in (combineKek output shape). We test wrap/unwrap in
// isolation from the combine, so any 32-byte key is a valid KEK for AES-256-GCM import.
function kek32(fill = 7) {
  return new Uint8Array(32).fill(fill);
}

// Build a LEGACY v1 blob the exact way pre-L7 wrapDek did: AES-GCM with NO additionalData.
// This reproduces a blob already persisted on a real device before the format bump.
async function makeLegacyV1(kek, dek) {
  const key = await crypto.subtle.importKey('raw', kek, { name: 'AES-GCM' }, false, ['encrypt']);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const ctBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, dek);
  const b64 = (u8) => { let s = ''; for (const b of u8) s += String.fromCharCode(b); return btoa(s); };
  return { v: 1, iv: b64(iv), ct: b64(new Uint8Array(ctBuf)) };
}

describe('L7 — DEK wrap versioned GCM AAD (backward-compatible)', () => {
  it('(a) legacy v1 blobs (written WITHOUT AAD) still unwrap unchanged', async () => {
    const kek = kek32(0x11);
    const dek = randomDek();
    const legacy = await makeLegacyV1(kek, dek);
    expect(legacy.v).toBe(1);

    const recovered = await unwrapDek(kek, legacy);
    expect(recovered).toEqual(dek);
  });

  it('(b) a fresh wrap is v2 and round-trips through unwrapDek', async () => {
    const kek = kek32(0x22);
    const dek = randomDek();

    const wrapped = await wrapDek(kek, dek);
    expect(wrapped.v).toBe(2); // format bump: new wraps bind AAD

    const recovered = await unwrapDek(kek, wrapped);
    expect(recovered).toEqual(dek);
  });

  it('(c) a v2 blob with a tampered version fails closed (version is authenticated)', async () => {
    const kek = kek32(0x33);
    const dek = randomDek();
    const wrapped = await wrapDek(kek, dek);

    // Flip the declared version to 1 without re-encrypting: because v2 folds the version
    // into the GCM AAD, unwrap MUST fail (the tag no longer verifies) rather than silently
    // treat the ciphertext as an unauthenticated-AAD v1 blob.
    const tampered = { ...wrapped, v: 1 };
    await expect(unwrapDek(kek, tampered)).rejects.toThrow(KEK_ERR.UNWRAP_FAILED);
  });

  it('(c2) a v2 blob unwrapped with the wrong KEK fails closed (generic code)', async () => {
    const dek = randomDek();
    const wrapped = await wrapDek(kek32(0x44), dek);
    await expect(unwrapDek(kek32(0x55), wrapped)).rejects.toThrow(KEK_ERR.UNWRAP_FAILED);
  });

  it('rejects an unknown/future version fail-closed', async () => {
    const kek = kek32(0x66);
    const dek = randomDek();
    const wrapped = await wrapDek(kek, dek);
    const future = { ...wrapped, v: 99 };
    await expect(unwrapDek(kek, future)).rejects.toThrow(KEK_ERR.UNWRAP_FAILED);
  });
});
