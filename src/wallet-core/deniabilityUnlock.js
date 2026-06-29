// wallet-core/deniabilityUnlock.js
//
// CONSTANT-KDF DENIABILITY RESOLUTION  (S3 — Direction-C).  PROVISIONAL.
// ⚠️ DENIABILITY-SECURITY CHANGE — FLAGGED FOR INDEPENDENT AUDIT VALIDATION. ⚠️
//
// CURRENT DENIABILITY MODEL (v2 — owner-approved 2026-06-22).
// This replaces the old Option-A no-oracle design. Key properties:
//
//   - Real 8-digit PIN    → REAL wallet (hidden; no UI tell it exists).
//   - Duress PIN          → DECOY wallet (the surrendered wallet).
//   - Face ID (if opted in, bound to duress PIN) → DECOY wallet, never the real one.
//   - Any OTHER wrong PIN → "Incorrect PIN" error (explicit, not a silent decoy).
//   - 10 consecutive wrong PINs → irreversible local panic wipe (pinAttemptGuard.js).
//   - Dedicated panic PIN → immediate wipe.
//
// The no-oracle property (a wrong guess was formerly indistinguishable from a duress
// hit because Option-A opened an empty deterministic decoy) was DELIBERATELY REMOVED
// in this owner-approved change. A wrong PIN now produces a real error. This IS an
// oracle in the classical sense — an attacker who can try PINs interactively can
// distinguish wrong from duress. The 10-attempt wipe (pinAttemptGuard.js) makes the
// wrong-PIN oracle non-fatal: the device self-destructs before an exhaustive search
// of the 8-digit PIN space completes. Deniability now rests on HIDING the real wallet
// behind the secret real PIN + the duress/Face-ID decoy path, NOT on the removed
// no-oracle trick.
//
// OFFLINE-SEIZURE GAP (not closed): an 8-digit PIN over Argon2id is offline-
// exhaustible on a seized device without a hardware key-encryption key (KEK). The
// 10-attempt counter lives in software and is bypassed by imaging the storage before
// the first attempt. Hardware KEK (Secure Enclave / StrongBox) is the planned fast-
// follow. This gap is OPEN, UNVERIFIED, and requires a real-device audit.
//
// WHY THIS MODULE EXISTS (SAST finding M2). Each deniability module (panic.js,
// duress.js, stealth.js) analyzed its OWN unlock timing in isolation and each
// was locally correct. But the COMBINED failed-unlock path in WalletProvider ran
// a VARIABLE number of Argon2id KDFs depending on which features were configured:
//
//     configured features      KDFs on a WRONG password (incl. primary miss)
//     ─────────────────────     ──────────────────────────────────────────────
//     none                      2  (primary + stealth)
//     duress only               3  (primary + duress + stealth)
//     panic only                3  (primary + panic  + stealth)
//     panic + duress            4  (primary + panic  + duress + stealth)
//
// Argon2id at 64 MiB / t=3 is ~100 ms+, well above scheduling/network noise, so
// an attacker holding the device and timing a few wrong guesses could infer HOW
// MANY deniability features are configured — i.e. THAT a duress / panic / hidden
// setup exists, which is exactly what those features must hide. A sharper case:
// a successful DURESS unlock short-circuited BEFORE the stealth attempt, doing one
// fewer KDF than a wrong guess with the same config — a distinguisher between a
// duress password and a random wrong one.
//
// THE FIX. Run a CONSTANT number of KDFs on EVERY post-primary-miss resolution,
// regardless of configuration, and with NO early-return short-circuit:
//
//   - PANIC slot   : if a panic PIN is configured, attempt it (1 KDF); if NOT,
//                    spend one DUMMY KDF on a throwaway chaff blob (1 KDF).
//   - DURESS slot  : same — real attempt if configured, else one dummy KDF.
//   - STEALTH slot : the chaff pool is always seeded (ensureStealthPool), so the
//                    secret's slot always holds a blob and the reveal attempt is
//                    always exactly 1 KDF (real or chaff — indistinguishable).
//
// => Exactly THREE KDFs here on every call, whatever the outcome. Combined with
// the single primary-unlock KDF, a wrong password (and a duress/hidden hit) costs
// a constant FOUR KDFs. We evaluate all three, THEN branch on the boolean results
// in the caller (panic > duress > hidden), so success and failure cost the same.
// NOTE: the wrong-PIN ERROR returned to the caller is a new signal in v2 (the
// no-oracle property was removed — see above). The constant KDF cost means timing
// adds NO additional signal on top of the explicit error; but the error itself IS
// the oracle now, mitigated by the 10-attempt wipe rather than by silence.
//
// RESIDUAL TIMING VARIANCE WE DO NOT (AND CANNOT FULLY) ELIMINATE — for audit:
// VULN-17 ACCEPTED RESIDUAL: the primary success path is ~1 KDF faster than any
// other outcome (wrong / duress / hidden / panic). This is intentional: equalizing
// would 4× every real unlock with no security gain (the timing only reveals "the
// primary password was correct" — inferable only by someone who already holds it).
// The residual does NOT leak deniability-feature count; every NON-primary outcome
// costs a constant 4 KDFs. A ~300 ms equalizer sleep on the primary-success path
// would close this gap at the cost of UX. Decision: accepted for v1, flagged as
// an explicit audit line-item. See docs/Security.roadmap.md.
//   - A CORRECT PRIMARY unlock returns after 1 KDF (it never enters this path),
//     so it is faster than any other outcome. This does NOT leak deniability-
//     feature presence/count — every NON-primary outcome (wrong / duress / hidden
//     / panic) is an identical 4-KDF cost — it only reveals "the typed secret was
//     the primary password", which is learnable only by someone who already holds
//     it (at which point deniability is moot). Equalizing this too would 4x every
//     legitimate unlock; we deliberately do not.
//   - NON-KDF work differs slightly per branch (an extra IndexedDB GET, the
//     AES-GCM tag check, mnemonic derivation on a hit). These are microseconds
//     against ~100 ms KDFs — below the measurement floor the KDF cost sets — but
//     are NOT provably zero. A timing-harness measurement under real noise is an
//     explicit audit item (the SAST pass did code-reading + KDF-cost reasoning,
//     not a bench).
//   - The dummy-KDF chaff blob carries the current at-rest KDF params; if those
//     params change (SAST M3), keep this blob in sync so the dummy cost still
//     matches a real attempt. The KDF COUNT (what the test asserts) is invariant
//     regardless.
//
// SELF-REVIEW CAVEAT. A self-authored timing fix to self-authored timing code is
// the precise blind spot the audit must own; see docs/Security.roadmap.md.
//
// TESTNET ONLY. This module performs no network/provider/signing work — it only
// spends KDFs and reads local vault-shaped blobs. It cannot move funds.

import { decryptVault, KDF_PARAMS } from './vault.js';
import { hasPanicVault, tryPanicUnlock } from './panic.js';
import { hasDuressVault, tryDuressUnlock } from './duress.js';
import { ensureStealthPool, tryRevealHidden } from './stealth.js';

function randomBytes(n) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

function b64(u8) {
  let s = '';
  for (const x of u8) s += String.fromCharCode(x);
  return btoa(s);
}

// A throwaway vault-shaped blob (random ct). Used ONLY to spend exactly one
// Argon2id KDF so an ABSENT deniability feature costs the same as a present one.
// decryptVault on it always fails (random ct -> GCM auth fail), which is exactly
// what we want: pure KDF cost, no real secret involved.
//
// The kdf field MUST carry the CURRENT params (imported from vault.js), not
// hardcoded ones: decryptVault derives with the blob's OWN recorded params
// (M3 migration), so a stale/hardcoded value here would make a padded/absent
// feature cost a KDF at the wrong work factor while a configured feature's real
// blob costs a KDF at the current KDF_PARAMS.memorySize —
// reintroducing exactly the timing tell M2 closed. Tracking KDF_PARAMS keeps the
// dummy cost equal to a real attempt as the at-rest params evolve.
function chaffBlob() {
  return {
    v: 1,
    kdf: { name: 'argon2id', ...KDF_PARAMS },
    salt: b64(randomBytes(16)),
    iv: b64(randomBytes(12)),
    ct: b64(randomBytes(48)),
  };
}

// Spend exactly one KDF and discard the result (it always throws). Used to pad an
// unconfigured feature so its branch costs the same as a configured one.
async function dummyKdf(password) {
  try {
    await decryptVault(chaffBlob(), password);
  } catch {
    /* always fails on a random-ct blob: this call exists purely for its KDF cost */
  }
}

// PANIC branch — always exactly 1 KDF. Accepts pre-fetched `configured` boolean
// so the caller can batch the DB reads before the KDF phase (VULN-13).
async function constantPanic(password, configured) {
  if (configured) return tryPanicUnlock(password); // 1 KDF (real)
  await dummyKdf(password);                        // 1 KDF (pad)
  return false;
}

// DURESS branch — always exactly 1 KDF. Same pre-fetched `configured` pattern.
async function constantDuress(password, configured) {
  if (configured) return tryDuressUnlock(password); // 1 KDF (real)
  await dummyKdf(password);                         // 1 KDF (pad)
  return null;
}

/**
 * Resolve the deniability/emergency paths for a password that FAILED the primary
 * unlock, doing a CONSTANT number of KDFs (exactly 3) regardless of which features
 * are configured and with NO early-return short-circuit. Returns the raw results;
 * the caller (WalletProvider.unlock) applies the priority order panic > duress >
 * hidden and re-throws the original primary error on a total miss.
 *
 * Never throws for a wrong password (each branch swallows its own miss). A total
 * miss now resolves to NOTHING (panic:false, both mnemonics null) — BOTH the PIN
 * and password cohorts fall through to the caller's throw path. The PIN cohort's
 * former Option-A deterministic-decoy slot (slot 4) was REMOVED in an owner-
 * approved threat-model change: a wrong PIN now ERRORS ("Incorrect PIN") instead
 * of silently opening an empty deterministic decoy. This INTENTIONALLY surrenders
 * the no-oracle deniability property at the prompt — but the constant-KDF cost is
 * preserved, so the error is the ONLY new signal, never an extra timing oracle.
 *
 * The legacy `opts` (deterministicFallback / deviceSalt) are ignored; the param is
 * retained so existing callers don't break and to keep the call shape stable.
 *
 * @param {string} password
 * @returns {Promise<{ panic: boolean, duressMnemonic: string|null, hiddenMnemonic: string|null }>}
 */
export async function resolveDeniabilityUnlock(password) {
  // Guarantee the stealth slot holds a blob so the reveal attempt is always one
  // KDF (idempotent, non-destructive, NO KDF of its own). Kept sequential to avoid
  // IndexedDB write-lock contention with the parallel reads below.
  await ensureStealthPool();

  // VULN-13: batch the two cheap IndexedDB existence checks in parallel BEFORE the
  // KDF phase starts. Each `has*` call is a quick IndexedDB GET (microseconds);
  // running them sequentially opened two separate DB connections one after the other.
  // Batching them into a single Promise.all eliminates one round-trip: the first
  // observable expensive operation on every code path is now the first Argon2id KDF.
  const [hasPanic, hasDuress] = await Promise.all([
    hasPanicVault().catch(() => false),
    hasDuressVault().catch(() => false),
  ]);

  // Slots 1-3: exactly three KDFs, evaluated unconditionally — no short-circuit.
  // This is the WHOLE resolution for BOTH cohorts now. A total miss returns all
  // empties and the caller throws (after one equalizer verifier-capture KDF), so a
  // wrong PIN errors with the SAME work-per-attempt as any enrolled hit — the
  // Option-A 4th deterministic-decoy slot was removed (owner-approved threat-model
  // change). No early return: panic/duress/hidden presence stays timing-opaque.
  const panic = await constantPanic(password, hasPanic);
  const duressMnemonic = await constantDuress(password, hasDuress);
  const hiddenMnemonic = await tryRevealHidden(password); // pool seeded => 1 KDF

  return { panic, duressMnemonic, hiddenMnemonic };
}
