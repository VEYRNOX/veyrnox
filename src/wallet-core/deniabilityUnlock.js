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
// Argon2id at any profile this app has shipped (v0 64 MiB/t=3, v1 192 MiB/t=3,
// v2 96 MiB/t=6 since 2026-08-24 — always read KDF_PARAMS, never a figure quoted
// in a comment, L-13) is ~100 ms+, well above scheduling/network noise, so
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
// H-1 (formerly VULN-17 ACCEPTED RESIDUAL, NOW CLOSED STRUCTURALLY): the primary
// success path used to return several KDFs faster than any other outcome (wrong / duress /
// hidden / panic each run resolveDeniabilityUnlock, plus the shared unlock + verifier
// KDFs). The old mitigation was a hand-tuned PRIMARY_UNLOCK_EQUALIZER_MS sleep in
// WalletProvider.jsx, which (a) only covered ~1.4 of the deficit — leaving the fast path
// measurably faster (the H-1 oracle) — and (b) was a magic constant that drifted whenever
// KDF_PARAMS changed. It is REPLACED by spendPrimaryUnlockEqualizerKdfs (below): the
// primary-success path now runs the SAME resolveDeniabilityUnlock the failure path runs
// (result discarded), so every outcome costs an identical prompt-visible unlock(1) +
// resolver(3) path. Timing is EQUAL by construction — it no longer reveals even "the
// primary password was correct". The step-up verifier capture now runs after the session
// mounts, off the visible unlock path. See unlockTimingEqualizer.h1.test.jsx.
//   - [P1] PARAM-PROFILE (not just count) is now equal too. An earlier count-only
//     equalizer (3 dummyKdf at the CURRENT KDF_PARAMS) left an INSTALLED-BASE oracle: a
//     vault whose deniability blob(s) were written under an OLDER profile and not
//     yet migrated decrypts those real slots at THAT profile's cost on a miss/duress-hit
//     (decryptVault uses each blob's OWN recorded params — M3), while the success padding
//     spent the CURRENT KDF_PARAMS — so success was measurably out of step (an
//     opposite-direction oracle) for
//     exactly the users with deniability configured. Running the real resolver on success
//     spends the same blobs at the same recorded params, so the full memorySize MULTISET
//     matches across outcomes for fresh, current-param, AND legacy-param vaults. See
//     unlockTimingLegacyParams.p1.test.jsx.
//   - NON-KDF work differs slightly per branch (an extra IndexedDB GET, the
//     AES-GCM tag check, mnemonic derivation on a hit). These are microseconds
//     against ~100 ms KDFs — below the measurement floor the KDF cost sets — but
//     are NOT provably zero. A timing-harness measurement under real noise is an
//     explicit audit item (the SAST pass did code-reading + KDF-cost reasoning,
//     not a bench).
//   - The resolver's own dummy-KDF chaff blob (constantPanic/constantDuress pads) carries
//     the profile THIS DEVICE's deniability blobs are recorded under
//     (deniabilityKdfProfile), so an ABSENT feature's pad costs what a real attempt on
//     this device costs. It used to carry the CURRENT at-rest params with a note saying
//     to keep it in sync as those evolve — which read as satisfied precisely because it
//     named a figure, while the v2 profile change (2026-08-24) had already made the pad
//     ~2× cheap on every installed-base device (H-2 / L-13, weekly audit 2026-08-25).
//     Do not put a number back in this comment. The KDF COUNT and
//     — because success reuses the resolver verbatim — the PARAM PROFILE are invariant
//     across outcomes regardless.
//
// SELF-REVIEW CAVEAT. A self-authored timing fix to self-authored timing code is
// the precise blind spot the audit must own; see docs/Security.roadmap.md.
//
// TESTNET ONLY. This module performs no network/provider/signing work — it only
// spends KDFs and reads local vault-shaped blobs. It cannot move funds.

import { decryptVault } from './vault.js';
import { deniabilityKdfProfile } from './deniabilityKdfProfile.js';
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
// The kdf field MUST carry the params THIS DEVICE's real deniability blobs are
// recorded under, not hardcoded ones and not the current at-rest default:
// decryptVault derives with the blob's OWN recorded params (M3 migration), so a
// mismatched value here makes a padded/absent feature cost a KDF at the wrong work
// factor while a configured feature's real blob costs a KDF at its recorded
// memorySize — reintroducing exactly the timing tell M2 closed.
//
// H-2 (2026-08-25): tracking KDF_PARAMS was itself the mismatch on an installed-
// base device. Persisted blobs are frozen at write time, so after the v2 profile
// change (96 MiB/t=6, migration flag off) a v1 device's real slots decrypt at
// 192 MiB while the pad spent 96 — roughly 2× off, in the ABSENT direction.
// The caller resolves the profile once (deniabilityKdfProfile) and passes it in.
function chaffBlob(kdfProfile) {
  return {
    v: 1,
    kdf: { name: 'argon2id', ...kdfProfile },
    salt: b64(randomBytes(16)),
    iv: b64(randomBytes(12)),
    ct: b64(randomBytes(48)),
  };
}

// Spend exactly one KDF and discard the result (it always throws). Used to pad an
// unconfigured feature so its branch costs the same as a configured one.
async function dummyKdf(password, kdfProfile) {
  try {
    await decryptVault(chaffBlob(kdfProfile), password);
  } catch {
    /* always fails on a random-ct blob: this call exists purely for its KDF cost */
  }
}

// PANIC branch — always exactly 1 KDF. Accepts pre-fetched `configured` boolean
// so the caller can batch the DB reads before the KDF phase (VULN-13), and the
// pre-fetched device KDF profile so the pad matches a real attempt (H-2).
async function constantPanic(password, configured, kdfProfile) {
  if (configured) return tryPanicUnlock(password);  // 1 KDF (real)
  await dummyKdf(password, kdfProfile);             // 1 KDF (pad)
  return false;
}

// DURESS branch — always exactly 1 KDF. Same pre-fetched `configured` pattern.
async function constantDuress(password, configured, kdfProfile) {
  if (configured) return tryDuressUnlock(password);  // 1 KDF (real)
  await dummyKdf(password, kdfProfile);              // 1 KDF (pad)
  return null;
}

// H-1 PRIMARY-SUCCESS COST EQUALIZER (supersedes the old PRIMARY_UNLOCK_EQUALIZER_MS
// magic sleep). A CORRECT primary unlock short-circuits BEFORE resolveDeniabilityUnlock,
// so it would spend FEWER Argon2id KDFs than any failure/duress/hidden outcome (which
// all run resolveDeniabilityUnlock). The old fix padded that deficit with a wall-clock
// setTimeout tuned by hand against KDF_PARAMS — a magic number that drifted every time
// the params changed (the VU-06 / 192-vs-64 MiB regression history) and, worse, only
// covered ~1.4 of the deficit, leaving the primary-success path measurably FASTER than a
// miss (the H-1 timing oracle).
//
// FIRST STRUCTURAL FIX (count parity): spend 3 throwaway `dummyKdf` calls so the KDF
// COUNT matches the resolver. That closed the count gap but NOT the [P1] param-profile
// gap: `dummyKdf` derived via chaffBlob() at whatever KDF_PARAMS was current, while the
// real duress/panic/hidden slots decrypt each stored blob at that blob's OWN recorded
// params (M3 migration — decryptVault uses paramsFromVault). For an installed-base vault
// whose deniability blob(s) were written under an older profile and not yet
// migrated, a miss/duress-hit spends a cheaper real slot while the success padding
// spent a costlier dummy — so primary-success was measurably SLOWER, an opposite-direction
// oracle for exactly the users who have deniability configured. (Concretely, in the era
// this fix was written: 64 MiB legacy slots against 192 MiB dummies.) Count equal,
// wall-clock NOT (see unlockTimingLegacyParams.p1.test.jsx).
//
// [P1] STRUCTURAL FIX (param-profile parity): run the SAME resolveDeniabilityUnlock the
// failure path runs and DISCARD the result. This spends EXACTLY the KDF work the failure
// path spends for THIS vault — same blobs, same recorded params whatever era they are
// from, same dummies at this device's recorded profile — so the memorySize MULTISET is identical
// across every outcome and wall-clock parity holds for fresh, current-param, AND
// legacy-param vaults. It also stays coupled to the failure path BY CONSTRUCTION (it is
// literally the same function), so count/profile can never silently drift apart again.
//
// SIDE-EFFECT-FREE (deniability-critical). resolveDeniabilityUnlock is a PURE RESOLVER:
// it only seeds the chaff pool (idempotent, non-destructive), reads existence flags, and
// attempts decrypts — it NEVER wipes and NEVER mounts a decoy/hidden session. The wipe
// and the decoy/hidden routing are done by the CALLER (WalletProvider.unlock) based on
// the RETURN value. Here on the primary-success path we already hold the correct primary
// secret and we THROW THE RETURN AWAY, so even the degenerate case where `password` also
// matched a duress/panic/hidden slot cannot cause a wipe or decoy mount — nothing acts on
// the discarded { panic, duressMnemonic, hiddenMnemonic }. The caller additionally wraps
// this call in try/catch so a throw here can never fall into its `catch (primaryErr)` and
// divert a confirmed unlock into the decoy (I4). ACCEPTED COST: this reads the deniability
// storage (an extra IndexedDB GET / decrypt attempt) on every successful unlock — the
// price of provable per-vault wall-clock parity.
export async function spendPrimaryUnlockEqualizerKdfs(password) {
  // Run the failure path's exact KDF work and discard the result. Same function ⇒ same
  // KDF count AND same param profile as a miss/duress-hit, by construction.
  await resolveDeniabilityUnlock(password);
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
  // H-2: resolve this device's recorded KDF era in the SAME pre-KDF batch, so the
  // pads below cost what a real attempt on this device costs. Read UNCONDITIONALLY
  // (even when both features are configured and no pad will be spent) — a
  // conditional read would be a new, if tiny, IO-shaped signal on exactly the axis
  // this module exists to flatten. It is one IndexedDB get against three Argon2id
  // derivations.
  const [hasPanic, hasDuress, kdfProfile] = await Promise.all([
    hasPanicVault().catch(() => false),
    hasDuressVault().catch(() => false),
    deniabilityKdfProfile(),
  ]);

  // Slots 1-3: exactly three KDFs, evaluated unconditionally — no short-circuit.
  // This is the WHOLE resolution for BOTH cohorts now. A total miss returns all
  // empties and the caller throws (after one equalizer verifier-capture KDF), so a
  // wrong PIN errors with the SAME work-per-attempt as any enrolled hit — the
  // Option-A 4th deterministic-decoy slot was removed (owner-approved threat-model
  // change). No early return: panic/duress/hidden presence stays timing-opaque.
  const panic = await constantPanic(password, hasPanic, kdfProfile);
  const duressMnemonic = await constantDuress(password, hasDuress, kdfProfile);
  const hiddenMnemonic = await tryRevealHidden(password); // pool seeded => 1 KDF

  return { panic, duressMnemonic, hiddenMnemonic };
}
