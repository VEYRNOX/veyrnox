// src/wallet-core/actionPassword.js
//
// Persistable form of an Action-Password verifier — the SECOND factor that, with
// the PIN, guards critical actions (see lib/twoFactorGate.js). The verifier itself
// is produced by credentialVerifier.js (createCredentialVerifier): an Argon2id hash
// of the Action Password at the FULL vault KDF cost, shaped
//   { salt: Uint8Array, hash: Uint8Array, params }.
// Its typed arrays don't survive JSON, so to live in per-set storage they are
// base64-encoded here (the SAME encoding vault.js uses for its blob).
//
// WHAT THIS IS / ISN'T (no fake security):
//   - The record is a ONE-WAY hash at full vault cost. It is NOT the Action
//     Password and reveals nothing about it; storing it is no weaker than storing
//     the vault ciphertext blob, which is also persisted.
//   - It is per-SET data. Deniability (I3) requires each set (real/duress/decoy)
//     to carry its own (or be chaffed uniformly) so the record's PRESENCE is not a
//     tell — that wiring lives in the keystore layer (phase 2b), not here.
//
// FAIL CLOSED (I4): a malformed / absent record deserialises to null, so a caller
// that feeds it to verifyCredential(null, …) gets false — the critical action is
// blocked rather than waved through.
//
// Pure: no crypto, no I/O, no React. UNAUDITED-PROVISIONAL.

const RECORD_VERSION = 1;

// base64 (browser-safe, no Buffer) — mirrors vault.js so the on-disk encoding is
// identical across the two persisted artefacts.
function b64(u8) {
  let s = '';
  for (const b of u8) s += String.fromCharCode(b);
  return btoa(s);
}
function unb64(str) {
  const s = atob(str);
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}

function wellFormedParams(p) {
  return !!p && [p.parallelism, p.iterations, p.memorySize, p.hashLength].every((n) => Number.isInteger(n) && n > 0);
}

/**
 * Encode a live verifier ({salt,hash,params}) into a JSON-safe, persistable record.
 * Throws on a structurally malformed verifier (a programming error — the caller just
 * produced it via createCredentialVerifier).
 * @returns {{ v: number, salt: string, hash: string, params: object }}
 */
export function serializeActionPasswordRecord(verifier) {
  if (
    !verifier ||
    !(verifier.salt instanceof Uint8Array) ||
    !(verifier.hash instanceof Uint8Array) ||
    !wellFormedParams(verifier.params)
  ) {
    throw new Error('serializeActionPasswordRecord: malformed verifier');
  }
  const { parallelism, iterations, memorySize, hashLength } = verifier.params;
  return {
    v: RECORD_VERSION,
    salt: b64(verifier.salt),
    hash: b64(verifier.hash),
    params: { parallelism, iterations, memorySize, hashLength },
  };
}

/**
 * Decode a stored record back into the verifier shape verifyCredential() consumes.
 * Returns null (NEVER throws) for an absent / wrong-version / malformed record —
 * fail closed: a null verifier makes verifyCredential return false.
 * @returns {{ salt: Uint8Array, hash: Uint8Array, params: object } | null}
 */
export function deserializeActionPasswordRecord(record) {
  if (
    !record ||
    record.v !== RECORD_VERSION ||
    typeof record.salt !== 'string' ||
    typeof record.hash !== 'string' ||
    !wellFormedParams(record.params)
  ) {
    return null;
  }
  const { parallelism, iterations, memorySize, hashLength } = record.params;
  return {
    salt: unb64(record.salt),
    hash: unb64(record.hash),
    params: { parallelism, iterations, memorySize, hashLength },
  };
}

/**
 * Whether a stored record represents a usable Action Password for the active set —
 * the `actionPasswordConfigured` input to evaluateTwoFactor(). True iff it round-trips.
 * @returns {boolean}
 */
export function hasActionPasswordRecord(record) {
  return deserializeActionPasswordRecord(record) !== null;
}

/**
 * H2 (decoy/hidden 2FA parity) — a deniability-safe CHAFF record.
 *
 * To make a set with NO Action Password byte-indistinguishable from one that has
 * it, every container carries a record: a real verifier OR this chaff. The chaff is
 * shaped identically to a real serialized verifier (16-byte salt + `params.hashLength`
 * hash, same live KDF params as createCredentialVerifier), so `serializeContainer`'s
 * length is Action-Password-presence-independent across all sets.
 *
 * It is UNOPENABLE: the hash is random bytes, so no entered secret can ever reproduce
 * it (verifyCredential always returns false). And it costs NO Argon2id — pure RNG —
 * so provisioning chaff leaks no timing (mirrors stealth.js makeChaff / chaffBlob).
 *
 * `params` MUST be passed (the caller injects the live KDF_PARAMS) so the chaff can
 * never silently drift from the real records' params and become a tell.
 *
 * @param {{parallelism:number, iterations:number, memorySize:number, hashLength:number}} params
 * @returns {{ v:number, salt:string, hash:string, params:object }}
 */
export function makeChaffActionPasswordRecord(params) {
  if (!wellFormedParams(params)) {
    throw new Error('makeChaffActionPasswordRecord: well-formed KDF params are required');
  }
  const { parallelism, iterations, memorySize, hashLength } = params;
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const hash = new Uint8Array(hashLength);
  crypto.getRandomValues(hash);
  return {
    v: RECORD_VERSION,
    salt: b64(salt),
    hash: b64(hash),
    params: { parallelism, iterations, memorySize, hashLength },
  };
}
