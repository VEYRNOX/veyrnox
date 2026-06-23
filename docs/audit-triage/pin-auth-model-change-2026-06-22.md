# PIN Auth Deniability Model Change — v2 (2026-06-22)

**Status:** BUILT, UNVERIFIED — needs independent audit + real-device proof.  
**Owner approval:** recorded 2026-06-22 (this session).  
**Area:** S3 coercion-resistance / deniability core.  
**Key files:** `lib/WalletProvider.jsx`, `wallet-core/deniabilityUnlock.js`,
`src/lib/pinAttemptGuard.js`, `src/pages/DuressPin.jsx`, `wallet-core/panic.js`.

---

## Old model (Option-A, removed)

The original design preserved a "no-oracle" property: a wrong PIN at the unlock screen
was indistinguishable from a duress-PIN hit because a fourth slot (Option-A) opened an
empty, deterministically-derived decoy instead of returning an error. An interactive
attacker could try PINs without ever receiving a signal that their guess was wrong.

Limitation that drove removal: the deterministic decoy was empty and detectable as
empty, and the implementation complexity added risk without proportionate benefit given
that an 8-digit PIN over Argon2id is offline-exhaustible on a seized device regardless
of the no-oracle property.

---

## New model (v2 — current)

| Input at the unlock screen | Outcome |
|---|---|
| Real 8-digit PIN | Real wallet (hidden — no UI tells it exists) |
| Configured duress PIN | Decoy wallet (the surrendered wallet) |
| Face ID (opt-in, bound to duress PIN) | Decoy wallet, never the real one |
| Any other wrong PIN | Explicit "Incorrect PIN" error |
| 10 consecutive wrong PINs | Irreversible local panic wipe |
| Dedicated panic PIN | Immediate irreversible local panic wipe |

### What deniability now rests on

Deniability is provided by **hiding the real wallet behind the secret real PIN** and
routing coercers to the decoy via the duress PIN or Face ID. There is no longer a
no-oracle property: a wrong guess is distinguishable. The 10-attempt wipe
(pinAttemptGuard.js) is the designed mitigation — the device self-destructs before an
exhaustive search of the 8-digit PIN space completes under normal (on-device) conditions.

### The wrong-PIN oracle

A wrong PIN is now an explicit oracle: an interactive attacker learns immediately
that their guess was wrong. This IS an oracle in the classical sense. The mitigation is
NOT silence — it is rate-limiting to destruction:

- 10 wrong guesses → irreversible wipe (same path as a panic PIN).
- An 8-digit PIN has 10^8 combinations. The 10-attempt wipe fires long before
  exhaustion is possible interactively.

The constant-KDF cost in `deniabilityUnlock.js` (3 KDFs per post-primary-miss
resolution) means that timing adds NO additional signal on top of the explicit error —
but the error itself is the oracle, intentionally.

---

## Offline-seizure gap (OPEN)

The 10-attempt counter lives in **software** (pinAttemptGuard.js). An attacker who
images device storage before the first PIN attempt can bypass it, then exhaustively
search the 8-digit space offline against the extracted Argon2id blob.

**What would close it:** a hardware key-encryption key (KEK) bound to the device
Secure Enclave (iOS) or Android Keystore (StrongBox), so the blob cannot be decrypted
without the hardware-bound key even with the storage image. This is the planned
fast-follow.

**Current status of hardware KEK:** TARGET / PLANNED — not yet built. Requires a
native Capacitor plugin, real-device verification, and audit.

This gap is explicitly disclosed on:
- The `/what-this-protects` page (static copy).
- The DuressPin.jsx caution banner and "How it works" section.
- The featureCatalogue.js PIN Unlock explanation.

---

## Constant-KDF timing (unchanged from v1)

`deniabilityUnlock.js` still runs exactly 3 KDFs on every post-primary-miss call,
regardless of which features are configured and with no early-return short-circuit.
Combined with the 1 primary-unlock KDF, every non-primary outcome (wrong, duress,
hidden, panic) costs a constant 4 KDFs. The wrong-PIN error returned to the caller is
the new oracle; the timing analysis of the SAST M2 finding is unaffected — timing
still does not leak deniability-feature count.

---

## Audit items for this change

1. **On-device proof:** demonstrate the three paths (real PIN, duress PIN, wrong PIN)
   on a real device — confirm the error surface, the decoy session, and that the real
   wallet is never referenced in a decoy session.

2. **10-attempt wipe:** verify pinAttemptGuard.js increments correctly, wipes via the
   same path as panic.js, and is not bypassable from JavaScript (e.g. by clearing
   localStorage before the counter fires — if the counter lives in localStorage, that
   is a gap).

3. **Face-ID path:** confirm `enableDecoyBiometricUnlock` stores the duress PIN
   (not the real PIN) behind the biometric gate, and that Face ID on a device never
   surfaces the real wallet.

4. **No regression in constant-KDF invariant:** the 3-KDF post-primary cost must
   hold with the new path added. Measure under real noise, not code-reading only.

5. **Offline-seizure gap disclosure:** confirm the hardware-KEK gap is disclosed
   consistently everywhere it matters (unlock screen, this file, DuressPin.jsx,
   what-this-protects).

---

## Files changed in this doc's commit

| File | Change |
|---|---|
| `src/wallet-core/deniabilityUnlock.js` | Header updated: v2 model summary, no-oracle removal rationale, offline-seizure gap, oracle-vs-timing note |
| `src/pages/DuressPin.jsx` | Caution banner, "How it works" copy, demo comments — all updated to describe v2 (wrong PIN errors, no-oracle removed, 10-attempt wipe) |
| `src/lib/featureCatalogue.js` | Duress PIN, Panic Wipe, PIN Unlock entries — v2 model, BUILT/UNAUDITED-PROVISIONAL, 10-attempt wipe, no-oracle removal |
| `src/lib/featureClassification.js` | `/duress-pin`, `/panic-wipe` notes — v2 model, deliberate no-oracle removal, pinAttemptGuard.js, offline-seizure gap |
| `docs/audit-triage/pin-auth-model-change-2026-06-22.md` | This document |

Nothing in this commit touches signing, key derivation, vault encryption, or the
WalletProvider unlock logic — only comments, copy, and status descriptions were
changed.

---

## Addendum — loud next-open wipe acknowledgment (2026-06-22)

**Owner-approved 2026-06-22.** After ANY local wipe (panic PIN at unlock, the
10-attempt auto-wipe, or the in-app guarded wipe), `panicWipeLocal()` now leaves a
persisted `localStorage['veyrnox-wiped'] = '1'` marker (presence == wiped; written
AFTER the residue clear and DELIBERATELY excluded from `ALL_RESIDUE_KEYS` so the wipe's
own sweep cannot remove it, and so it survives a relaunch with no vault). On the NEXT
app open the gate now renders a LOUD destructive "This device was wiped" screen
(`WalletEntry.jsx` → `WipedNotice`) instead of silently dropping the user onto the
generic "Get Started" onboarding with no sign their funds-bearing keys were destroyed.

This marker is a **deliberate next-open deniability tell**: the panic-PIN
**at-the-moment** response is UNCHANGED — it still shows the generic "Incorrect PIN.
Try again." with no "wiped!" tell, so covert destruction under coercion is preserved.
Only the next open is loud. The 10-attempt warning/counter logic
(`pinAttemptGuard.js`) and the panic routing are untouched.

`WalletProvider` initialises `wasWiped` from the marker on mount and exposes
`acknowledgeWipe()` (clears the marker + flag); both loud-screen actions ("Restore from
recovery phrase", "Start a new wallet") call it before routing on, so the screen does
not reappear. No key material, signing, derivation, or vault crypto is touched — this is
post-wipe UX + one presence-only marker.

| File | Change |
|---|---|
| `src/wallet-core/panic.js` | `setWipeMarker()` (internal, post-clear), `readWipeMarker()`/`clearWipeMarker()` exports; `WIPE_MARKER_KEY = 'veyrnox-wiped'` excluded from `ALL_RESIDUE_KEYS` |
| `src/lib/WalletProvider.jsx` | `wasWiped` seeded from `readWipeMarker()`; `acknowledgeWipe()` added + exposed |
| `src/components/WalletEntry.jsx` | `WipedNotice` loud screen, rendered first when `wasWiped && no vault`; actions call `acknowledgeWipe()` |
| `src/wallet-core/__tests__/panic.test.js` | marker written post-clear, excluded from residue, cleared by `clearWipeMarker` |
| `src/components/__tests__/wallet-entry-wiped-ack.test.jsx` | loud screen renders + both actions call `acknowledgeWipe` |
