// Audit 2026-09-21 H1 — a kek-dek blob enrolled under an earlier Argon2id
// profile must still unwrap: unwrapDekWithProfiles walks KEK_C_PROFILES for an
// unstamped blob and uses exactly the stamped profile otherwise. Wrong PIN on
// every profile stays the generic KEK_ERR.UNWRAP_FAILED (no oracle).
//
// deriveC is injected so the test never runs real Argon2id (96/192/64 MiB).

import { describe, it, expect } from 'vitest';
import { combineKek, wrapDek, randomDek, KEK_ERR } from '../kek.js';
import { unwrapDekWithProfiles, kekKdfStamp, KEK_C_PROFILES } from '../kekProfiles.js';
import { KDF_PARAMS } from '../../vault.js';

const H_FIXED = new Uint8Array(32).fill(7);

// Deterministic fake C: depends on password + profile, never on the salt, so the
// test can wrap under one profile and assert which profile unwraps it.
async function fakeDeriveC(password, _salt, params) {
  const out = new Uint8Array(32);
  const seed = `${password}|${params.memorySize}|${params.iterations}`;
  for (let i = 0; i < 32; i++) out[i] = (seed.charCodeAt(i % seed.length) * (i + 1)) & 0xff;
  if (out.every((b) => b === 0)) out[0] = 1;
  return out;
}

async function wrapUnder(password, profile) {
  const dek = randomDek();
  const C = await fakeDeriveC(password, null, profile);
  const kek = await combineKek(H_FIXED.slice(), C);
  const kekWrap = await wrapDek(kek, dek);
  return { dek: Array.from(dek), kekWrap };
}

const CURRENT = KEK_C_PROFILES[0];
const LEGACY_192 = KEK_C_PROFILES[1];
const LEGACY_64 = KEK_C_PROFILES[2];
const SALT = new Uint8Array(32);

describe('KEK_C_PROFILES[0] tracks vault.js KDF_PARAMS', () => {
  it('the stamp equals the live vault profile', () => {
    const { parallelism, iterations, memorySize, hashLength } = KDF_PARAMS;
    expect(kekKdfStamp()).toEqual({ parallelism, iterations, memorySize, hashLength });
  });
});

describe('unwrapDekWithProfiles — legacy KEK C profiles', () => {
  it('unstamped blob wrapped under the 192 MiB profile unwraps via fallback', async () => {
    const { dek, kekWrap } = await wrapUnder('1234', LEGACY_192);
    const res = await unwrapDekWithProfiles({ H: H_FIXED.slice(), password: '1234', saltBytes: SALT, blob: { kekWrap }, deriveC: fakeDeriveC });
    expect(Array.from(res.dek)).toEqual(dek);
    expect(res.usedFallback).toBe(true);
    expect(res.profile).toEqual(LEGACY_192);
  });

  it('unstamped blob wrapped under the 64 MiB profile unwraps via fallback', async () => {
    const { dek, kekWrap } = await wrapUnder('1234', LEGACY_64);
    const res = await unwrapDekWithProfiles({ H: H_FIXED.slice(), password: '1234', saltBytes: SALT, blob: { kekWrap }, deriveC: fakeDeriveC });
    expect(Array.from(res.dek)).toEqual(dek);
    expect(res.profile).toEqual(LEGACY_64);
  });

  it('unstamped blob under the current profile is not a fallback', async () => {
    const { dek, kekWrap } = await wrapUnder('1234', CURRENT);
    const res = await unwrapDekWithProfiles({ H: H_FIXED.slice(), password: '1234', saltBytes: SALT, blob: { kekWrap }, deriveC: fakeDeriveC });
    expect(Array.from(res.dek)).toEqual(dek);
    expect(res.usedFallback).toBe(false);
  });

  it('stamped blob tries only its stamped profile', async () => {
    const { kekWrap } = await wrapUnder('1234', LEGACY_192);
    const tried = [];
    const spy = async (pw, salt, params) => { tried.push(params.memorySize); return fakeDeriveC(pw, salt, params); };
    // Stamp says current, but the wrap is legacy: must fail without walking the list.
    await expect(unwrapDekWithProfiles({ H: H_FIXED.slice(), password: '1234', saltBytes: SALT, blob: { kekWrap, kekKdf: kekKdfStamp() }, deriveC: spy }))
      .rejects.toThrow(KEK_ERR.UNWRAP_FAILED);
    expect(tried).toEqual([CURRENT.memorySize]);
  });

  it('wrong PIN fails generically after every profile, and zeroes H', async () => {
    const { kekWrap } = await wrapUnder('1234', LEGACY_192);
    const H = H_FIXED.slice();
    await expect(unwrapDekWithProfiles({ H, password: '9999', saltBytes: SALT, blob: { kekWrap }, deriveC: fakeDeriveC }))
      .rejects.toThrow(KEK_ERR.UNWRAP_FAILED);
    expect(H.every((b) => b === 0)).toBe(true);
  });

  it('a stamp outside the shipped profiles is rejected before any derivation', async () => {
    const { kekWrap } = await wrapUnder('1234', CURRENT);
    const tried = [];
    const spy = async (pw, salt, params) => { tried.push(params); return fakeDeriveC(pw, salt, params); };
    await expect(unwrapDekWithProfiles({
      H: H_FIXED.slice(), password: '1234', saltBytes: SALT,
      blob: { kekWrap, kekKdf: { parallelism: 1, iterations: 1, memorySize: 1 << 30, hashLength: 32 } }, deriveC: spy,
    })).rejects.toThrow(/out of range/);
    expect(tried).toEqual([]);
  });
});
