# Audit Findings Tracker
Last updated: 2026-09-07
Analysed against: origin/main @ `d0c4423cd7ea4b535d20dcf3abce0f9f31f6c520`
(clean branch worktree cut from `origin/main` per Step 0 — not the live checkout,
not a `git show` fallback. macOS/zsh.)

> Automated weekly synthesis of every finding across the audit corpus, checked against a
> **pinned snapshot of `origin/main`**. **Static analysis only.** "FIXED" means the code
> change is present on `main` — it does **not** mean the control is verified working
> on-device, on-chain, or against a live backend. Rows tagged `(grep)` were re-verified
> against source this run; rows tagged `(doc)` carry the status recorded in an audit doc or
> PR history and were not independently re-checked.

## Window since last run

Previous run analysed `6e8b3bef` (2026-08-24). **This run covers 14 days, not 7** — the
2026-08-31 slot did not produce a tracker. `main` has moved **2,719 commits** since that
pin, the largest window this tracker has ever spanned.

The window contains the corpus's **first CRITICAL that was live in production** (a Shamir
threshold break, since fixed) and a complete rise-and-fall of a new attack surface (the
bug-report screen-recording feature, introduced 09-02 and deleted 09-07) — which left one
regression behind that the deletion did not close. **That regression was closed later the
same day** (#2418 plus a three-project live audit); this section is left as written, with
the outcome noted, rather than rewritten.

## Sources synthesised

Carried from prior runs, unchanged: the 06-26 through 08-17 corpus, `docs/audit-triage/`
(29 files) and `docs/security-audits/` (11 files) — no finding IDs beyond those already
catalogued.

**New this run:**

- **`docs/audit-2026-08-25-weekly.md`** — 4 HIGH, 10 MEDIUM, 13 LOW, 3 INFO, plus a
  same-day 12-worktree remediation wave (#2060–#2075) and an unusually candid
  post-wave section recording what the wave broke.
- **`docs/audit-2026-09-05-weekly.md`** — 1 HIGH, 5 MEDIUM, 12 LOW, pinned to
  `4ae2dbc1`, which `main` has since passed. Marks each finding **[VERIFIED]**
  (coordinating session re-derived it) or **[AGENT]** (lead only, not re-derived) —
  the first report in the corpus to separate those two confidence classes explicitly.
  One agent finding REFUTED and one agent recommendation REJECTED, both recorded.
- **`docs/audit-gemini-sweep-2026-09-06.md`** — second Gemini pass (`src/components/`,
  269 files). Six findings: **2 real, 4 fabricated or misfiled.**
- **`docs/security-diffs/diff-2026-08-25.md` … `diff-2026-09-07.md`** — 13 daily scans
  (14 report-days; 09-03 and 09-05 each carry multiple runs).
- **`docs/honesty-check-2026-08-31.md`** — zero code changes; both flags it raised were
  wrong. See the pattern note.
- `docs/dependency-audits/dep-audit-2026-08-24.md`, `-08-25.md`, `-09-01.md`.

**No coverage gap in the daily scan this window** — 08-25 through 09-07 is unbroken.
That is an improvement on the previous window's four-day hole.

## Summary

- Total findings catalogued: **~300** (dedup across the corpus; MEDIUM/LOW grouped — the
  count is approximate by construction and the delta matters more than the absolute)
- Fixed (code-confirmed): **~237** — **~38 closed this run**, of which **9 were
  re-verified by grep** against the pinned snapshot rather than taken from a doc
- Still open / accepted-residual: **~46**
- **Regressed: 0** — was 1 (the bug-report storage RLS policy). Closed 2026-09-07 by #2418
  plus a live audit of **all three** Supabase projects, which established the negative the
  issue existed to prove: the migration was never applied anywhere
- Needs on-device / on-chain / live-backend verification: **24**

---

## What changed this run

### A CRITICAL was live in production for 12 days, and a test edit is what surfaced it

**DIFF-0901-SHAMIR / #2213 — the 2-of-3 threshold was worth 256 guesses, not 2^256.**
`@stablelib/tss`'s `splitRaw()` draws its coefficient vector **once**, outside both of its
loops (`const a = randomBytes(threshold)`), then overwrites only `a[0]` per octet. Every
byte of a 32-byte DEK therefore shared one polynomial coefficient, so a single share
reduced the secret to a 1-in-256 search — defeating the entire point of the split. Live
from 2026-08-20.

**How it was found is the part worth keeping.** The daily scan flagged a *test* edit: a
Shamir test had been made deterministic (flip one bit) rather than re-splitting randomly,
and the stated rationale — "occasional collision" — was arithmetically implausible at the
claimed odds. Chasing the implausible number into the library's source is what produced the
finding. **The vulnerability was not in the diff; the excuse for a test change was.**

**FIXED** at this pin. `shamir.js:292` now defines `splitRawPerOctet`, invoking `splitRaw`
once per secret octet so each byte gets an independently sampled coefficient vector, with a
`WHY THIS EXISTS — do not "simplify" it back` header at `:262-283` and a dedicated
`shamir.coefficientReuse.test.js` (grep). Output shape is byte-identical, so no migration.

### The bug-report feature: built, breached, deleted — and one regression outlived it

Introduced 09-02, shipped behind `VITE_BUG_REPORT_ENABLED` (default OFF), it accumulated
four security findings in five days and was **removed entirely on 09-07** (`826bd1c8`).
Verified at this pin: `functions/api/bug-report/` absent, `src/components/bugReport/` and
`src/lib/bugReport/` absent, `create_bug_report_upload` no longer in the RPC allowlist
(grep). That closes DIFF-0906-BUGREPORT-UPLOAD-NOAUTH (an unauthenticated 52 MiB
service-role write path) and DIFF-0906-BUGREPORT-NOWATCHDOG by deletion.

**The deletion did not close the SQL policy** — a migration already applied to a live
project is not revoked by removing the client that called it, so the file's defect and the
live projects' state were two separate questions. **Both are now answered and the finding is
closed** (2026-09-07, after this section was first written): #2418 dropped the policy from
the file, and a live audit found the migration was never applied on any of the three
Supabase projects. Details, including a method gap in the audit's first pass, under
Regressed below.

### The right fix pattern finally propagated — after being rediscovered five times

The previous tracker's pattern #3 named five sites needing the same
`isDeniabilityOrDemoActive()` seal, three fixed and two not. **Both stragglers are now
closed** (grep):

- `WalletConnectProvider.jsx:745` — `isUnlocked && !isDecoy && !isHidden && !isDeniabilityOrDemoActive()`
- `WalletPortfolioPage.jsx:659` — identical predicate

Both regressions from `46c5faf0` (#1929) are therefore **CLOSED**, and the regressed count
drops from 2 to 1 — and to **0** later the same day when the bug-report SQL policy closed
(see Regressed). `TierProvider.jsx` remains the demo-blind holdout (below).

### Closed this run

| ID | Sev | Finding | Closed by | Confirmed by |
|---|---|---|---|---|
| **H-1 (09-05)** | **HIGH** | Permit2 `PermitBatchTransferFrom`/`PermitBatchWitnessTransferFrom` were in neither allowlist; an unrecognised `primaryType` falls through to `LEVEL.OK`, and OK is the **only** typed-data verdict this surface signs — so the batch drain was the one Permit-family payload the wallet would actually approve, with no banner and no acknowledgement | #2359 | **grep**: both names in `typed-data.js:15` and `wcTypedLevel.js:46`; `wcTypedLevel.test.js:192` pins `RISK` |
| **#2213** | **CRITICAL** | Shamir coefficient reuse — one share ⇒ 256 guesses | #2216 | **grep**: `splitRawPerOctet` at `shamir.js:292`, dedicated regression test |
| **DIFF-0821-WC-BASE44** | REGRESSION | WC Base44 queries omitted the canonical deniability predicate and `isUnlocked` | window | **grep**: `WalletConnectProvider.jsx:745` full predicate |
| **DIFF-0821-PORTFOLIO-BASE44** | REGRESSION | Same seal missing on `WalletToken.list()` | window | **grep**: `WalletPortfolioPage.jsx:659` |
| **L-2 (08-17) / L-4 (08-25)** | LOW | `eth_signTransaction` absent from `BLOCKED_METHODS` — carried across three consecutive audits | window | **grep**: `router.js:50` |
| **H-4 (08-25)** | HIGH | EIP-712 `primaryType` never reconciled with `types` — **open since 2026-08-17, top item on two trackers** | #2063 | (doc) 09-05 **[VERIFIED]**: `typed-data.js:39-55` derives the root from the graph, rejects mismatch *and* ambiguity |
| **H-1 (08-25)** | HIGH | Fast-path biometric opened the REAL vault with no duress gate, default-ON | #2071 | (doc) 09-05 **[VERIFIED]**: write gate `native.js:637`, read gate `:1326` |
| **H-3 (08-25)** | HIGH | WC send fetched a TIP verdict then discarded it | #2067 | (doc) — S9 live in `walletConnectIntel.js:21-23` |
| **M-6 (08-25)** | MED | Spend limits scored on native `value` only ⇒ any ERC-20 transfer bypassed them | #2068 | (doc) — `resolveWcSpendAmount` values ERC-20, fails closed on unvaluable tokens |
| **M-7 (08-25) / M-1 (08-17)** | MED (I4) | PIN timed backoff documented, unit-tested, never enforced — **second consecutive audit** | #2070 | (doc) — checked before the attempt is spent, `WalletEntry.jsx:1016-1024` |
| **M-8 (08-25)** | MED | Clipboard seed wipe had no `focus` trigger | #2061 | (doc) — trigger half only; the honest-failure half is open as L-9 |
| **M-9 (08-25)** | MED (I4) | PIN counter failed OPEN and SILENT on unwritable storage | #2070 | **grep**: `pinAttemptGuard.js:112` `sessionFloor` + latching `storageDegraded`. **MITIGATED, not fixed** — session-scoped by construction; a reload clears it |
| **M-5 (08-25)** | MED | iOS seed reveal proceeded during active screen mirroring | #2065 | (doc) — `screenCapture` split out of the `elevated` union |
| **M-1..M-4, L-1..L-13 (08-25)** | MED/LOW | 12-worktree same-day wave | #2060–#2075 | (doc) — per that report's remediation table; **L-11 NOT ATTEMPTED**, recurs as 09-05 L-12 |
| **DIFF-0903-ADVISOR-SNAPSHOT** | REGRESSION | `useAdvisorSnapshot()` published 61 pages' shell-state to `tip-chat` beside a persistent device_id, beyond consent scope; carried 4 days | #2349 | (doc) — `context.page_snapshot` dropped entirely |
| **DIFF-0902-DURESS-EGRESS** | REGRESSION (I3) | `duress_configured` published to the Advisor snapshot — a coercion oracle on an untrusted backend | #2261 | (doc) — field dropped from direct publishers |
| **DIFF-0905-FLAGSECURE-CLEARABLE** | REGRESSION | `setSecureFlag(false)` cleared FLAG_SECURE with **zero** gate and no restore on crash/background — "needs no attacker at all" | `0fb35004` | (doc) — grant-gated, self-healing on pause/resume/destroy |
| **DIFF-0905-REVIEWPROMPT-RESIDUE** | REGRESSION | 3 review-prompt localStorage keys survived panic wipe **and** `inspectKeyMaterial()` still reported clean | #2336 | (doc) — added to `METADATA_RESIDUE_KEYS` + tests |
| **DIFF-0906-BUGREPORT-UPLOAD-NOAUTH** | REGRESSION | Upload endpoint never checked a reservation existed, was `reserved`, or matched size — any caller could write 52 MiB via the service-role key | `826bd1c8` | **grep**: `functions/api/bug-report/` absent; RPC allowlist entry gone |
| **DIFF-0906-BUGREPORT-SQL-POLICY** — [#2417](https://github.com/VEYRNOX/veyrnox/issues/2417) | REGRESSION | Storage RLS policy `FOR ALL` with no `TO` clause ⇒ applied to PUBLIC on the `bug-reports` bucket, where the intent was denial | #2418 (`56e2f07b`) | **live**: bucket, policy and tables absent on **all three** Supabase projects — the migration was never applied. See Regressed for the audit table and the two-vs-three enumeration gap |
| **DIFF-0831-HUAWEIRECEIPT** | NEEDS-REVIEW | HMS IAP receipts never signature-verified; entitlements granted from unverified JSON | #2191 | (doc) — new `HuaweiReceiptVerifier.kt`, SHA256withRSA, fail-closed, both purchase and restore paths |
| **DIFF-0831-WEBHOOKLOG** | NEEDS-REVIEW | Transak webhook log injection via unsanitised `eventID`/`orderId`/`status`, unbounded | #2190 | (doc) — `logSafe()` strips control chars, truncates to 64 |
| **DIFF-0903-WEBHOOK-HMAC-ORACLE** | NEEDS-REVIEW | Webhook HMAC verify in `warn` mode logged the full 64-char computed digest — a signing oracle the moment it flipped to `strict` | #2289 | (doc) — 8-char prefix, both sides |
| **GEM-0906-1 / -2** | HIGH / MED | `BackupPaywallNudge` and `ReferralPrompt` dismiss handlers wrote shared localStorage with no deniability re-check — the K-2 two-chokepoint gap, twice | #2375 | (doc) — both write paths re-check |
| **DIFF-0903-FIXME-CLOSED-ISSUE / #2275** | MED (I4) | 17 `test.fixme('#2275: …')` markers pointed at an **already-closed** issue — coverage that reads as deferred and tracks nothing | #2296 | **grep**: 1 `test.fixme` remains in `post-audit-validation.spec.js` (was 17); replaced by 20 real source-content pins |
| **DIFF-0904-QA-DEFERRAL** | MED (I4) | QA runner's deferral regex missed `test.describe.skip/fixme/only` and computed a Playwright report it never read — deferred e2e could report complete | #2310, #2352 | (doc) — missing/malformed report now yields `null` ⇒ recorded evidence gap, blocks a clean verdict |
| **DIFF-0829-REFERRALPROXY** | MED | Public proxy routes for revenue-attribution and earnings RPCs | `0bd0a8c0` | (doc) — routes removed, client fails closed |
| Others | SAFE/MED | Sentry send-time I3 re-check, WC panic-wipe IndexedDB residue, CSP font inlining, deploy-job split (PR code can no longer reach the Cloudflare token), CORS strict-origin, HSTS, canary `ref` allowlist, vault KDF ceiling 1 GiB→384 MiB, Keystone BTC `SIGHASH_ALL`, iOS Firebase opt-in gate | various | (doc) |

**Also closed, and worth naming as a category:** the **iOS `App.entitlements`
`appattest-environment=development`** defect (#2282/#2285) meant every archive through
1.0.1 build 47 requested Apple's *development* attestation servers — the iOS attestation
leg was **inert in distribution**, not merely unprovisioned. Fixed per build configuration.
Not archive-verified.

---

## ⚠️ Checklist drift — standing Step-2 checks that are now wrong

Left unamended these produce **false readings**. Three new this run.

| Check | Why it breaks | Correct check going forward |
|---|---|---|
| `H4: does twoFactorGate.js return an opaque error?` | **NEW.** File is `src/lib/twoFactorGate.js`, not `src/wallet-core/`. The old path greps empty, which reads as "open". | Assert against `src/lib/twoFactorGate.js`. Single opaque `WRONG: 'WRONG'` at `:32`, one message at `:77` (grep). |
| `DIFF-0823-VC: featureCatalogue.js:515 vs build.gradle:25` | **NEW.** Both line numbers moved — now `featureCatalogue.js:562` and `build.gradle:32`. | Assert on content, not line: the catalogue still says **versionCode 10**; `build.gradle` is at **47** (grep). Drift has widened from 24 to 37 versionCodes. |
| `H11: does ColdSign.jsx hardcode TIER.ALLOW?` | **Third run asking for this to be dropped.** File deleted in #1796. | **Delete the check.** |
| `M20/H-NEW-4: kek.js combineKek` | Carried. Module is `src/wallet-core/keystore/kek.js`. | `zero(ikm)` at `:248` **and** `:280`; `KEK_DOMAIN` correct at `:72` (grep). |
| `DIFF-0816-MAINSYNC: IntegrityGate.swift:88` | Carried. File is under `ios/App/CapApp-SPM/Sources/CapApp-SPM/`. | Still `DispatchQueue.main.sync` at `:88` — **still open** (grep). |
| `M-2 (07-08): hw-send.js Ledger/Trezor` | Both paths deleted in #2032. | Re-point hardware verification at `src/wallet-core/hw/digitalShield.js`. |
| `H6: BLOCKED_METHODS` | Carried. File is `src/wallet-core/evm/walletconnect/router.js`. | Present at `:48-53` — and `eth_signTransaction` is now **in** the set (grep). Drop the L-2/L-4 exception note. |
| `C6/H13: CryptoSigning.jsx useRef / copySecret()` | Carried. File rewritten; signing scoped inside `withPrivateKey(index, fn)`. | Assert no `privateKey`/`mnemonic` state and `copyPlain` for copies. |

Re-verified unchanged and still correct this run (grep): **C3** (`presignGateOrReject` ×7,
`proceedAllowed` ×9 in `WalletConnectProvider.jsx`), **H7** (`domain.chainId` bound),
**H15/H16** (`setIsStrongBoxBacked(true)` best-effort at `.kt:232`; `AUTH_DEVICE_CREDENTIAL`
appears **only** in the two comments recording its removal, `:23` and `:95`), **H-NEW-1**
(`EXPECTED_CERT_SHA256` from `BuildConfig` at `.kt:806`, blank ⇒ fail-closed), **M20**,
**RASP-A2** (two `?? TIER.BLOCK` sites in `SendCrypto.jsx`).

---

## Still Open ⚠️

| ID | Severity | Finding | File:Line | First reported |
|---|---|---|---|---|
| **M-1** (09-05) | MEDIUM | **RASP's OS-probe leg has no session latch**, so muting the native probe — including by hanging the bridge until `withFailClosedTimeout` fires — yields INTEGRITY_UNAVAILABLE → WARN, which **is** overridable by biometric + ack on a runtime where that boolean is itself forgeable. The Codex P2 latch covers only the *attestation* leg. **The file contradicts itself:** header `:17-18` promises `tier === TIER.BLOCK` on timeout/exception/shape-drift; inline `:46-47` says UNAVAILABLE → WARN. The inline comment matches the code; the header masks exactly this downgrade. **The doc half should be fixed regardless; the latch half conflicts with the recorded #2276 decision and needs an owner call, not a patch** | `getFreshRaspArtifact.js:17-18` vs `:46-47` (grep, both lines read) | 2026-09-05 |
| **M-2** (09-05) | MEDIUM | **KEK fast-path stores the RAW DEK, and the plugin's safety comment still argues the pre-refactor model.** `AndroidBiometricCachePlugin.kt:243` still says the cached blob "is useless without H (KEK = HKDF(H ‖ C))". Post-refactor the slot holds the raw DEK, so a stale-but-successful decrypt yields a directly usable key. The confidentiality argument no longer holds — only the gating does — and a future reader weighing a change against that paragraph weighs it against a model the code abandoned | `AndroidBiometricCachePlugin.kt:243` (grep) | 2026-09-05 |
| **M-3** (09-05) | MEDIUM (I4) | **The designated honest-disclosure API states the wrong Keychain protection class.** `biometricUnlock.js:188` sets `whenUnlockedThisDeviceOnly`; `:524`, inside `biometricUnlockSecurityMode()` — whose stated purpose is to surface the CURRENT protection level — claims `whenPasscodeSetThisDeviceOnly`. The classes differ behaviourally (iOS destroys the latter when the passcode is removed). **The code is correct and deliberate** (the documented class fails `errSecNotAvailable -25291` under palera1n); only the prose is wrong. Two prior weeklies cited this function as evidence of honest disclosure and 08-17 recommended rendering it in the posture UI — which would have shipped the false claim to users | `biometricUnlock.js:188` vs `:524` (grep) | 2026-09-05 |
| **M-4** (09-05) | MEDIUM (I4) | **The wrong-attempt limit and 10-strike auto-wipe exist on one unlock handler, not both.** `runPinUnlock` (`:1008+`) checks backoff, registers the miss, raises the session floor and fires `panicWipe` at 10. `runUnlock` (`:911-951`) — the password-cohort handler bound to the password field and both escape-hatch buttons — has **zero** counter references. The PIN cohort cannot side-step it, which is what keeps this MEDIUM. The honesty half is sharper: `featureCatalogue.js:180,271` and `deniabilityUnlock.js:13` promise the wipe with **no cohort qualifier** | counter refs at `WalletEntry.jsx:1150,1154,1158,1184`, all inside `runPinUnlock`; none in `911-951` (grep) | 2026-09-05 |
| **M-5** (09-05) | MEDIUM | `getSecretUnauth` is an auth-free secret retrieval built without `setUserAuthenticationRequired`; the only in-plugin gate is `rejectIfBlockTier`. Its documented safety rests entirely on an out-of-module caller passing `{kekEnrolled:true}` — no `kekEnrolled`, deniability, or biometric check in the plugin. **[AGENT]** — a lead, not re-derived | `AndroidBiometricCachePlugin.kt:176-205,448-459` | 2026-09-05 |
| **H-2** (08-25) | HIGH | **KDF v2 broke chaff↔real parity — future writes only.** A device that already wrote a mixed footprint under the shipped v2 build stays distinguishable; only a rekey heals it. #2356 made the reveal-time repair fail-safe when the pool is unreadable but does **not** close the distinguisher. Compounded by DIFF-0826: the stealth-pool regression was found to be **wider** than first described, also affecting `secondary`/`tertiary` slots, where a v2 `secondary` blob announces a configured duress PIN | `stealth.js`, `deniabilityKdfProfile.js` | 2026-08-25 |
| **M-5** (08-25) | MEDIUM | **iOS has no FLAG_SECURE equivalent.** #2354 hardened Android only. Confirmed at this pin: `FLAG_SECURE` appears in `MainActivity.java` and `RaspIntegrityPlugin.kt`; iOS has only the `UIScreen.main.isCaptured` read | `IntegrityGate.swift:82` (grep) | 2026-08-25 |
| **DIFF-0823-TIER** | MEDIUM (I3) | `bindOwnReferralCode()` egress is **demo-blind** — gated on `isDeniabilitySessionActive()` alone at three sites, covering decoy/hidden but not demo. On a demo session `getLocalState()` reads the **real** user's code from shared localStorage and transmits it to RevenueCat on every app start. **The project has now ruled in code five separate times that a demo-blind gate is a leak; this site is the last holdout** | `TierProvider.jsx:88,134,177` (grep) | 2026-08-23 |
| **DIFF-0823-CI** | MEDIUM | `ci_post_clone.sh:40` runs `npm install --no-audit --no-fund --legacy-peer-deps` on the path producing the **App Store archive**, so the shipped binary can be built from dependency versions never in `package-lock.json` and never reviewed; `--no-audit` disables the advisory check on that same path. **The script's own instruction — "on green sync flip this back to `npm ci`" — was satisfied on 2026-08-23 and remains unactioned 15 days later** | `ios/App/ci_scripts/ci_post_clone.sh:40` (grep) | 2026-08-23 |
| **DIFF-0823-BACKUP** | MEDIUM (I4) | Native seed backup marks the wallet **backed up before anything is backed up**. `window.print()` at `:119` is inside the web branch; `setPrinted(true)` and `confirmWalletBackup(selectedWalletId)` at `:122-123` run **unconditionally after it**. On native the user taps a button, gets a toast telling them to write the words down by hand, and the backup nag goes quiet on a device where no backup exists | `WalletSeedQR.jsx:119-123` (grep) | 2026-08-23 |
| **DIFF-0823-VC** | LOW (I4) | `featureCatalogue.js:562` — the **user-facing** honesty surface — still names "versionCode 10" and says a clean Pre-launch report "for versionCode 10" is pending. `build.gradle:32` is at **47**. Flagged at 33, then 34, now 47: **the drift is widening, not closing** | `featureCatalogue.js:562` vs `build.gradle:32` (grep) | 2026-08-23 |
| **DIFF-0830-QRSCAN** | LOW | The QR-scan WalletConnect entry calls `validateWcUri()` directly (`WalletConnect.jsx:93`), bypassing `QRScanner`'s 2048-byte payload ceiling. `validateWcUri` itself imposes no length bound — it trims, prefix-checks and index-scans — so topic/query parsing runs unbounded on a hot scan loop | `WalletConnect.jsx:93`, `session.js:135-147` (grep) | 2026-08-30 |
| **DIFF-0826-SESSTOKEN** | LOW | `ensureSessionToken()`'s writer is unguarded against the pre-hydrate race its reader (`SessionRevocationGuard`) handles; can orphan a session record, making revocation theatre. Practically unreachable — latent fragility | `SecurityCenter.jsx:93` | 2026-08-26 |
| **DIFF-0902-SHARD-PIN** | NEEDS-REVIEW | Native shard-restore re-wrap dropped a ≥16-char passphrase to an 8-digit PIN; the claimed compensating control (mandatory hardware-KEK re-enrol) does not exist as stated. **Severity re-rated down** by the report's own Correction 2 — the real gap narrows to a permanent-suppression edge case. Tracked #2257 | `RestoreFromShares.jsx:16` | 2026-09-02 |
| **DIFF-0902-BACKUP-V1-BREAK** | NEEDS-REVIEW | The combined-seal backup rewrite drops the legacy v1/v2 read path, so any pre-existing tester `.enc` is unrestorable. Fails honest, not silently — but it is an owner call, not a defect ruling | `vaultBackup.js` | 2026-09-02 |
| **DIFF-0902-SENDCRYPTO-ADDR-EGRESS** | NEEDS-REVIEW | `sender_address` and `rasp.tier` added to the advisor tx context and sent to `tip-chat` alongside a persistent device_id. Consent-gated, but plausibly exceeds the disclosed scope — check the consent copy before ruling | `SendCrypto.jsx:1218-1282` | 2026-09-02 |
| **DIFF-0902-ASSETID-FIRSTMATCH** | NEEDS-REVIEW | Four readers collapse a composite asset id to a bare symbol / first match. **Currently inert** (the duplicate rows were reverted) but a latent funds-misrouting risk if Phase 1b re-lands first. Correction 1 notes PR `74742f47` did **not** close it and removed the only in-code warning about it | `sendWalletSource.js:133`, `balanceDisplay.js:51`, `useReceiveDetector.js:100`, `walletMeta.js:81` | 2026-09-02 |
| **DIFF-0903-PORTFOLIO-CACHE-STALE** | NEEDS-REVIEW | Cached price data can render in a session that has transitioned to decoy; the hook does not consult the live demo flag. Same D-04 shape | `usePortfolioMarketData.js:19-40` | 2026-09-03 |
| **DIFF-0825-FASTPATH-DOC** | LOW (I4) | Three comments still describe the fast path as TARGET / opt-in / off-by-default after the code made it default-ON | `fastpathDekCache.js:13-30`, `AndroidBiometricCacheConfig.kt:89`, `FastpathToggle.jsx:4-7` | 2026-08-25 |
| **DIFF-0829-TIPSECRET** | NEEDS-REVIEW | `TIP_SIGNING_SECRET` was exposed in git history; scrubbed from the tree. Rotation across 3 Workers + 2 Supabase envs is **claimed** (#2152, `docs/tip-signing-secret-rotation.md`) but is operational state no static scan can confirm | `docs/SecurityAdvisor-TIP-integration.md:3` | 2026-08-29 |
| **DIFF-0905-GEMFILE-UNPINNED** | NEEDS-REVIEW | Unpinned `fastlane` gems and an unpinned Huawei AGC plugin run beside release signing credentials; `Gemfile.lock` gitignored. Fix claimed via #2342, **self-authored and unscanned** | `android/Gemfile`, `ios/Gemfile`, `.gitignore:20,25` | 2026-09-05 |
| **DIFF-0905-IOS-REPLAYKIT** | NEEDS-REVIEW | iOS ReplayKit plugin appeared ungated like Android's; the scan recorded this as **unfinished analysis rather than cleared**. Likely moot after the 09-07 feature removal, but never actually concluded | `BugReportPlugin.swift` | 2026-09-05 |
| **L-9** (09-05) | LOW (I4) | `WIPE_EXHAUSTED_EVENT` is dispatched at `copySecret.js:121` and **nothing in `src/` listens** — the only listener is inside a test. The "fail honest" half of the clipboard wipe still does not exist. Second-order: after a failed wipe the 30 s TTL is never re-armed. Carried from 08-25 M-8 | `copySecret.js:56,121` — zero production listeners (grep) | 2026-08-25 |
| **L-1..L-8, L-10..L-12** (09-05) | LOW | Fee ceiling keyed on a dApp-supplied field with a 1M gas fallback (L-1/L-2); `estimateGas` called without `from`; modal offers an approval affordance the handler can never grant (L-3); `assertPersonalSignAddress` dead and divergent with a 10-case suite reading as coverage (L-4); `scoreWcTxLevel` dead export with an inaccurate comment (L-5); stale RASP wiring comments (L-6); fast-path plaintext `ByteArray`s unscrubbed where the sibling H buffer is scrubbed (L-7); `enrollApi30` docstring claims a native reject the code does not implement (L-8); SendCrypto's `TwoFactorGate` uses the non-`bricked`-aware verifier so an OOM verifier reads as "Incorrect PIN" five times (L-10); `assertPasskeyFactorSatisfied` never called and contradicts shipped behaviour (L-11); equalizer's fifth KDF straddles the visible outcome (L-12, carried, **not attempted** in the 08-25 wave) | various — all **[AGENT]**, none re-derived | 2026-09-05 |
| **L-3..L-8** (08-25 carried) | LOW | Pre-modal chain check for `eth_sendTransaction`; EMULATOR danger-monotonicity; ≤60 s-stale artifact on seed surfaces; iOS `reject:` arg order; iOS permanent-invalidation route; `changePassword` leaves old PIN cached | per 08-25 remediation table — several marked FIXED there but **not re-derived this run** | 2026-08-17 |
| **DIFF-0816-REJECT** | LOW | `RaspIntegrityPlugin.kt:146` still carries the `(code, message)` swap that #1835 fixed in its two siblings: `call.reject("PROBE_CANARY_FAILED", "INTEGRITY_UNAVAILABLE", e)`. The pinning test asserts only `toContain('RASP_BLOCK')`, so it could not have caught the original and cannot catch this one. **Note the recurrence risk is proven** — #2086 reintroduced this exact defect at a new site hours after #2066 fixed all 17 | `RaspIntegrityPlugin.kt:146` (grep) | 2026-08-16 |
| **DIFF-0816-MAINSYNC** | LOW | `checkScreenCapture()` calls `DispatchQueue.main.sync` when off-main; Capacitor dispatches plugin calls off the main thread, so this deadlocks if main is ever blocked on that queue | `IntegrityGate.swift:88` (grep) | 2026-08-16 |
| **DIFF-0730-MT** | MEDIUM (I4) | `MACHINE_TRANSLATED` is keyed by **locale** and gates the whole "machine translated, not reviewed" banner, but the review that cleared it covered only `security.json` (~249 of ~860 strings). ~71% of each locale — including the biometric backup-exposure acknowledgement and the reset/wipe confirmation in `wallet.json` — is unreviewed MT with no disclaimer. es, pt-BR and fr are all still `false`, and the source comments say `security.json reviewer-approved` **on the locale-wide flag**, so the mismatch is visible in the code | `src/i18n/index.js:83,86,87` (grep) | 2026-07-30 |
| **DIFF-0809-GOV** | GOVERNANCE | A hand-rolled GF(2⁸) Shamir implementation sits on the path holding a DEK share, against CLAUDE.md's "No custom crypto primitives" rule. **This window supplies the argument for the rule**: the *library* swap (`@stablelib/tss`) is what carried the coefficient-reuse CRITICAL, and the audited wrapper is what caught it. Either way this belongs as a named item in the outstanding independent-audit scope, not something the audit discovers | `src/wallet-core/shamir.js`, `docs/cloud-recovery-shard-spec.md:108` | 2026-08-09 |
| **DIFF-0822-CODERABBIT** | INFO | `.coderabbit.yaml` routes the full contents of a private repository — `sql/**`, `supabase/functions/**`, native signing code, every future diff on every branch — to a third-party AI service. A deliberate product decision, recorded so the source-code egress surface is on the record | `.coderabbit.yaml` | 2026-08-22 |
| C-6 / C1 / weekly M-8 | CRITICAL | PIN attempt counter in clearable `localStorage`; no non-clearable backstop. Honestly disclosed in-source as an "Accepted software limit", so no I4 violation. The unwritable-store half is now mitigated by the session floor (08-25 M-9) but not persisted | `pinAttemptGuard.js:110-124`, `WalletEntry.jsx:982` (grep) | 2026-06-26 |
| C2 | CRITICAL | 8-digit PIN offline-exhaustible on non-KEK vaults | `vault.js`, `keystore/native.js` | 2026-06-26 |
| H10 | HIGH | Cert pinning — **16** SPKI entries still `PLACEHOLDER_*_REPLACE_ON_DEVICE`, unchanged from the last two runs | `src/wallet-core/rpc/pinning.js` (grep) | 2026-06-26 |
| H1 / H2 / BIO-01 / H-NEW-5 | HIGH | Biometric unlock cache not OS-ACL bound to the enrollment set. **iOS remains TARGET by owner decision 2026-08-25** — the cache is read *before* H exists (`WalletProvider.jsx:2176-2181`), so all three candidate designs touch the unlock path itself; getting it wrong locks users out of their own wallets | `biometricUnlock.js:84-104` | 2026-06-26 |
| BIO-02 | HIGH | App-layer biometric gate Frida-bypassable (fundamental; disclosed) | `biometricUnlock.js:18-36` | 2026-07-05 |
| H5 | HIGH | `captureVerifierSafe` OOM bricks the send gate for the session. Partly mitigated (#1643); 09-05 L-10 shows one surface still uses the non-`bricked`-aware verifier | `credentialVerifier.js:64` | 2026-06-26 |
| H-3 (07-01) | HIGH | Android biometric lockout → device-credential fallback (accepted deviation) | `BiometricService` | 2026-07-01 |
| G2-ROOTCERT-PIN / **#2276** | HIGH → accepted residual | Play Integrity root pin has no real-token evidence and pin failures map to INTEGRITY_UNAVAILABLE → WARN, not BLOCK. **CLOSED 2026-09-04 as accepted residual** (owner decision); DoD 3 and DoD 4 deliberately unmet. If reopened, do DoD 4 **before** DoD 3 — tightening first arms the sticky latch into a self-renewing BLOCK on genuine devices. Now also in tension with 09-05 M-1, and that tension is undocumented in both places | `PlayIntegrityJwsVerifier.kt`, `attestation.js:298` | 2026-07-15 |
| **#2275** | MED (I4) | 17 security e2e assertions were inert. **Largely closed** — 1 `test.fixme` remains and 20 real source-content pins replaced the phantom targets (#2296). Retained at low weight until the last marker clears | `e2e/post-audit-validation.spec.js` (grep) | 2026-09-03 |
| RASP-A1 | HIGH | RASP browser probe is a module-load snapshot (partly addressed by P2-1) | `browserProbe.js:76` | 2026-07-05 |
| D-04 | HIGH | I3 egress race: `isDecoy` React state lags the module flag. **Both realisations closed this run**, but the class keeps producing new sites — three Advisor-egress recurrences in this window alone | `WalletProvider.jsx:316-321` | 2026-07-05 |
| C-7 / **#1111** | MEDIUM | Vault AAD v:3 — rated FIXED by the 08-17 weekly (`native.js:834-846`, PR #1649). Retained at lower confidence; the migration flag's live state was not re-derived this run either | `vault.js:274` | 2026-07-20 |
| P2-2 / M-K / M-1 (07-08) / PW-01 | MEDIUM | WC signing timing side-channel; passkey `signCount` not persisted; EVM private key unzeroable (ethers v6, accepted residual); in-app guarded wipe requires no re-auth | various | 2026-06-28 → 2026-07-15 |
| weekly M-4 / M-6 / L-1..L-8 (07-14) | MED/LOW | RASP-blocked WC request fails silently in the UI; RaspSecurity under-claims RASP status; `checkSystemWritable` weak; negative `txGas` unclamped; duplicated chainId helper; stale modal identity; iOS cancel misclassified; Android salt unzeroed | various | 2026-07-14 |
| L-2 (08-03) | LOW | RASP detection-chain doc drift between the Kotlin plugin's comments and `nativeProbe.js` — and 09-05 L-6 reports the same drift at two further sites | `RaspIntegrityPlugin.kt:35,73` | 2026-08-03 |

**Accepted-residual / by-design:** M1–M19, L1–L10 (06-26); M-NEW-1…12 (06-27);
F-05/F-11/CS-1/SC-1/RASP-2/RASP-4/RASP-5 (07-04);
D-01/D-02/D-05/D-06/SW-01/SW-02/PW-02/PW-04/PW-05/AL-01/AL-02/AL-06/BIO-03/BIO-05/BIO-06/BIO-07/RASP-A4
(07-05); `stream-json`/`jayson` (unreachable path, verified empirically; an override breaks
`jayson`). Consult the source audit for per-item rationale.

**Refuted on verification** (recorded so a future pass does not re-file): ROOTED→WARN
biometric ladder; "Play Integrity uses JWE not JWS"; "heuristic root checks fail open
per-check"; JS↔native bridge integrity; `HARDWARE_FACTOR_DEGENERATE` wipe-counter miscount;
2026-07-20 weekly H-2 (ColdSign — file since deleted); the 08-23 Gemini sweep's "corrupted
JSDoc tags" (fabricated).
**New this run:** the 09-05 weekly's **"fast-path cache survives passkey registration"** —
the read-path gap is real (`unlockBiometricOnly` has six gates and no passkey check) but
the consequence is not: `passkey.js:110-134` clears the fast-path slot on any registration
flip, with a comment naming this exact scenario. **Residual kept, narrower than the
original claim:** that clear is fire-and-forget with errors swallowed, and the read path has
no gate behind it, so a failed clear leaves a readable cache with no backstop.
**Four of the six 09-06 Gemini findings are fabricated or misfiled** — three CRITICALs
claiming `SeedVerification.jsx` / `SeedGrid.jsx` / `SeedInputGrid.jsx` lack their own
deniability gate (they are presentational children; the gate sits upstream), and one LOW
calling `SeedVerification.jsx` a dead file with no imports (it has six importers and a
test). Every line number in that sweep was a corpus byte-offset, not a file line.

---

## Needs On-Device / On-Chain / Live-Backend Verification 📱

| ID | Finding | Why verification is needed |
|---|---|---|
| **H-3 PRODUCTION REVOKEs** | The database every prior analysis queried was *staging* (`nszlbcmcysftwyudthjz`, which is **named** `veyrnox-prod`). Production is `jwstkrtslotnjyerzzsi`. STAGE 1 of `sql/live-project-hardening-2026-08-07.sql` was applied; **STAGE 2 remains commented out.** Whether `SUPABASE_SERVICE_ROLE_KEY` is set on the Pages project, and in which scope, is dashboard state. Re-verify against the ref the shipped bundle connects to, never a project name |
| **`ENVIRONMENT` / service-role scope** | `wrangler.toml` declares the variable and `[fn].js` 503s in production without the key, but the canary lane publishes a **third standing public deployment** on the same Pages project. If the key is bound outside the Production scope, the allowlisted RPCs are callable without RLS from an extra hostname. `ALLOWED_RPCS` is closed and rate-limits fail closed — an open question, not a demonstrated defect |
| **`register_referral_code` / `ai-referral-attribution-plan-family.sql`** | Return-type change `void`→`text` read by `referralApi.js`, and a `CREATE OR REPLACE` preserving the H-3 REVOKEs — both **CODE only, not yet run against either project**, per the standing rule that production DDL follows the merge |
| **RC referral chain end-to-end** | #1703 and #1704 were fixed **together** in #1955 — the coordinated release CLAUDE.md demanded. Whether the chain grants correctly needs a real purchase plus RC dashboard webhook configuration, neither of which has happened |
| **`TIP_SIGNING_SECRET` rotation** | Claimed across 3 Workers + 2 Supabase envs (#2152). Operational state; unverifiable statically. Until confirmed, treat the historical git-history exposure as live |
| **`tip-chat` `vault:` strip deploy state** | Stripped in repo state (#1761); no in-tree evidence `tip-chat` was redeployed |
| **RASP on a Play-delivered install** | `detectTamper()` on a real internal-track install. Still gated by the 1.0.1 pre-submission hold. No Play Pre-launch report exists for **any** versionCode; #1960 closed 2026-09-04 as accepted residual, with Firebase Test Lab (265 UI actions clean on versionCode 41) as the substitute gate |
| **1.0.1 golden path on an untouched device** | Play rejected build 5 because Create Wallet failed on stock hardware. Unresolved by any static pass |
| **iOS App Attest, as shipped** | New. #2282/#2285 fixed `appattest-environment` per build configuration, but **not archive-verified**. If codesign rejects `production`, delete the key (omission also means production) rather than reverting to `development` |
| **Fast-path × duress** | **The single largest coverage gap on the auth surface** per the 08-25 weekly: two fast-path test files, zero mentions of duress/panic/decoy. #2071 wrote the three tests the old comment falsely claimed existed — device behaviour still unexercised |
| **iOS native wave (#2094)** | **Every iOS native change in the 08-25 wave was written, reviewed and merged without being compiled or run on hardware.** Three separate claims rest on `errSecItemNotFound` being what an enrolment change produces; cancel-vs-mismatch attribution must be tested in both directions; and that `HardwareKekPlugin.m` compiles at all is itself item 3 |
| **Android Enclave alias `.v1`→`.v2`** | `EnclaveKeySpecConfig.kt:54` bumped the alias with no legacy lookup. The in-file comment says existing users hit an absent `.v2` alias and re-enrol KEK on their next PIN unlock — a documented migration path, never exercised on a device that holds a `.v1` key |
| **Digital Shield** | Sole hardware-wallet path since #2032. Response verification reads strong — per-request session TTL, single-use replay guard, SHA-256 binding hash, per-chain signer proof, per-input PSBT compare, and now `SIGHASH_ALL` enforcement on Keystone BTC (#2272) — but no physical device has ever signed through it and no txid exists |
| **iOS XCUITest signal** | Of 30 consecutive runs: **22 cancelled, 7 running, 1 success** — `concurrency.cancel-in-progress` on this repo's merge rate, with `continue-on-error: true` reporting green regardless. A suite that completes once in thirty attempts and reports green when it fails is not telling anyone anything. Owner call, disclosed not fixed |
| **Firebase tripwires** | Android artifact-level guards (#1782) live in `workflow_dispatch`-gated jobs and have never executed |
| **iOS webview payload freshness** | `ios/App/App/public` is gitignored and `xcodebuild archive` does not rebuild it. Compounded by `ci_post_clone.sh` building the archive from an unpinned `npm install` |
| H-NEW-1 / H10 / iOS App Attest / C-1 v2→v3 / C-3 / C-4 | APK tamper detection on a repackaged APK; 16 placeholder SPKI pins + MITM-proxy validation; entitlement wiring; Android KEK salt migration; native H residue on both platforms (heap dump — and the unzeroable `String` copy means a dump would still be expected to yield H) |
| weekly H-1 (07-14) / 2026-07-20 weekly H-1 | Timing equalisation and WC session-approval BLOCK — both code-correct, both unmeasured on a hooked device. The 09-05 weekly verified the KDF ledger by hand at 5 derivations on all three outcomes; wall-clock is still unmeasured |
| M13 / M14 / RASP hostile-device | FLAG_SECURE + WebView CDP disable on a real release build; rooted/jailbroken/Frida session with an on-chain txid |
| Safety Plus IAP | **Corrected this run.** One real production purchase exists (`safety_plus_monthly_v2`, App Store, 5.99, active since 2026-08) — but `original_offer_type: "No offer"`. **No promotional-offer path has ever been exercised by a real purchase, on either platform**; none of the 10 store-side offers is verified end to end |
| `@scure/bip32` zeroization | Whether the `privateKey` getter returns the internal buffer or a copy was **not** verified — package body absent from the checkout |
| Independent audit | Entire KEK + vault-cipher + Shamir + Digital Shield + S1–S4 surface. **Still outstanding** — no internal, ECC-skill, Codex, Gemini, or CodeRabbit pass substitutes |

---

## Regressed 🔴

**No finding is currently in a regressed state**, down from two at the start of this
window and one at first writing. Both prior Base44 regressions closed (above), and
DIFF-0906-BUGREPORT-SQL-POLICY closed 2026-09-07 — see below.

### DIFF-0906-BUGREPORT-SQL-POLICY — CLOSED 2026-09-07

[#2417](https://github.com/VEYRNOX/veyrnox/issues/2417), closed. `sql/bug-report-upload.sql`
created `bug_reports_service_role_all ON storage.objects FOR ALL USING
(bucket_id='bug-reports') WITH CHECK (bucket_id='bug-reports')` with **no `TO service_role`
clause**, so it applied to PUBLIC — a *permissive* policy over that bucket for anon and
authenticated, where the intent was denial. `service_role` bypassing RLS was correct but
irrelevant: *because* it bypasses, the policy's only observable effect was on the roles it
was meant to exclude. **The comment defending it (`:184-187`) was the hazard**, because it
is what a future reader would have weighed a change against.

**Closed by [#2418](https://github.com/VEYRNOX/veyrnox/pull/2418)** (merged `56e2f07b`),
which drops the policy rather than adding `TO service_role` — deny-by-default is the
stronger control. **[#2421](https://github.com/VEYRNOX/veyrnox/pull/2421) deletes the file
outright and is in flight at this pin; this row does not depend on it either way.**

**Live-project audit: the migration was never applied. Anywhere.** This is the negative the
issue existed to establish, recorded here because the previous version of this row
predicted it was "the one nobody writes down":

| Project | Ref | Bucket | Policy | Tables | `storage.objects` RLS |
|---|---|---|---|---|---|
| Veyrnox PRODUCTION (live) | `jwstkrtslotnjyerzzsi` | absent | absent | absent | enabled |
| veyrnox-STAGING (not production) | `nszlbcmcysftwyudthjz` | absent | absent | absent | enabled |
| veyrnox-staging (us-east-2) | `yrqzwqywxfesmbvhzjgj` | absent | absent | absent | enabled |

The vulnerable policy existed only in repo source. No corrective DDL was needed against any
project, and no bucket contents exist to purge.

**The audit's first pass enumerated two projects; the account has three.** #2417's audit
comment, #2418 and #2421 all say "both projects" / "either live project", naming only
`nszlbcmcysftwyudthjz` and `jwstkrtslotnjyerzzsi`. `yrqzwqywxfesmbvhzjgj` — ACTIVE_HEALTHY,
created 2026-07-29 — was never queried until the 09-07 branch review queried it. **The
conclusion survived the widening; the method did not.** Two of the three projects carry
"staging" in their name and one is *named* `veyrnox-STAGING (not production)`, so a
hand-listed pair reads as exhaustive when it is not. Standing rule for any future
live-backend audit: **enumerate projects from the API, never from memory or from a prior
report's ref list.** Same failure as the grep-list findings in this corpus — a search list
is a floor, not a ceiling — applied to infrastructure instead of source.

**The sanity check the file offered could not detect the defect.** `SELECT * FROM
storage.objects WHERE bucket_id = 'bug-reports'` (`:189-191`) returns zero rows for `anon`
on an empty bucket whether or not the policy is correct, so it passed vacuously — plausibly
why the defect shipped past review. Same class as 08-25's `spyOn` that patched an object CI
did not resolve and 08-26's `fastpathButtonVisible = false`: **a check that cannot fail
reads as coverage and is not.**
[#2420](https://github.com/VEYRNOX/veyrnox/pull/2420) rewrote that block to assert
`relrowsecurity` first and wrap the role switches in `BEGIN`/`ROLLBACK` (`SET LOCAL` outside
a transaction warns and is discarded, so the switches were no-ops and the assertions ran as
the editor's own role). It **merged** 2026-09-07 (`c0178ff5`).

**The lesson is recorded here, not in the file, because the file does not survive.** #2420
improved the verification block and #2421 deletes the file that contains it — the two PRs
edited and removed the same 250 lines. #2420 landed first, so #2421 simply deletes the
improved version; there was no conflict to resolve, and no reason to sequence them the
other way. **The net effect is that the better check existed on `main` for a matter of
minutes and then was deleted, which is the correct outcome for a migration whose feature is
gone but a poor place to leave a durable lesson.** Hence this paragraph.

Both regressions in the previous window (`WalletConnectProvider` and `WalletPortfolioPage`
Base44 seals) are closed. Historical regressions on record (re-fixed; preserved, not swept
away): the release/debug cert guard (**four** regressions, survived ~15 merges because its
test was gated to `main`-only so no PR could fail on it); the iOS `reject:` arg swap
(re-introduced by #2086 at a new site hours after #2066 fixed all 17, caught by a required
tripwire, repaired in #2085); telemetry consent; C-1 KEK salt binding; C-01 RASP pre-sign
gate; ECC F-P3-3; Digital Shield send-gate bypass; `screenAssetContract` I3 egress.

---

## Patterns worth naming, from this window

**1. The vulnerability was not in the diff — the excuse for a test change was.** The
Shamir CRITICAL was reached by disbelieving a one-line rationale for making a test
deterministic, then reading the library's own source to check the arithmetic. Nothing in
the code diff was wrong. This is the strongest argument yet for the repo's standing
"align tests with the new flow" smell: **a test edit is a claim about the code, and a claim
with implausible numbers in it is a lead.**

**2. Deleting a feature closes its code findings and none of its deployed state.** Three
bug-report findings died with the feature; the SQL policy did not, because it may already
live in a database. A removal is not a rollback. **Anything a feature applied to an
external system — a migration, a bucket, a webhook, a dashboard setting — survives the
commit that removes the feature**, and the deletion makes it *less* visible, not more.
The audit this forced came back negative — the migration had never run on any project — but
**the negative is the result of asking, not a reason not to ask.** The lesson stands on the
question being mandatory, not on which way it resolved; and the first pass at answering it
checked two of three projects, so the widening mattered even though the verdict did not
change.

**3. A fabricated finding is now the majority output of one tool.** The 08-23 Gemini sweep
produced 4 findings, 1 fabricated. The 09-06 sweep produced 6, of which **4 are fabricated
or misfiled** — including three CRITICALs resting on the same misreading (a presentational
child component "lacks" a gate that sits upstream in its parent). Every line number in both
sweeps was a corpus byte-offset. The sweeps remain worth running — GEM-0906-1/2 were real,
fixed in #2375, and were the K-2 two-chokepoint gap recurring — but **the ref-check is not
overhead around the tool, it is the load-bearing half of it.** An unverified sweep folded
into this tracker would have created three permanent phantom CRITICAL rows.

**4. A truncated grep nearly filed a false FIXED, in this very run.** Checking
DIFF-0823-BACKUP, `grep -rn 'confirmWalletBackup' src/ | head -5` returned five hits, none
in `WalletSeedQR.jsx`, which reads exactly like "the call is gone". A scoped re-check found
**two** hits in that file — `:123` still calls it unconditionally after the web-only
`window.print()`. The finding is open and was one `head` away from being recorded closed.
CLAUDE.md's rule is that a search list is a floor; the sharper form is that **a truncated
result is not a search result at all**, and `| head` on a verification grep is the same
class of error as the `-F` bug: it fails silently, in the dangerous direction.

**5. Documentation defects are now the plurality of open findings, and three of them sit
inside the honesty machinery itself.** 09-05 M-2 (a KEK comment arguing a model the code
abandoned), M-3 (the designated disclosure API stating the wrong Keychain class), and M-1
(a file header promising BLOCK where its own inline comment and code say WARN) are all
prose, and all three are load-bearing: two prior weeklies cited M-3's function *as evidence
of honest disclosure*, and 08-17 recommended rendering it in the posture UI, which would
have shipped the false claim to users. **A wrong comment in a security file is not a
cosmetic defect when the comment is what the next change gets weighed against.**

**6. The honesty check's own false negatives are the best documentation of the search
lesson.** `docs/honesty-check-2026-08-31.md` flagged two shipping features as unimplemented
and was wrong both times — Vigil-over-simulation and phishing-domain detection are both
BUILT. Root cause in both: searching marketing verbs (`advisor.*simulation`, "detects")
instead of implementation nouns (`TransactionIntelligencePanel`, `advisorTxContext`,
`knownBadDapps`, `phishingFeed`), plus conflating the address-keyed `threatIntelStore.js`
with the domain-keyed phishing store. Zero code changes; the report's value was the
correction.

**7. Two audit passes now disagree in the open, and that is an improvement.** 09-05 M-1
recommends giving the RASP OS leg the same session latch attestation has; issue #2276
deliberately keeps pin/chain failures at WARN *because* that latch would self-renew into a
BLOCK on genuine devices. The weekly **declined to adjudicate**, recorded the tension, and
split off the documentation half as independently fixable. Compare the previous window's
failure mode — a closed finding kept alive by a document nobody re-derived. **A recorded
disagreement outperforms a confident carried row.**

**8. `[VERIFIED]` vs `[AGENT]` should propagate into this tracker.** The 09-05 weekly is
the first to separate "the coordinating session re-derived this" from "an agent reported it
with a refutation trail". That distinction is exactly what the `(grep)`/`(doc)` split does
here, and it caught something: the one finding that turned out to be REFUTED was an
`[AGENT]`-class lead whose author flagged that the compensating control might live outside
its file set — **the honest hedge is what made the refutation cheap.**

---

*Automated weekly tracker. Static analysis only — does not substitute for on-device,
on-chain, or live-backend verification. "FIXED" = the code change is present on
`origin/main`; it is not a claim the control is verified working. SQL migrations are
counted as unexecuted text until their own verification queries have been run against the
**live project confirmed from the shipped client bundle**, not from a project name — and,
per this run's Regressed row, a migration's removal from the repo is not evidence of its
removal from a database. The independent third-party audit remains outstanding and is not
substituted by any internal, ECC-skill, second-model (Codex), long-context (Gemini), or
third-party-reviewer (CodeRabbit) pass.*
