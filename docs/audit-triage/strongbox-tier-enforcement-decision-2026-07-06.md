# Android StrongBox tier enforcement — options analysis (DECISION PENDING) — 2026-07-06

> **WHAT THIS IS:** an options analysis for the standing TARGET item *"StrongBox tier
> enforcement"* — whether the Android hardware-KEK enroll path should **require StrongBox**
> (refuse TEE-only devices) rather than its current behavior of accepting any real
> secure-hardware tier and honestly surfacing which one. This is a **policy decision to make
> before any enforcement is built or device-verified** — nothing here changes code.
>
> **PROVENANCE — INTERNAL, AI-drafted, owner-to-decide.** Drafted by a Claude Code session
> 2026-07-06 from the current code + threat model. Not an independent audit. The
> recommendation is advisory; the choice is the owner's.

## TL;DR / recommendation

**A tier floor is already enforced — the open question is narrow: raise it from TEE to StrongBox?**
Recommended: **Option A (keep the TEE floor, keep honest StrongBox surfacing) as the default**,
optionally add **Option B (opt-in "Require StrongBox" high-assurance toggle)** as a small
fast-follow if a high-assurance segment wants it. **Do not hard-require StrongBox globally
(Option C)** — it excludes the majority of Android devices for a marginal threat-model gain.

## Current state (what is ALREADY built — do not re-litigate)

- **SOFTWARE tier is REFUSED, fail-closed (AUDIT M2 fix).** `enrollHardwareCredential()`
  consumes the plugin's `{ securityLevel, securityLevelName }` and throws a machine-coded
  error when the tier is `SOFTWARE` / `UNKNOWN` / `NO_KEY` / probe-error / missing — so a
  software-only key can never masquerade as "Hardware Protection ON". This is the
  security-critical floor and it is enforced. (`hardware.enroll-tier-gating.test.js`.)
- **TEE (TRUSTED_ENVIRONMENT) and StrongBox are both ACCEPTED.** TEE meets the at-rest
  threat model (hardware-backed AndroidKeyStore, non-extractable key). StrongBox is
  preferred (`setIsStrongBoxBacked(true)`, best-effort with `StrongBoxUnavailableException`
  fallback to TEE).
- **The true tier is surfaced, never fabricated (H-1, PR #527).** `getVaultKekTier()` +
  `tierBadge.js` render the real tier: *StrongBox Protected / TEE Protected / Hardware
  Protection ON / WebAuthn Protected*. `isSecureHardwareAvailable()` reports capability
  truthfully.
- **Only the "refuse TEE, require StrongBox" step is TARGET** (`HardwareKekPlugin.kt:21`,
  `hardware.js:63`).

So "StrongBox tier enforcement" is **not** "enforce a tier vs. enforce nothing" — the
important floor exists. It is specifically **"raise the accept-floor from TEE to StrongBox."**

## The threat-model question (is the gain worth it?)

Both tiers are hardware-backed, non-extractable AndroidKeyStore keys, so both close the core
**offline-seizure** gap the KEK exists for (the seed can't be decrypted off-device without
the hardware factor H). The delta between TEE and StrongBox:

| | TEE (TrustZone) | StrongBox |
|---|---|---|
| Isolation | Isolated from the main OS, but **shares the main SoC** (CPU/RAM/cache) | **Dedicated tamper-resistant secure element** — own CPU/RAM/secure clock (smartcard-class, CC EAL) |
| Rate-limiting | Software/OS-assisted | **Hardware-enforced** brute-force throttling |
| Side-channel / physical attack resistance | Lower — SoC-level attacks possible for a well-resourced attacker | Higher — dedicated tamper resistance |
| Adequacy for THIS wallet | Sufficient for the common seizure/theft threat (device-bound, non-extractable) | Adds margin for a **high-resourced / nation-state** adversary |

For the typical coercion/theft threat model, **TEE is sufficient**. StrongBox meaningfully
raises the bar only against a sophisticated hardware attacker — a real but minority threat.

## Device-coverage reality (the cost of enforcing StrongBox)

- **StrongBox is scarce.** It ships mainly on recent Google Pixels (Pixel 3+) and some
  flagship Samsungs; the **large majority of Android devices are TEE-only**. minSdk here is
  already gated at **API 30 (Android 11)** for the KEK path.
- Hard-requiring StrongBox would **disable hardware KEK for most Android users**, pushing
  them to the password-only vault — a *worse* security outcome for the many, to gain margin
  for the few. This directly conflicts with the M2c/d design principle already recorded in
  Feature-Status: *"the UI must never claim OS-enforced protection on a device that only has
  app-layer — degrade to the software vault and say so"* (degrade honestly, don't exclude).

## Options

**Option A — Keep the TEE floor + honest StrongBox surfacing (status quo). ★ recommended default.**
No enforcement change. SOFTWARE stays refused; TEE+StrongBox accepted; the badge tells the
truth. Maximal device coverage, honest disclosure, no footgun.
*Trade-off:* a user on a StrongBox-capable device gets StrongBox automatically but there is
no way to *insist* on it / refuse a downgrade.

**Option B — Opt-in "Require StrongBox" high-assurance toggle. ▲ optional fast-follow.**
A user-facing setting (default OFF) that makes enroll **refuse** anything below StrongBox on
*that user's* device, with a clear disclosure ("your device has no StrongBox — hardware
protection unavailable in high-assurance mode; use the standard vault"). The user chooses to
exclude their own TEE device; no one is excluded by fiat.
*Trade-off:* extra UI + a native enroll path that hard-fails on non-StrongBox; support
questions from users who toggle it on a TEE device. Small, contained.

**Option C — Hard-require StrongBox globally. ✕ not recommended.**
Refuse TEE for everyone. *Trade-off:* excludes the majority of Androids from hardware KEK
for a marginal, minority-threat gain — a net security *loss* across the user base and a
conflict with the degrade-honestly principle.

## If Option B/C is chosen — what device-verification then requires

Enforcement can only be verified with **two physical devices**:
1. A **StrongBox** device (e.g. Pixel 10 Pro XL) — confirm enroll **accepts** and the vault
   wraps under a StrongBox key (`securityLevel=2`).
2. A **non-StrongBox (TEE-only)** device — confirm enroll **refuses** with the honest
   machine-coded error and the app degrades to the standard vault with clear disclosure
   (I4), never silently downgrading or claiming StrongBox.
Plus the usual: adb logcat capture of the tier + reject path, honest recording as
**non-promoting META** evidence, and no "verified" claim without both device runs.

## Revisit triggers
- A concrete high-assurance customer/segment asks to *insist* on StrongBox → build Option B.
- An independent audit recommends a higher default floor.
- StrongBox becomes near-universal on target devices (then Option C's exclusion cost drops).
- A demonstrated TEE-tier break in the wild against the at-rest threat model.

## Cross-refs
- `docs/Feature-Status.md` §4 (StrongBox tier + M2c/d decision note) ·
  `android/app/src/main/java/com/veyrnox/app/HardwareKekPlugin.kt` (H15) ·
  `src/wallet-core/keystore/hardware.js` · `src/lib/tierBadge.js` (H-1, PR #527) ·
  `src/wallet-core/keystore/__tests__/hardware.enroll-tier-gating.test.js` (AUDIT M2).
