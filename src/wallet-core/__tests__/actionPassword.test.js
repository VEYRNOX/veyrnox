// Tests for the persistable Action-Password verifier record (the 2FA second factor).
import { describe, it, expect } from 'vitest';
import {
  serializeActionPasswordRecord,
  deserializeActionPasswordRecord,
  hasActionPasswordRecord,
  makeChaffActionPasswordRecord,
} from '../actionPassword.js';
import { createCredentialVerifier, verifyCredential } from '../credentialVerifier.js';
import { KDF_PARAMS } from '../vault.js';

// Cheap Argon2id params so the round-trip integration test is fast (the PRODUCTION
// verifier uses the full vault KDF_PARAMS — see createCredentialVerifier).
const CHEAP = { parallelism: 1, iterations: 1, memorySize: 64, hashLength: 32 };

describe('actionPassword record — persistable second-factor verifier', () => {
  it('serialises a live verifier into a JSON-safe record (base64 salt/hash + params)', () => {
    const verifier = {
      salt: new Uint8Array([1, 2, 3, 4]),
      hash: new Uint8Array([9, 8, 7, 6, 5]),
      params: { parallelism: 1, iterations: 3, memorySize: 196608, hashLength: 32 },
    };
    const rec = serializeActionPasswordRecord(verifier);
    expect(rec.v).toBe(1);
    expect(typeof rec.salt).toBe('string');
    expect(typeof rec.hash).toBe('string');
    expect(rec.params).toEqual(verifier.params);
    // JSON-safe: survives a stringify/parse cycle unchanged (this is the point).
    expect(JSON.parse(JSON.stringify(rec))).toEqual(rec);
  });

  it('round-trips: deserialize(serialize(v)) reproduces the exact salt/hash bytes + params', () => {
    const verifier = {
      salt: new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80]),
      hash: new Uint8Array(Array.from({ length: 32 }, (_, i) => (i * 7) % 256)),
      params: { parallelism: 1, iterations: 2, memorySize: 1024, hashLength: 32 },
    };
    const back = deserializeActionPasswordRecord(serializeActionPasswordRecord(verifier));
    expect(Array.from(back.salt)).toEqual(Array.from(verifier.salt));
    expect(Array.from(back.hash)).toEqual(Array.from(verifier.hash));
    expect(back.params).toEqual(verifier.params);
  });

  it('throws on a structurally malformed verifier (programming error at the call site)', () => {
    expect(() => serializeActionPasswordRecord(null)).toThrow();
    expect(() => serializeActionPasswordRecord({ salt: 'nope', hash: new Uint8Array(1), params: CHEAP })).toThrow();
    expect(() => serializeActionPasswordRecord({ salt: new Uint8Array(1), hash: new Uint8Array(1), params: { iterations: 0 } })).toThrow();
  });

  it('FAILS CLOSED: a malformed / absent / wrong-version record deserialises to null', () => {
    expect(deserializeActionPasswordRecord(null)).toBeNull();
    expect(deserializeActionPasswordRecord(undefined)).toBeNull();
    expect(deserializeActionPasswordRecord({})).toBeNull();
    expect(deserializeActionPasswordRecord({ v: 99, salt: 'a', hash: 'b', params: CHEAP })).toBeNull();
    expect(deserializeActionPasswordRecord({ v: 1, salt: 'a', hash: 'b', params: { iterations: 0, parallelism: 1, memorySize: 64, hashLength: 32 } })).toBeNull();
    expect(hasActionPasswordRecord(null)).toBe(false);
    expect(hasActionPasswordRecord({})).toBe(false);
  });

  it('hasActionPasswordRecord is true only for a well-formed record', () => {
    const rec = serializeActionPasswordRecord({ salt: new Uint8Array([1]), hash: new Uint8Array([2]), params: CHEAP });
    expect(hasActionPasswordRecord(rec)).toBe(true);
  });

  it('INTEGRATION: a real verifier stays valid through serialise → JSON → deserialise → verifyCredential', async () => {
    const password = 'correct horse battery staple';
    const verifier = await createCredentialVerifier(password, { params: CHEAP });

    // Persist + reload exactly as the keystore will (JSON in, JSON out).
    const stored = JSON.parse(JSON.stringify(serializeActionPasswordRecord(verifier)));
    const reloaded = deserializeActionPasswordRecord(stored);

    expect(await verifyCredential(reloaded, password)).toBe(true);        // right secret verifies
    expect(await verifyCredential(reloaded, 'wrong password')).toBe(false); // wrong secret rejected
  });

  // REGRESSION: callers MUST deserialize before verifying. WalletProvider.verifyActionPassword
  // passed the SERIALISED record (base64 salt/hash strings) straight to verifyCredential, whose
  // length/shape compare then failed for the CORRECT password too — silently locking any user
  // who set an Action Password out of every critical action. This pins the contract.
  it('a SERIALISED record must be deserialised before verifyCredential (else it fails closed)', async () => {
    const password = 'correct horse battery staple';
    const serialized = serializeActionPasswordRecord(await createCredentialVerifier(password, { params: CHEAP }));
    // The raw serialized record never verifies — not even with the right password (the bug).
    expect(await verifyCredential(serialized, password)).toBe(false);
    // Deserialised, the same record verifies the right password and rejects a wrong one (the fix).
    expect(await verifyCredential(deserializeActionPasswordRecord(serialized), password)).toBe(true);
    expect(await verifyCredential(deserializeActionPasswordRecord(serialized), 'nope')).toBe(false);
  });
});

// H2 (decoy/hidden 2FA parity): a deniability-safe DUMMY Action-Password record.
// To make a set that has NO Action Password byte-indistinguishable from one that
// does, every container carries a record — a real verifier OR this chaff. The chaff
// must (1) be shaped identically to a real record (same salt/hash byte-lengths, same
// live KDF params), (2) be unopenable (random hash → no password ever verifies), and
// (3) cost no Argon2id to make (pure RNG), so provisioning it leaks no timing.
describe('makeChaffActionPasswordRecord — deniability chaff record (H2)', () => {
  it('is shaped identically to a real record (same field lengths + live KDF params)', () => {
    const chaff = makeChaffActionPasswordRecord(KDF_PARAMS);
    expect(hasActionPasswordRecord(chaff)).toBe(true);          // round-trips like a real record
    const d = deserializeActionPasswordRecord(chaff);
    expect(d.salt.length).toBe(16);                             // == createCredentialVerifier's randomSalt()
    expect(d.hash.length).toBe(KDF_PARAMS.hashLength);          // == a real verifier's hash length
    expect(d.params).toEqual(KDF_PARAMS);                       // live params — no chaff-vs-real drift
  });

  it('requires well-formed params, so it can never silently drift from the live KDF', () => {
    expect(() => makeChaffActionPasswordRecord(undefined)).toThrow();
    expect(() => makeChaffActionPasswordRecord({ iterations: 0, parallelism: 1, memorySize: 64, hashLength: 32 })).toThrow();
  });

  it('is UNOPENABLE: no password verifies against it (random hash → always false)', async () => {
    // cheap params so verifyCredential's Argon2id derivations stay fast
    const chaff = deserializeActionPasswordRecord(makeChaffActionPasswordRecord(CHEAP));
    expect(await verifyCredential(chaff, 'not the password')).toBe(false);
    expect(await verifyCredential(chaff, 'any guess a coercer might try')).toBe(false);
  });

  it('is non-deterministic — distinct salt + hash each call (real randomness)', () => {
    const a = makeChaffActionPasswordRecord(KDF_PARAMS);
    const b = makeChaffActionPasswordRecord(KDF_PARAMS);
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });
});