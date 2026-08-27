# KEK fast-path design — unlock latency on low-RAM Android

Status: **DRAFT — pre-audit, pre-owner-approval, non-implemented.**
Owner action required before any code lands. No user-facing status changes from this doc.

> **2026-08-25 implementation update.** The DEK-cache primitives and wiring
> described below landed (`android-1.0.1-perf-suite-2026-08-25`, PRs #2039–#2106;
> see `docs/Feature-Status.md`'s 2026-08-25 entry). The UI entry point (PinUnlock
> button) is currently **hidden** (#2106 — duplicated the pre-existing biometric
> button and errored on a cache-miss), so the fast-path is not exercised in
> production today. The measured Samsung Note 20 cold-unlock improvement this
> session (~7.6 s → ~3.8 s) came from the double-prompt collapse (#2039) and the
> perf trio (#2043–#2045), **not** from this doc's proposed 200 ms–1 s cache path
> — that number remains unverified on-device pending the button's return. This
> doc's "10–30 s" problem statement and "200 ms – 1 s" target below are the
> pre-implementation design figures; do not read them as the shipped result.

Related: [kek-architecture-spec.md](./kek-architecture-spec.md),
[hardware-kek-phase-plan.md](./hardware-kek-phase-plan.md),
[cloud-recovery-shard-spec.md](./cloud-recovery-shard-spec.md) §4.1
(the `dekCache.js` primitive already merged for Personal Backup).

## Problem

Unlock on older Android devices takes 10–30 s. Root cause: 5 sequential
Argon2id(192 MiB, t=3) derivations per unlock — measured on device, matches
the report exactly.

Breakdown (verified via `veyrnox-recon`, [WalletProvider.jsx:1700-2035](../src/lib/WalletProvider.jsx)):

1. Primary `keyStore.unlock()` — 1 KDF, or `deriveKekC` on KEK-enrolled vaults
   ([vault.js:635-648](../src/wallet-core/vault.js))
2. `spendPrimaryUnlockEqualizerKdfs(password)` → `resolveDeniabilityUnlock` →
   3 KDFs (`constantPanic`, `constantDuress`, `tryRevealHidden`),
   [deniabilityUnlock.js:265-267](../src/wallet-core/deniabilityUnlock.js).
   All sequential by design (H-1 timing-equalizer).
3. `captureVerifierSafe` — 1 KDF for the send-time step-up verifier,
   [credentialVerifier.js:60-64](../src/wallet-core/credentialVerifier.js)

Hardware KEK enrollment **does not shortcut any of them.** The PIN-derived C
factor still runs full Argon2id every unlock. KEK is pure addition today.

## Prior attempts (constraint boundary)

- **PR #1989** — three tricks: skip native success-path equalizer, move KEK C
  to worker path, 30 s plaintext relock cache. Broke KEK on native (HERO
  reboot loop).
- **PR #2004** — reverted #1989 items 1 and 3. Added
  `unlockTimingEqualizer.h1.native.test.jsx` as a regression pin: native must
  spend the same KDF profile as web, forever. The equalizer skip and the
  plaintext cache are now both closed off by explicit tests.

Any new speedup must land **without** re-introducing either.

## Proposal — hardware-gated DEK cache slot

Add a **second Keystore slot** holding `wrapDekForCache(kek_fp, dek)`, where
`kek_fp = HKDF-SHA256(ikm=H, salt=fixed, info="veyrnox/kek/fastpath/v1")`.

Steady-state unlock becomes:

1. `keyStore.getHardwareFactor()` → `H` (biometric prompt, Keychain/StrongBox
   round-trip, ~50–500 ms)
2. `HKDF(H) → kek_fp` (~µs)
3. `unwrapDekFromCache(kek_fp, cacheBlob)` → DEK (~µs)
4. AES-GCM open container with DEK (~ms)

**Total: 200 ms – 1 s vs. current 10–30 s.**

Cold-path / cache-miss / new-device / post-restore: fall back to the current
full Argon2id path unchanged. No behavioural change on those paths.

### What runs when

| Path | KDFs | Notes |
|---|---|---|
| First unlock on device, or after cache invalidation | 5 (unchanged) | Fills cache slot on success |
| Steady-state unlock, cache present | **0** | Hardware H only |
| PIN change / vault re-key | 5 (unchanged) | Rewrites cache slot |
| Duress PIN entered | 5 (unchanged) | Cache slot bound to PRIMARY DEK only — see §Security |
| Panic PIN entered | 5 (unchanged) | Same |
| Wrong PIN | 5 (unchanged) | Never touches cache slot |

The equalizer property (all outcomes cost the same KDF profile) is preserved
on every path that runs Argon2id at all. The fast path runs zero Argon2id
regardless of which secret would have been entered — so no timing distinction
between correct-PIN, wrong-PIN, duress, or panic exists there either (they
never reach it).

## Security model change (honest)

**This deliberately weakens the "PIN required to unlock" property in exchange
for latency.** State it plainly:

Today:
- Attacker with unlocked device + no PIN: cannot unlock (Argon2id gates
  everything).
- Attacker with vault image only: cannot unlock (H missing).
- Attacker with vault image + coerced PIN: cannot unlock (H missing). ✓
- Attacker with device + Face ID coercion: can trigger H, still needs PIN. ✓

Proposed fast-path:
- Attacker with device + Face ID coercion: **unlocks in ~1 s, no PIN
  required**. ✗ new gap
- Attacker with vault image only: cannot unlock (H missing). ✓ unchanged
- Attacker with vault image + coerced PIN: cannot unlock (H missing). ✓ unchanged
- Attacker with unlocked device + no PIN + no biometric: cannot unlock (H
  gated by biometric). ✓ unchanged

The gap is the **coerced-biometric** path. This is the same model iCloud
Keychain, Signal PIN-less unlock, and 1Password's biometric unlock ship.
It is **strictly weaker** than what Veyrnox ships today. Owner must
consent to that tradeoff before this lands.

### Deniability impact (I3)

**The cache slot holds only the PRIMARY DEK.** A duress/panic PIN entry
must NOT hit the fast path — it must fall to the full Argon2id resolver so
the duress/hidden/panic branches route correctly. Enforcement:

- Fast path attempt happens BEFORE PIN entry, gated on `getHardwareFactor`
  alone. If it succeeds → primary session mounted.
- The user must still have a way to enter a duress/panic PIN. UI must offer
  "Enter PIN instead" on the biometric prompt — same as today's biometric
  unlock flow.
- Duress/panic PIN entered → fast-path result (if any) is discarded, full
  resolver runs.

**New oracle risk to close:** if the biometric prompt shape changes based
on whether a cache slot exists, that leaks "primary is enrolled here". Fix:
always show the same prompt shape whether or not the cache slot exists;
absent cache → prompt appears, hardware factor returned, decrypt fails
silently, fall through to PIN entry. Cost: one wasted biometric prompt on
first unlock after cache invalidation. Acceptable.

### Cache invalidation (must-haves, fail-closed)

The cache slot MUST be cleared on:

- `panicWipe()` — already clears Keystore; extend the wipe list to include
  `DEK_CACHE_STORAGE_KEY`.
- PIN change / vault re-key — DEK may change; rewrite cache.
- Biometric enrollment change (Android
  `setInvalidatedByBiometricEnrollment`) — H changes, unwrap will fail
  cleanly; no explicit clear needed but must not fall through silently.
- Vault deletion / discard-incomplete-wallet.
- App uninstall (OS handles).
- Any KEK error other than `DEK_CACHE_UNWRAP_FAILED` — treat as tamper,
  clear + full path.

### RASP tier interaction

WARN/BLOCK RASP tiers must bypass the fast path and force full Argon2id
+ existing gate flow. Rationale: fast-path is a UX-latency feature, not a
signing operation, but it produces a live DEK — same trust bar as unlock.
BLOCK obviously can't unlock at all; WARN forces re-derive so a
newly-rooted device can't ride an old cache slot to skip freshness checks.

## Primitives — already in tree

- `wrapDekForCache` / `unwrapDekFromCache` / `DEK_CACHE_STORAGE_KEY`:
  [dekCache.js](../src/wallet-core/keystore/dekCache.js), built for
  Personal Backup Phase 1a. Same shape works here.
- `getHardwareFactor`: already implemented per-platform,
  [keystore/native.js](../src/wallet-core/keystore/native.js),
  [keystore/web.js](../src/wallet-core/keystore/web.js),
  [keystore/hardware.js](../src/wallet-core/keystore/hardware.js).
- HKDF-SHA256: available via `combineKek`'s implementation in
  [keystore/kek.js:216](../src/wallet-core/keystore/kek.js). Extract or
  parametrize.

**Net new code: ~150 LOC + tests.** Roughly: a `deriveFastPathKek(H)`
helper, cache write on successful full unlock, cache read attempt at
unlock entry, wiring in `WalletProvider.unlock()`, cache clear in
`panicWipe` + `discardIncompleteWallet` + rekey paths.

## What this doc does NOT propose

- Lower Argon2id memory on low-RAM devices — separate conversation,
  vault-format-relevant.
- Worker pool for parallel KDFs — 3× 192 MiB simultaneous RAM would OOM
  the exact devices we're helping.
- Removing the H-1 equalizer on the slow path — regression-pinned by
  [`unlockTimingEqualizer.h1.native.test.jsx`](../src/lib/__tests__/unlockTimingEqualizer.h1.native.test.jsx),
  correctly.
- Any change to the vault-at-rest wrap. The cache slot is a SECOND wrap
  of the same DEK, distinct AAD, distinct Keystore slot.

## Open questions for the owner

1. **Do we accept the coerced-biometric gap?** This is the whole decision.
   Everything else is engineering.
2. **First-unlock UX.** After install/import, first unlock is still 10–30 s
   (cache empty). Show a "one-time setup" spinner, or accept the surprise?
3. **Opt-in vs. default-on?** Settings toggle ("Fast unlock — uses Face ID
   without PIN"), on by default? Off by default with a nudge? Off, period,
   and user must opt-in from Security settings?
4. **Applies on web / desktop?** Web KEK uses WebAuthn PRF; latency is
   already low there. Recommend NATIVE-ONLY to keep the change surface
   small and the audit scope narrow.
5. **Interaction with Personal Backup rollout.** `dekCache.js` was written
   for Shamir Share A. Sharing the slot vs. separate slots?
   Recommend: **separate slot** — different AAD (`fastpath/v1` vs.
   `dek-cache/v1`), so a slot mixup fails closed.

## Test plan (when/if approved)

- **Regression pins (must pass unchanged):**
  - `unlockTimingEqualizer.h1.native.test.jsx` — slow path unchanged.
  - `unlockTimingEqualizer.h1.test.jsx` — web unchanged.
  - `unlockTimingLegacyParams.p1.test.jsx` — param-profile parity intact.
  - Every KEK enrollment / migration test in
    [`src/wallet-core/keystore/__tests__/`](../src/wallet-core/keystore/__tests__/).

- **New:**
  - Fast-path miss falls through to full path silently (no oracle).
  - Fast-path never invoked on duress/panic/wrong PIN paths.
  - Cache slot cleared by `panicWipe`.
  - Cache slot cleared on PIN change.
  - Cache slot cleared / invalid on biometric enrollment change (device
    test, Android).
  - WARN RASP tier bypasses fast path.
  - Cache blob AAD distinct from `dek-cache/v1` — cross-slot rejection.
  - On-device benchmark: unlock latency P50/P95 on Pixel 4a, Pixel 3,
    Samsung A20, iPhone SE (2nd gen). Report before/after.

## Gates before code

1. Owner approval of the coerced-biometric gap (§Security model change).
2. `veyrnox-security-tdd` writes failing tests FIRST.
3. `veyrnox-honest-reviewer` review before merge.
4. `codex-security-review` second pass.
5. Real-device benchmark on the four target phones, results in the PR.
6. Independent-audit disclosure that a fast-path exists on native and
   deliberately trades PIN gating for latency.

None of this is verified until an on-device benchmark and an audit pass.

---

## ponytail: what got skipped, when to add it

- Skipped: worker pool, Argon2 memory tuning, cross-platform (web) rollout.
  Add when native fast-path ships and measurements say the remaining slow
  paths still hurt.
- Skipped: unifying the cache slot with Personal Backup's `dek-cache/v1`.
  Add when both features have shipped separately and the redundancy proves
  itself; distinct-AAD-per-purpose is the safer default.
