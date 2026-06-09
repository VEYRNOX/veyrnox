// wallet-core/decoyFallback.js
//
// OPTION A (kek-architecture-spec.md §7) — DETERMINISTIC DECOY-FROM-ANY-PIN.
// PROVISIONAL. ⚠️ FLAGGED FOR INDEPENDENT AUDIT VALIDATION. ⚠️
//
// In the PIN cohort, NO 6-digit PIN may produce an error state — a "wrong PIN"
// error is an oracle that reveals the entered PIN was not one of the enrolled set
// (so a real set exists elsewhere). Any PIN that does not resolve to the primary /
// duress / hidden / panic credential instead deterministically derives a fresh,
// empty-but-real BIP-39 wallet, opened as an ephemeral decoy session.
//
// ⚠️ TIMING (the load-bearing property — review item 1). This derivation MUST be
// memory-hard at the SAME cost as a real unlock attempt, NOT a cheap hash. The
// enrolled paths each run one Argon2id KDF (~0.4-1.7 s); a cheap-hash fallback
// would return near-instantly and that delta would distinguish "enrolled" from
// "garbage" straight off the clock — the exact oracle Option A exists to erase. So
// we run argon2id at the shared KDF_PARAMS, and deniabilityUnlock.js MUST invoke this
// as a 4th CONSTANT slot, UNCONDITIONALLY, so total-miss costs the same as any hit.
//
// Determinism is for PLAUSIBILITY, not secrecy: the same wrong PIN always opens the
// same empty wallet, so re-entry is consistent. The deviceSalt is a NON-SECRET,
// once-generated local value; a seized device exposes it, which is irrelevant — the
// derived wallets are genuinely empty (no funds to lose).
//
// TESTNET ONLY. No network/provider/signing — only a KDF + entropy->mnemonic.

import { argon2id } from 'hash-wasm';
import { KDF_PARAMS } from './vault.js';
import { mnemonicFromEntropy } from './mnemonic.js';

// Non-secret, per-device salt for the deterministic decoy. Stored once in
// localStorage so the same wrong PIN maps to the same empty wallet across attempts.
const SALT_KEY = 'veyrnox-pin-decoy-salt';
const enc = new TextEncoder();

function b64(u8) { let s = ''; for (const b of u8) s += String.fromCharCode(b); return btoa(s); }
function unb64(str) { const s = atob(str); const u8 = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i); return u8; }

/**
 * Return the device's stable, non-secret decoy salt (16 bytes), creating and
 * persisting it on first use. Best-effort on storage failure (returns a fresh
 * random salt so derivation still works, at the cost of cross-attempt stability).
 * @returns {Uint8Array}
 */
export function getOrCreateDeviceSalt() {
  try {
    const existing = localStorage.getItem(SALT_KEY);
    if (existing) return unb64(existing);
  } catch { /* storage unavailable; fall through to a fresh salt */ }
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  try { localStorage.setItem(SALT_KEY, b64(salt)); } catch { /* best-effort */ }
  return salt;
}

/** Clear the device decoy salt (used by fail-closed onboarding teardown). */
export function clearDeviceSalt() {
  try { localStorage.removeItem(SALT_KEY); } catch { /* best-effort */ }
}

/**
 * Deterministically derive an empty-but-real decoy mnemonic from a PIN. Runs ONE
 * Argon2id at the shared KDF_PARAMS (memory-hard — see header), then uses the first
 * 16 bytes of output as 128-bit BIP-39 entropy. Same (pin, deviceSalt) => same
 * mnemonic.
 * @param {string} pin
 * @param {Uint8Array} deviceSalt
 * @returns {Promise<string>} a valid 12-word BIP-39 mnemonic
 */
export async function deriveDeterministicDecoyMnemonic(pin, deviceSalt) {
  const raw = await argon2id({
    password: enc.encode(String(pin).normalize('NFKC')),
    salt: deviceSalt,
    parallelism: KDF_PARAMS.parallelism,
    iterations: KDF_PARAMS.iterations,
    memorySize: KDF_PARAMS.memorySize, // SAME memory-hardness as a real attempt
    hashLength: KDF_PARAMS.hashLength, // stays 32 so KDF output size matches a real unlock attempt (timing)
    outputType: 'binary',
  });
  const entropy = raw.slice(0, 16); // 128-bit => 12-word mnemonic
  return mnemonicFromEntropy(entropy);
}
