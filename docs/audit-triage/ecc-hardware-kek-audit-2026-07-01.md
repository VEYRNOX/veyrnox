# ECC independent audit — Hardware KEK (H-NEW-D) — 2026-07-01

> **WHAT THIS IS:** the evidence record for an independent, ECC-style security audit of the
> native mobile Hardware Key-Encryption-Key (KEK) — iOS Secure Enclave (ECIES) + Android
> StrongBox/Keystore (HMAC) — that binds the PIN-derived vault key to platform hardware.
> Method mirrors the 2026-06-23 ECC audit: parallel `veyrnox-honest-reviewer` agents,
> **two independent runs, no anchoring between runs**, adversarial refute-first posture,
> conservative severity grading. Findings below were confirmed in BOTH runs of their
> dimension unless explicitly marked `[single-run, code-verified]`.
>
> **Target:** `veyrnox-secure` main `814fa9d06`. Read-only.
> **This audit is SOURCE-LEVEL.** It does NOT and cannot verify native Secure Enclave /
> StrongBox runtime behaviour (device-only). It does NOT promote the feature to "verified" —
> the §7 device tests remain the gate. Status stays **BUILT / device-verified (PARTIAL) /
> UNAUDITED-PROVISIONAL**.

| | |
|---|---|
| **Date** | 2026-07-01 |
| **Target** | main `814fa9d06` |
| **Method** | 10 `veyrnox-honest-reviewer` agents; 5 dimensions × 2 independent runs; refute-first; no anchoring |
| **Dimensions** | (A) KEK crypto primitives · (B) native fail-closed orchestration · (C) iOS SE plugin · (D) Android StrongBox plugin · (E) claims-vs-code honesty + test adequacy |
| **Outcome** | **0 CRITICAL · 0 HIGH · 4 MEDIUM · 8 LOW** + confirmed positives. No seed/key-compromise or fund-loss path found in source. |
| **Gate status** | Source audit PASSES with fixes. Device tests (§7 / Q6) remain OUTSTANDING — feature stays BUILT, not verified. |

---

## Headline

The KEK cryptographic construction and the JS fail-closed orchestration are **sound**. Both
runs of every dimension agreed there is **no CRITICAL/HIGH** finding — no path where the seed
decrypts on a partial (H-only or PIN-only) success, no silent KEK→bare downgrade, and no
offline-exhaustion path on a copied vault blob. The actionable findings are one real
security-posture gap (a SOFTWARE-tier key can present as "Hardware Protection ON"), one
platform-scope bug (Android API floor), and a cluster of documentation/honesty drift — most
of it **under-claiming** the shipped iOS SE work.

---

## Findings

| ID | Sev | Dimension | Finding | Location |
|---|---|---|---|---|
| M1 | MEDIUM | crypto + honesty | **Doc/invariant divergence:** CLAUDE.md I6 says `KEK = HKDF(H ⊕ C)` (XOR); code does `HKDF(ikm = H ‖ C)` (concatenation). Also `docs/PHASE1-VERIFICATION-SUMMARY.md:75` describes it as raw `H XOR C` (no HKDF). Code is correct & *stronger* (concat feeds full 64 B into HKDF; XOR would be a weaker combiner). Doc-only. | `CLAUDE.md:73`; `kek.js:29,61,113-116` |
| M2 | MEDIUM | Android | **Security tier is measured but discarded** — `enrollHardwareCredential()` drops `enroll()`'s `{securityLevel}` result, so a `SECURITY_LEVEL_SOFTWARE` (tier 0) key enrolls and shows the same "Hardware Protection ON" badge as StrongBox. Under the threat model a software-tier key gives **no hardware binding**. (Q4.) | `hardware.js:66-69`; `HardwareKekPlugin.kt:78-95`; `HardwareKekSettings.jsx` |
| M3 | MEDIUM | honesty | **Stale/contradictory status:** `featureCatalogue.js` "Native Secure Storage" = `status:'roadmap'`, "plugin registration blocked / not confirmed in shipped code"; `Feature-Status.md:403` H-NEW-D row = "NON-FUNCTIONAL" citing the superseded Swift path. Both contradict §4 + the device-verified evidence (shipped ObjC two-file split, PR #495). **Under-claim** (honest-safe) but factually wrong. | `featureCatalogue.js:182-186`; `Feature-Status.md:403` |
| M4 | MEDIUM | Android | **API-floor bug** `[single-run, code-verified]`: `setUserAuthenticationParameters(0, AUTH_BIOMETRIC_STRONG)` is API 30 but `minSdkVersion = 24`, with no `SDK_INT` guard on the enroll path. On API 24–29 `enroll()` throws → **fail-closed** (no fake H, honest OFF) but silently denies KEK to every pre-Android-11 device with an opaque error. | `HardwareKekPlugin.kt:166`; `variables.gradle:2` |
| L1 | LOW | native | `changePassword` and `saveVaultContents` are **not** wrapped in `withLockSuppressed` (unlike unlock/enrollKek/unenrollKek), though both open biometric sheets. Robustness/UX (a lock hook can fire mid-op); NOT corruption — the write is single-key atomic. `[single-run, code-verified]` | `native.js:348,416` |
| L2 | LOW | native | `enrollKek` rollback (clear orphan credential on failure) lives only in the **UI** `catch` (`HardwareKekSettings.jsx`), not in the `enrollKek` contract — a non-UI caller gets no rollback. Self-heals via `hasVaultKekWrap` reconcile. Defense-in-depth. | `native.js:481-518`; `HardwareKekSettings.jsx:70-89` |
| L3 | LOW | Android | `enroll()` has no `containsAlias` guard → re-enrolling **silently re-keys** the fixed alias, permanently bricking the existing `kekWrap` (funds recoverable only via seed). Availability, out of threat model. `[single-run, code-verified]` | `HardwareKekPlugin.kt:152-178` |
| L4 | LOW | iOS | iOS Keychain + SE key **persist across app uninstall**; no first-run staleness sweep in the plugin. `isEnrolled()` can read `true` on a fresh reinstall. Not a compromise (H stays SE-bound + biometric-gated); confusing-state only. (Q3.) | `HardwareKekPlugin.m:144-263` |
| L5 | LOW | iOS + honesty | **Stale iOS mechanism docs:** `kek.js:16-20` + `kek.honesty-wider.test.js` say "iOS uses generic Keychain, NOT Secure Enclave"; `hardware.js` header describes only "Android Keystore HMAC" and references a nonexistent `HardwareKekPlugin.swift`. Shipped iOS is SE-ECIES (`kSecAttrTokenIDSecureEnclave`). Under-describes; misleads a source reader. | `kek.js:16-20`; `hardware.js:1-28`; `kek.honesty-wider.test.js` |
| L6 | LOW | honesty | Android device-verification sits **under `evidence{}`** (the promotion map), unlike the iOS `_ios_hardware_kek_device_verification` **META key**. Currently inert (no feature name matches → no promotion), but an inconsistent, latent promotion trap. | `verified-evidence.json:104` |
| L7 | LOW | crypto | AES-GCM `wrapDek` binds no AAD (kekSalt/version not authenticated into the tag). Not exploitable (wrong KEK already fails the tag); optional defense-in-depth. | `kek.js:170-200` |
| L8 | LOW | Android | Android JS test is a **source-scan only**; it pins the H16 biometric-only strings but does NOT assert `setInvalidatedByBiometricEnrollment(true)`, the per-use `setUserAuthenticationParameters(0,…)`, or StrongBox — a regression removing invalidation would pass CI. Honestly disclosed as a known gap. | `hardwareKek.android.test.js` |

---

## Confirmed positives (both runs)

- **Fail-closed unlock (I6/I4):** `_unlockInner` requires BOTH H and C; wrong PIN → wrong C → wrong KEK → `unwrapDek` GCM-auth throws **before** `decryptVaultWithDek`. No partial-success seed exposure; no fall-through to the bare path. `unwrapDek` returns a generic error (no wrong-factor oracle).
- **Crypto primitives:** `HKDF-SHA256(H‖C)` with fixed salt/info (correct — reproducibility), fixed 32-byte factor lengths enforced (no concat split-ambiguity), AES-256-GCM with per-wrap random IV, mandatory tag verification. (Q1, Q5.)
- **Key-material zeroing:** H, C, ikm, KEK, DEK zeroed on success AND throw paths (`try/finally`); tests assert byte-zero. Only residual is the recovered seed *string* (immutable, un-zeroable, by design, out of scope). (Q5.)
- **No silent downgrade:** `saveVaultContents` never writes bare when `kekWrap` was present (#497 fix confirmed); `hasVaultKekWrap` reads the persisted blob (sound source-of-truth, replaces the old credential-existence check).
- **iOS SE plugin:** SE P-256 non-extractable key, ACL `kSecAccessControlPrivateKeyUsage | .biometryCurrentSet` over `WhenPasscodeSetThisDeviceOnly`, **no** passcode/`.biometryAny` weakening, correct ECIES, fail-honest `clearCredential`, correct `CAPPlugin` two-file registration (no software fallback).
- **Android plugin:** per-use auth (`timeout 0`), biometric-only (`AUTH_BIOMETRIC_STRONG`, no `DEVICE_CREDENTIAL` fallback), non-exportable Keystore key, deterministic HMAC over fixed `PRF_EVAL_SALT`, `setInvalidatedByBiometricEnrollment(true)` + fail-closed `KeyPermanentlyInvalidatedException` handling. StrongBox **preferred**, tier reported **honestly**.
- **Honesty bar (I4) met:** the UI badge does not over-claim (no "Secure Enclave"/"StrongBox" to the user; UNAUDITED-PROVISIONAL banner; keys off `hasVaultKekWrap`), the iOS evidence META key is honest + genuinely non-promoting, and mock-native tests are honestly scoped as JS-orchestration-only (not native proof).

---

## Answers to the six auditor questions

1. **H‖C vs H⊕C** — Code does **concatenation** `HKDF(ikm = H ‖ C)` (`kek.js:113-116`); it is correct and *stronger* than XOR. CLAUDE.md I6 (XOR) is the error → **fix the doc** (M1). Fixed 32-byte lengths remove any concat split-ambiguity.
2. **Fail-closed ordering (unenrollKek / saveVaultContents) vs crash/kill** — **Sound.** Writes are single-key atomic (`safeWriteVault` set + read-back-verify); `unenrollKek` writes the readable bare blob *before* deleting the credential; `saveVaultContents` never bare-downgrades a KEK vault. No unreadable and no silently-bare window. Only residual = orphan credential, self-reconciled to honest OFF. (Nit L1: add `withLockSuppressed`.)
3. **iOS Keychain persists across uninstall — mitigation complete?** — **Partially.** `hasVaultKekWrap` + reconcile covers the alias-present/vault-bare direction, but NOT uninstall→reinstall residual SE key + ciphertext. Not a compromise (H stays SE-bound + biometric-gated); recommend a first-run staleness sweep + document the persistence (L4).
4. **StrongBox preferred not enforced — acceptable, or refuse non-StrongBox?** — Honest reporting is acceptable, and **TEE should NOT be refused** (it meets the at-rest threat model; refusing it needlessly excludes most Androids). But the tier is currently **discarded** (M2), so a **SOFTWARE-tier** (securityLevel 0) key presents as "Hardware Protection ON" with no hardware binding. Recommendation: consume the tier — **refuse/degrade SOFTWARE (and UNKNOWN/probe-error)**, keep TEE, StrongBox enforcement stays TARGET.
5. **Zeroing completeness** — **Complete** for all mutable KEK-layer secrets on all throw paths (test-pinned). Only the recovered seed string is un-zeroable (immutable, by design, out of scope). (Q5.)
6. **`.biometryCurrentSet` (iOS) / `setInvalidatedByBiometricEnrollment` (Android) sufficient?** — **Code-correct on both platforms** and paired with fail-closed handling; these are the right flags (iOS is `.biometryCurrentSet`, not `.biometryAny`). BUT the **runtime invalidation guarantee is DEVICE-ONLY and UNTESTED** (§7.1) — this is the single most important outstanding item. iOS nuance: removing the device passcode *also* destroys the key, so the device test must distinguish "biometric changed" from "passcode removed."

---

## Outstanding before "VERIFIED" (audit concurs these remain the gate)

1. **Biometric re-enrollment invalidation device test** — both platforms. The core I6 property; untested. **#1 priority.**
2. **iOS live `getHardwareFactor` SE-unlock trace** tied to a send (proof to date is architectural).
3. Android already has a KEK-gated Sepolia send (`verified-evidence.json:104`, block 11180398) — but see L6 (placement).
4. Independent audit sign-off: this document is the **source-level** independent review. Device legs above remain.

---

## Recommended remediation

**Doc-only (safe, audit-mandated honesty fixes):** M1 (CLAUDE.md I6 → `H ‖ C`; fix `PHASE1-VERIFICATION-SUMMARY.md:75`), M3 (catalogue + Feature-Status H-NEW-D → BUILT/device-verified-PARTIAL), L5 (stale iOS "Keychain-not-SE" comments + `hardware.js` facade header + `.swift` reference), L6 (move Android evidence to a `_android_hardware_kek_device_verification` META key).

**Code (security-sensitive → strict TDD + review):** M2 (consume tier; refuse/degrade SOFTWARE), M4 (guard the API-30 call; honest "requires Android 11+" state), L1 (`withLockSuppressed` on changePassword/saveVaultContents), L3 (`containsAlias` re-key guard), L4 (iOS first-run staleness sweep), L8 (add invalidation/per-use assertions to the Android source-scan test), L7 (optional GCM AAD).

**Nothing here promotes the feature to "verified."**
