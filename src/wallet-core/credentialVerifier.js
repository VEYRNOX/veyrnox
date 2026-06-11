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
  // vault decrypt KDF and THIS verifier KDF run back-to-back; both allocate ~192 MiB in
  // hash-wasm. Yield to a macrotask so this derivation's WASM instance becomes
  // GC-eligible BEFORE the next sequential 192 MiB allocation — without it, that is the
  // exact two-concurrent-192-MiB pattern that caused the Defect-A RangeError in
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
 * True iff `entered` reproduces `verifier.hash` (same salt + params). Constant-time
 * compare. Returns false (never throws) if the verifier is absent — fail closed.
 * @returns {Promise<boolean>}
 */
export async function verifyCredential(verifier, entered) {
  if (!verifier || !verifier.hash || !verifier.salt) return false;
  const h = await deriveRaw(entered, verifier.salt, verifier.params ?? KDF_PARAMS);
  return constantTimeEqual(h, verifier.hash);
}

/**
 * Constant-time byte-array equality: XOR-accumulate over the FULL length, no early
 * return on the first differing byte (avoids a timing side channel).
 */
export function constantTimeEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
