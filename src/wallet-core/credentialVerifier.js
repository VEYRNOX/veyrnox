// src/wallet-core/credentialVerifier.js
//
// Per-session credential verifier for send-time step-up re-auth. Hashes the vault
// credential (PIN/password) at the SAME Argon2id cost as the vault unlock KDF, with a
// fresh random salt, so a captured verifier is no weaker than the vault itself. Pure:
// no session state, no unlock, no deniability machinery — verifyCredential can NEVER
// trigger panic/decoy (that is the load-bearing safety property of the feature).
//
// TESTNET-tier change; UNAUDITED-PROVISIONAL. No network, no signing.

import { argon2id } from 'hash-wasm';
import { KDF_PARAMS } from './vault.js';

const enc = new TextEncoder();

function randomSalt() {
  const s = new Uint8Array(16);
  crypto.getRandomValues(s);
  return s;
}

async function deriveRaw(credential, salt, params) {
  const raw = await argon2id({
    password: enc.encode(String(credential).normalize('NFKC')),
    salt,
    parallelism: params.parallelism,
    iterations: params.iterations,
    memorySize: params.memorySize,
    hashLength: params.hashLength,
    outputType: 'binary',
  });
  // DEFECT-A memory management (mirrors wallet-core/vault.js deriveKey). At unlock the
  // vault decrypt KDF and THIS verifier KDF run back-to-back; both allocate
  // KDF_PARAMS.memorySize (currently 64 MiB) in
  // hash-wasm. Yield to a macrotask so this derivation's WASM instance becomes
  // GC-eligible BEFORE the next sequential allocation — without it, that is the
  // exact two-concurrent-allocation pattern that caused the Defect-A RangeError in
  // onboarding. Keeps peak memory one-KDF-at-a-time. Negligible latency.
  await new Promise((resolve) => setTimeout(resolve, 0));
  return raw;
}

/**
 * Capture a verifier for `credential`. `params` defaults to the vault unlock
 * KDF_PARAMS — DO NOT pass a cheaper set in production (a reduced-cost hash of a short
 * PIN in memory would be more brute-forceable than the vault). `params` override exists
 * ONLY for fast unit tests.
 * @returns {Promise<{ salt: Uint8Array, hash: Uint8Array, params: object }>}
 */
export async function createCredentialVerifier(credential, { params = KDF_PARAMS } = {}) {
  const salt = randomSalt();
  const hash = await deriveRaw(credential, salt, params);
  return { salt, hash, params };
}

/**
 * Capture a verifier but NEVER throw — returns null on any failure (e.g. a low-memory
 * Argon2id OOM / Defect-A). LOAD-BEARING: the caller awaits this inside `unlock()` /
 * `createWallet` / `importWallet`; a throw here would abort an otherwise-successful
 * unlock and lock the user out of a valid wallet. A null verifier degrades safely — the
 * send path then fails closed (verifyCredential(null) === false) until a re-unlock.
 * `create` is injectable ONLY for tests (to force the failure path); production passes
 * nothing, so it uses createCredentialVerifier at the default vault KDF params.
 * @returns {Promise<{ salt: Uint8Array, hash: Uint8Array, params: object } | null>}
 */
export async function captureVerifierSafe(credential, { create = createCredentialVerifier, ...opts } = {}) {
  try {
    return await create(credential, opts);
  } catch {
    return null;
  }
}

/**
 * True iff `entered` reproduces `verifier.hash` (same salt + params). Constant-time
 * compare. Returns false (never throws) if the verifier is absent — fail closed.
 * @returns {Promise<boolean>}
 */
export async function verifyCredential(verifier, entered) {
  if (!verifier || !verifier.hash || !verifier.salt) return false;
  const params = verifier.params ?? KDF_PARAMS;
  // Fail closed (never throw) if params is structurally incomplete — honours the
  // "never throws" contract rather than passing undefined fields into argon2id.
  const wellFormed = [params.parallelism, params.iterations, params.memorySize, params.hashLength]
    .every((n) => Number.isInteger(n) && n > 0);
  if (!wellFormed) return false;
  const h = await deriveRaw(entered, verifier.salt, params);
  const match = constantTimeEqual(h, verifier.hash);
  h.fill(0); // best-effort zeroize the transient hash of the entered secret (mirrors vault.js zero())
  return match;
}

/**
 * H5: structured variant of verifyCredential that distinguishes an OOM-BRICKED session
 * (the per-session verifier is null/absent because captureVerifierSafe returned null at
 * unlock — Defect-A Argon2id OOM) from a plain wrong-credential. A bare `false` told the
 * user only THAT re-auth failed, never WHY; for a bricked verifier no entered credential
 * can ever satisfy it, so the honest remedy is to re-lock and unlock (re-capture the
 * verifier), not to keep retrying the password. Returns a machine-coded result:
 *   - verifier absent  -> { ok: false, bricked: true, reason: 'VERIFIER_OOM' }
 *   - correct match    -> { ok: true,  bricked: false }
 *   - wrong / malformed -> { ok: false, bricked: false }
 * @returns {Promise<{ ok: boolean, bricked: boolean, reason?: string }>}
 */
export async function verifyCredentialDetailed(verifier, entered) {
  if (!verifier || !verifier.hash || !verifier.salt) {
    return { ok: false, bricked: true, reason: 'VERIFIER_OOM' };
  }
  const ok = await verifyCredential(verifier, entered);
  return { ok, bricked: false };
}

/**
 * Constant-time byte-array equality: XOR-accumulate over the FULL length, no early
 * return on the first differing byte (avoids a timing side channel).
 */
export function constantTimeEqual(a, b) {
  // Length mismatch returns early (leaks only length, not content). For all real calls
  // both sides are hashLength (32) bytes, so lengths are structurally equal anyway.
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
