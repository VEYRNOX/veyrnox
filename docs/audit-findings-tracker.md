# Audit Findings Tracker
Last updated: 2026-07-28
Analysed against: origin/main @ `758aeb958ae2077a27a49f6a47c54f26da13edb8`
(clean branch worktree cut from `origin/main`, per Step 0 — not the live checkout,
not a fallback `git show`).

> Automated weekly synthesis of every finding across the audit corpus, checked against a
> **pinned snapshot of `origin/main`**. **Static analysis only.** "FIXED" means the code
> change is present on `main` — it does **not** mean the control is verified working
> on-device or on-chain. Rows tagged `(grep)` were re-verified against source this run;
> rows tagged `(doc)` carry the status recorded in an audit doc or PR history and were not
> independently re-checked.

## Sources synthesised
- `audit-2026-06-26-login-dapp-rasp-kek.md` — C1–C5, H1–H16, M1–M20, L1–L10
- `audit-2026-06-27-rasp-wc-kek-auth.md` — C6, H-NEW-1…H-NEW-6, M-NEW-1…M-NEW-12
- `audit-2026-06-28-internal-static-analysis.md` — H-NEW-A…H-NEW-D, M-A/B/F/G/H/I/J/K
- `audit-2026-07-01-kek-internal.md` — C-1, F-01…F-08, H-1…H-4, iOS-F3/F5/F6/F9/F11
- `audit-2026-07-04-internal.md` — F-04 (CRIT), F-01…F-10, RASP-3, I3-WC, I3-1
- `audit-2026-07-05-deniability-internal.md` — D-02/04/05/06, SW-01/02, PW-01/02/04/05,
  AL-02/06, BIO-01…07, RASP-A1…A4
- `audit-2026-07-14-weekly.md` — C-1, H-1, M-1…M-8, L-1…L-8
- `audit-2026-07-15-rasp-multi-tool-cycle.md` — 2×P1, 10×P2, 5×P3 + 4-audit chain
- `audit-2026-07-20-weekly.md` — H-1, H-2, H-3, M-1…M-8, L-1…L-3 *(its own H-1/H-2/H-3/C-1
  labels are DISTINCT from the identically-named rows from earlier docs; always qualified
  below as "2026-07-20 weekly …")*
- **`audit-2026-07-23-branch-review.md`** — F-1, F-2 *(NEW source since last run)*
- **`docs/security-diffs/diff-2026-07-2*.md`** — daily scans 07-21 … 07-27
  *(**NEW source class this run.** Previous trackers cited only `audit-*.md` + triage +
  `security-audits/`. The daily scans carry real, distinctly-labelled findings — four of
  the eleven closures below originate there and none of them appears in any `audit-*.md`.
  Folding them in is a scope correction, not new analysis.)*
- **2026-07-27 branch review** — 10 findings, recorded in `CLAUDE.md` and
  `docs/Feature-Status.md`; PRs #1409 (`fbb5b942`) / #1410 (`9b50268d`). **No
  `docs/audit-2026-07-27-*.md` file exists** — worth creating for parity with 07-20/07-23.
- **PR #1262** ("branch-review", `claude/fix-c1-k2-deniability`) — C-1 (CRITICAL) and K-2,
  its own labels (qualified below as "2026-07-20 branch-review …")
- Also scanned: `docs/audit-triage/` (28 files) and `docs/security-audits/` (11 files) —
  no finding IDs beyond those already catalogued.

## Summary
- Total findings catalogued: **~138** (dedup across the docs above; MEDIUM/LOW grouped)
- Fixed (code-confirmed): **~92** (11 closed this run)
- Still open / accepted-residual: **~34** (1 new this run)
- **Regressed: 1** (ECC F-P3-3 — first non-zero regression count since this tracker began)
- Needs on-device / on-chain / live-backend verification: **21**

---

### Movement since last run (2026-07-21 → 2026-07-28)

`main` moved `b86a39ac` → **`758aeb95`** (**108 commits** — the largest window this tracker
has covered). **Eleven findings closed, one finding REGRESSED, one new finding opened, and
a five-item SQL hardening set landed as unexecuted migration text.**

#### Closed this run

| Finding | Severity | Fixed in | Evidence |
|---|---|---|---|
| **DIFF-0726-CONSENT** (I2 + I4) — telemetry consent was enforced only inside `analytics.js emit()`, and **all 13 pre-existing call sites call `trackEvent()` directly**, bypassing it. Declining consent stopped nothing. | HIGH | `434718d6` (#1346) | **grep**: gate moved to the single egress chokepoint — `src/api/trackEvent.js:33` `if (!hasConsent()) return;`, after the `:21` DEMO/deniability short-circuit |
| **DIFF-0727-TRACKING** (I3) — decoy/duress sessions wrote `veyrnox-wallet-ready-fired`, `-first-inbound-fired`, `-first-send-fired`, `veyrnox-holdout` to shared localStorage **and burned the once-per-install flag**, so the real session's milestone never fired | MEDIUM | `0295898a` (#1399) | **grep**: `tracking-integration.jsx:80` `suppressed()` = `DEMO \|\| isDeniabilityOrDemoActive()`, called at `:94` (before the read), `:154`, `:312`. `cancelReminders()` correctly **not** gated |
| **DIFF-0723-DEVICEID** (I3 + I5) — `veyrnox-device-id` was in no panic-wipe residue list, so a wiped device kept the key (install tell) **and** the next real session's rows joined to the pre-wipe rows server-side | MEDIUM | `434718d6` (#1346) | **grep**: `panic.js:258-260` adds `veyrnox-device-id`, `veyrnox-telemetry-consent`, `veyrnox-holdout` to `METADATA_RESIDUE_KEYS` |
| **DIFF-0727-ROLLBACK** — `rollback.yml` interpolated `github.event.inputs.deployment_id` into a `run:` block twice, once inside backticks — a real command-injection primitive | MEDIUM | `34f5da31` (#1398) | **grep**: raw value now reaches the shell only via `env: RAW_DEPLOYMENT_ID` (`:59`); an anchored-UUID validate step publishes `steps.dep.outputs.id`, which both the wrangler `command:` (`:92`) and Post summary (`:97`) read |
| **BR-0723-F1** — `keystore.properties` `storeFile` resolved against `android/` instead of `android/app/`, so the release-signing path was **dead** (`Keystore not found`) | MAJOR | 2026-07-23 (per-spelling `ksBase`) | (doc) `audit-2026-07-23-branch-review.md`; release build verified end-to-end on the release machine |
| **BR-0723-F2 / issue #1373** — release/debug-cert guard fail-open and inert. **Fourth regression of the same control** (#1310 added → #1313 dropped → #1325 restored → #1338 caught → inert until now) | MAJOR | `cfa939f1` (#1386) + `ffe795ed` (#1391) | **grep**: both branches throw rather than returning null; **the regression test now runs on PRs** — `release-guard-scope` (`ci.yml:338`) + `release-cert-guard` (`:391`), previously gated to `main`-only so no PR could ever catch it. Escape hatches `-PALLOW_MISSING_DEBUG_KEYSTORE` / `-PALLOW_UNREADABLE_UPLOAD_KEYSTORE` **verified absent** from `.github/` and `scripts/` — the guard is live |
| **BR-0727-I3LOG** (I3) — `WalletEntry.jsx` wrote `isDemo` — i.e. **whether the session is a decoy** — to the console on every render. Was live on `main` | HIGH | `fbb5b942` (#1409) | **grep**: the file's only remaining log is `:988` `if (import.meta.env.DEV) console.error(…)`. No bare `console.log` |
| **BR-0727-CONSENT-REASK** (I4) — `setConsentDone(false)` in the KEK enrol/skip handlers re-showed the "one-time" consent screen on **every unlock** for anyone who skipped KEK, and each re-prompt **overwrote a stored "denied"** | MEDIUM | `fbb5b942` (#1409) | **grep**: `WalletEntry.jsx:470` seeds `consentDone` from `getConsentState() !== null` at mount; `:651-657` comment pins that neither KEK handler touches it; `:1175` also gates on `!isDeniabilityOrDemoActive()` |
| **BR-0727-TESTS** — PR #1403 **edited two regression tests to assert the bug**, clicking through a consent screen that should never appear (`getConsentState` is mocked `'granted'` there). Green pipeline, bug shipped | HIGH (process) | `fbb5b942` (#1409) | **grep**: `WalletEntry.kek-gate.test.jsx:216,232` now assert `queryByTestId('consent-dismiss')).toBeNull()` |
| **BR-0727-SEND** — Continue gated on `isFormAmountWellFormed` (rejects `1e-8`, `1,5`, `1.2.3`, `1.`) but the error helper returned `null` for all of them: the button did nothing and said nothing | MEDIUM | `9b50268d` (#1410) | **grep**: `sendAmountError.js:67` returns `'malformed'`, fed **the gate's own verdict** (`wellFormed`) so message and gate cannot drift |
| **BR-0727-PRICING** (I4) — "Save 30%" / "4 months free" hardcoded beside offer-adjusted prices they were not derived from; monthly and annual resolve via two *independent* `offerPriceInfo()` calls, so annual could be the **worse** deal under a 30% badge. "4 months" was wrong even at USD base (3.65) | MEDIUM | `9b50268d` (#1410) | **grep**: `src/lib/annualSaving.js:38-47` returns `null` on any non-finite/non-positive input → render no claim (I4); `Subscription.jsx` prices use `.mono-value` |

#### Regressed this run 🔴

| Finding | What broke |
|---|---|
| **ECC F-P3-3 (#1160)** — first-run security walkthrough | PR #1403 **deleted `src/components/FirstRunTour.jsx` and its placement test undocumented**. The tour was the remediation for ECC finding F-P3-3 (users get 80+ features with no walkthrough); removing it **reopens the finding**. **grep-confirmed**: no `FirstRunTour*` file under `src/`, zero `veyrnox-first-run-tour` references. Now recorded honestly in `docs/Feature-Status.md:1421` as HONEST-DISABLED with the orphaned localStorage keys and the revert path (`de8cb829^`) — the documentation is correct; **the remediation is gone**. |

#### Opened this run

| ID | Severity | Finding | Evidence |
|---|---|---|---|
| **DEP-PIN** | LOW | The project's own OWASP dependency rule requires **exact pins** for crypto/security-critical packages in `dependencies`. Unmet: `@noble/curves ^1.9.7`, `@noble/hashes ^1.8.0`, `@scure/bip32 ^2.2.0`, `@scure/bip39 ^1.6.0`, `@scure/btc-signer ^2.2.0`, `ethers ^6.17.0`, most `@walletconnect/*`. Only `@walletconnect/core` is exact (`2.23.10`). The lockfile pins resolved versions, so practical exposure is bounded to regeneration — but the stated rule is not met. | **grep**: `package.json:98,99,129,130,131,136,145` |

#### Landed as unexecuted migration text (NOT counted as fixed)

Five backend findings were remediated in `sql/` this window — `decrement_referral` anon-callable
counter reset (`587baecc`), `check_first_referral_bonus` double-grant race + `rc_user_id`
disclosure (`13844f3e`), unpinned `SECURITY DEFINER search_path` (`559a58fb`), **base schema
files re-creating the very policies `api-security-hardening.sql` dropped** plus two orphaned
SECURITY DEFINER overloads (`3095f0ac`/`a7e43fac`/`d9261d2c`), and the first-referral-bonus
Edge Function's `--no-verify-jwt` / wildcard CORS / missing rate limit (`f5571caf`).

**Every one of these is migration text that has not been run.** Each file says so in its own
header. Static analysis cannot observe the live Supabase project's actual policy and grant
state, so these are filed under **Needs Verification**, not Fixed — see that section.

**Also landed (not audit-finding rows):** react-router v7→v8 for GHSA-qwww-vcr4-c8h2
(`75d76b95`); `npm ci` + `npm@11` across all workflows and `--legacy-peer-deps` dropped
(`312b7293`/`6edf12d7`/`3ffb972e`/`0cd59364`); staging environment + PR previews + rollback
(`fb6cdf0c`); telemetry/retention/funnel foundation (`41b48adc`); CodeQL Swift scan scoping
and the **removal of the `code_scanning` merge gate** (issue #1375 — a real reduction against
the ruleset's intent, recorded in `CLAUDE.md` with the three fixes that were tried and proven
impossible).

### Movement recorded in prior runs, preserved
| Finding | Result | Fixed in |
|---|---|---|
| 2026-07-20 weekly **H-1** — WC session-approval RASP gate read `gate.blocked`/`gate.sentence`, which `presignGateOrReject()` never returns | ✅ FIXED (2026-07-21 run) | PR #1276 (`e907d648`) |
| 2026-07-20 weekly **H-3** — duress PIN setup didn't clear a pre-existing real-PIN biometric cache | ✅ FIXED | PR #1261 (`f3358c2c`) |
| 2026-07-20 branch-review **C-1** (CRITICAL) — More-drawer "Recent" tiles named duress/stealth/panic routes, survived decoy/lock/panic-wipe | ✅ FIXED | PR #1262 (`d7f00751`) |
| 2026-07-20 branch-review **K-2** — referral `syncCount` failure-as-success + pre-gate real-state read/write | ✅ FIXED | PR #1262 (`d7f00751`) |
| **S-1** — PR #1243 stripped user-facing security caveats from `Documentation.jsx` | ✅ FIXED | PR #1268 (`e8cf2775`) |
| 2026-07-20 weekly **H-2** — ColdSign WARN-tier biometric step-up gap | ➖ No new row — `ColdSign.jsx` is unreachable dead code; covered by weekly M-5 |

---

## ⚠️ Checklist drift — standing Step-2 checks that are now wrong

Left unamended these produce **false readings**. Two carried from last run, two new.

| Check | Why it breaks | Correct check going forward |
|---|---|---|
| `H3: is PRIMARY_UNLOCK_EQUALIZER_MS ≥ 1500?` | The constant was **deleted** (grep returns nothing → reads as "open"). Replaced by real KDF-count equalisation. | Assert `spendPrimaryUnlockEqualizerKdfs` is imported (`WalletProvider.jsx:91`) **and** called on the primary-success path (`:1539`). Both present (grep). |
| `C6/H13: does CryptoSigning.jsx use useRef / call copySecret()?` | The file was **rewritten**; signing is scoped inside `withPrivateKey(index, fn)`, public values copied via `copyPlain`. No `useRef`, no `copySecret`. | Assert the file holds **no** `privateKey`/`mnemonic` state and copies via `copyPlain` (`:8`, `:80`). Confirmed (grep). |
| **NEW** — `H-NEW-3: does copySecret.js use a non-empty wipe sentinel and visibilitychange?` | Reads as one check; it is two, with **different answers**. `visibilitychange` is present (`copySecret.js:49,75`). The read-back sentinel is **absent by design** — `:30` states the replacement string "is a replacement string, **not** a read-back sentinel". | Split it. `visibilitychange` → FIXED. Read-back sentinel → **still open**, already tracked as weekly L-8 (07-14). Do not report H-NEW-3 as wholly fixed. |
| **NEW** — `RASP-A2: does SendCrypto.jsx fall back to TIER.BLOCK?` | Answer unchanged (**yes**) but the line numbers in the checklist (`:761`/`:828`) are stale — the file moved. | Assert on the symbol, not the line: `SendCrypto.jsx:814` and `:891` both `?? TIER.BLOCK` (grep). |

The first two are **improvements**, not regressions — the checklist must follow the code.
The third is a genuine partial that the checklist's phrasing was concealing.

---

## Fixed ✅

### Re-verified against pinned `main` this run (grep-confirmed)

| ID | Severity | Finding | Confirmed by |
|---|---|---|---|
| **DIFF-0726-CONSENT** | HIGH | Consent bypassed by 13 direct `trackEvent()` call sites (I2+I4) | **NEW this run** — `trackEvent.js:33` `if (!hasConsent()) return;` at the single egress chokepoint (grep) |
| **DIFF-0727-TRACKING** | MEDIUM | Decoy sessions wrote + consumed funnel flags in shared storage (I3) | **NEW this run** — `tracking-integration.jsx:80/94/154/312` `suppressed()` (grep) |
| **DIFF-0723-DEVICEID** | MEDIUM | `veyrnox-device-id` survived panic wipe → install tell + cross-wipe backend linkage | **NEW this run** — `panic.js:258-260` (grep) |
| **DIFF-0727-ROLLBACK** | MEDIUM | `rollback.yml` command injection via `deployment_id` | **NEW this run** — `env:` + validated `steps.dep.outputs.id` (grep) |
| **BR-0727-I3LOG** | HIGH | Decoy state (`isDemo`) logged to console every render | **NEW this run** — `WalletEntry.jsx:988` only, DEV-gated `console.error` (grep) |
| **BR-0727-CONSENT-REASK** | MEDIUM | "One-time" consent re-asked every unlock, overwriting a stored denial | **NEW this run** — `WalletEntry.jsx:470` mount-seeded (grep) |
| **BR-0727-TESTS** | HIGH | Regression tests rewritten to assert the defect | **NEW this run** — `WalletEntry.kek-gate.test.jsx:216,232` (grep) |
| **BR-0727-SEND** | MEDIUM | Malformed send amount dead-ended with no message | **NEW this run** — `sendAmountError.js:67` fed the gate's own verdict (grep) |
| **BR-0727-PRICING** | MEDIUM | Hardcoded discount claims beside independently-resolved prices (I4) | **NEW this run** — `annualSaving.js:38-47` null → no claim (grep) |
| **BR-0723-F2 / #1373** | MAJOR | Debug/release cert guard fail-open and inert (4th regression) | **NEW this run** — guard throws; `ci.yml:338/391` run it **on PRs**; escape hatches unused (grep) |
| 2026-07-20 weekly H-1 | HIGH | WC session-approval RASP gate was a no-op | `WalletConnectProvider.jsx:779` `if (!gate.proceedAllowed) throw` (grep) |
| C3 | CRITICAL | RASP/presignGate absent from WC signing path | `:44` imports `presignGate`; gates at `:391/:437/:512/:779` (grep) |
| C4 | CRITICAL | Phishing check read non-existent `proposer` | `RequestApprovalModal.jsx:174-175` reads `liveSession?.peer?.metadata`; `:176` fails closed on `sessionUnresolved` (grep) |
| weekly C-1 (07-14) | CRITICAL | C-01 fail-open not propagated beyond SendCrypto | all 4 signing chokepoints native-aware (grep) |
| weekly H-1 (07-14) | HIGH | Primary-unlock timing oracle (3-KDF deficit) | `spendPrimaryUnlockEqualizerKdfs` called `WalletProvider.jsx:1539` (grep) |
| C6 / H13 | CRITICAL/HIGH | Private keys in React state; key copied w/o wipe | superseded — `CryptoSigning.jsx` never holds key material; public-only `copyPlain` (grep) |
| H4 | HIGH | twoFactorGate leaked which factor was wrong | `twoFactorGate.js:77` single opaque `WRONG` (grep) |
| H6 | HIGH | `eth_signTypedData` v1/v3 routed as v4 | both in `BLOCKED_METHODS` (`router.js:41-42`); `:52` `isBlocked` (grep) |
| H7 | HIGH | EIP-712 `domain.chainId` not bound to session chain | `WalletConnectProvider.jsx:477-482`; pre-modal mirror `:728` (grep) |
| H11 | HIGH | ColdSign hardcoded `TIER.ALLOW` | `ColdSign.jsx:163` uses `presignGate(tier, …)` (grep). *Caveat: the file is unreachable dead code — see weekly M-5* |
| H15 | HIGH | Android KEK not StrongBox-backed | `HardwareKekPlugin.kt:213` `setIsStrongBoxBacked(true)` — best-effort, not enforced (`:14`) (grep) |
| H16 | HIGH | `AUTH_DEVICE_CREDENTIAL` collapsed biometric to PIN | `:210` `AUTH_BIOMETRIC_STRONG` only (grep) |
| H-NEW-1 | HIGH | APK tamper check placeholder cert | `RaspIntegrityPlugin.kt:765` reads `BuildConfig.RELEASE_CERT_SHA256`; blank → `:770` fail-closed (grep) |
| H-NEW-3 *(partial)* | HIGH | Clipboard secret wipe | `visibilitychange` present (`copySecret.js:49,75`) — **but no read-back sentinel by design (`:30`)**; that half remains open as weekly L-8 (grep) |
| H-NEW-4 | HIGH | KEK `H`/`C`/`dek` not zeroed at call site | `keystore/web.js:354-355`, finally-blocks `:368-371`, `:538-541`, `:620-623` (grep) |
| M20 | MEDIUM | `combineKek` internal `ikm` not zeroed | `keystore/kek.js:241` `zero(ikm)` (F-06 CryptoKey caveat `:240`) (grep) |
| RASP-A2 | HIGH | `raspTier ?? TIER.ALLOW` fail-open | `SendCrypto.jsx:814` **and** `:891` (fresh re-probe) both `?? TIER.BLOCK` (grep) |

### Doc / PR-confirmed (not re-grepped this run)

| ID | Severity | Finding | Fixed in |
|---|---|---|---|
| **BR-0723-F1** | MAJOR | `storeFile` resolved one directory too high — release signing path dead | 2026-07-23 per-spelling `ksBase`; verified by a real signed `bundleRelease` |
| C5 | CRITICAL | Native `RaspIntegrityPlugin` did not exist | built; F-09 device-verified 2026-07-12 (mainnet `0x4556e2e6…`) |
| C-1 (KEK) | CRITICAL | Android KEK HMAC global fixed salt | v3 salt binding, PR #568, device-verified (Sepolia `0xecd68494…`) |
| C-01 | CRITICAL | RASP pre-sign gate fail-OPEN on native | PR #825 + propagation PRs #954/#960/#966 |
| P1-1 | CRITICAL | Play Integrity verdict not nonce-bound (replay) | PR #1009 — *only Codex-caught finding; both Claude reviewers missed it* |
| P1-2 | HIGH | `sensitiveGate` fail-OPEN on null artifact | PR #1010 |
| Audit-1 H-2 | HIGH | ES256 JWS raw R‖S vs DER — every real token failed | PR #955 |
| SEND H-1 | HIGH | Trezor EVM bypassed audited `hw-send.js` helpers | PR #963 (+ I3 hotfix cascade PR #978) |
| H8 / H-NEW-2 | HIGH | personal_sign address binding; WC topic binding | PRs #443/#757 |
| H-NEW-A/B/C/D | HIGH | KEK zeroing; WC step-up; sign parity; iOS SE | PRs #433/#443; SE confirmed `HardwareKekPlugin.m:78` |
| H-2 / iOS-F11 | HIGH | Biometric not bound to enrollment set | Android PR #516/#518; iOS 2026-07-08 |
| iOS-F5 / iOS-F3 / iOS-F9 | HIGH/MED | NSData zeroing; deprecated prompt; SE trace | device-verified 2026-07-07 |
| F-01…F-08, H-1, H-4, M-3, iOS-F6 | H/M/L | KEK stack hardening | PRs #520–#522, #527, #723 |
| M-A/B/F/G/H/I/J | MEDIUM | WebView nav, tamper fail-open, re-auth, KDF bounds | PRs #440–#442 |
| 9×P2 + 5×P3 | MED/LOW | TOCTOU re-probe, attestation defer, shape validation, doc-lag | PRs #1010/#1012/#1013/#1014 |
| weekly M-7 (07-14) | MEDIUM | RaspSecurity browser-only readout | PR #953 |
| M-6/M-7 (07-08) | MEDIUM | Hidden-balance I3 guard; live-prices panic residue | PR #757 |
| I2-LIVEPRICE | MEDIUM | Live-price opt-OUT default violated I2 | now opt-in (`=== '1'`) |
| 2026-07-20 weekly H-3 | HIGH | Duress PIN setup didn't clear real-PIN biometric cache | PR #1261 (`f3358c2c`) |
| 2026-07-20 branch-review C-1 | CRITICAL | More-drawer recents named duress/stealth/panic routes | PR #1262 (`d7f00751`) |
| 2026-07-20 branch-review K-2 | MED-HIGH | Referral `syncCount` failure-as-success + pre-gate state I/O | PR #1262 (`d7f00751`) |
| S-1 | MEDIUM | PR #1243 deleted user-facing security caveats | PR #1268 (`e8cf2775`) |
| DIFF-0727-SEEDGATE | MEDIUM | `seedVerifyGate` failed OPEN on an unknown amount | `434718d6` (#1346) — and the header now states the gate is **INERT** (no route, no production import) |
| DIFF-0727-DEVICEID-RNG | MEDIUM | `deviceId.js` fell back to `Math.random()` — violates the project RNG rule | `434718d6` (#1346) — returns `null`; callers treat null as "do not track" |

**Honesty note:** every 2026-07-23 → 07-28 landing is BUILT / unit-tested / merged,
**INTERNAL**. None is device-verified, none has an on-chain txid, none is independently
audited — do not upgrade past BUILT.

---

## Still Open ⚠️

| ID | Severity | Finding | File:Line | First reported |
|---|---|---|---|---|
| C1 / weekly M-8 | CRITICAL | PIN attempt counter in clearable `localStorage` — wipe defeatable (disclosed in-source; hardware-KEK is the tracked fix) | `src/lib/pinAttemptGuard.js:7,11` (grep) | 2026-06-26 |
| C2 | CRITICAL | 8-digit PIN offline-exhaustible on non-KEK vaults | `vault.js`, `keystore/native.js` | 2026-06-26 |
| H10 | HIGH | Cert pinning — **16** SPKI entries still `PLACEHOLDER_*_REPLACE_ON_DEVICE` (grep: count unchanged) | `src/wallet-core/rpc/pinning.js` | 2026-06-26 |
| weekly M-1 (07-14) | MEDIUM | Android `hmacResult` (plaintext H) never `.fill(0)` before `call.resolve` — **re-confirmed unchanged this run** | `HardwareKekPlugin.kt:373-375` (grep) | 2026-07-14 |
| weekly M-2 (07-14) | MEDIUM | iOS **enroll** path uses immutable `NSData dataWithBytes` — unzeroable; fix exists only on the decrypt path (doc) | `HardwareKekPlugin.m:174` | 2026-07-14 |
| weekly M-3 (07-14) | MEDIUM | `approveBlocked` excludes `dapp.flagged`/`sessionUnresolved` — known-bad dApp banner is display-only at signing. **Re-confirmed unchanged** | `RequestApprovalModal.jsx:162-167` (grep) | 2026-07-14 |
| weekly M-4 (07-14) | MEDIUM | RASP-blocked WC request fails silently in UI (fail-closed on wire, not fail-*honest*) | `WalletConnectProvider.jsx` | 2026-07-14 |
| weekly M-5 (07-14) | MEDIUM | WARN-tier `requiresBiometric` still acknowledge-only on WC/ColdSign/CryptoSigning. Re-surfaced as 2026-07-20 weekly "H-2" via unreachable `ColdSign.jsx` | `degrade.js`, `presign.js` | 2026-07-14 |
| weekly M-6 (07-14) | MEDIUM | RaspSecurity/catalogue *under-claim* RASP status (stale "pending") | `RaspSecurity.jsx:45` | 2026-07-14 |
| weekly L-8 (07-14) | LOW | `copySecret` has no read-back sentinel — the clipboard overwrite is never confirmed (deliberate; `copySecret.js:30`) | `src/lib/copySecret.js:30` (grep) | 2026-07-14 |
| H1 / H2 / BIO-01 / H-NEW-5 | HIGH | Biometric unlock cache not OS-ACL bound to enrollment set | `biometricUnlock.js:84-104` | 2026-06-26 |
| BIO-02 | HIGH | App-layer biometric gate Frida-bypassable (fundamental; disclosed) | `biometricUnlock.js:18-36` | 2026-07-05 |
| H5 | HIGH | `captureVerifierSafe` OOM bricks send-gate for the session | `credentialVerifier.js:64` | 2026-06-26 |
| H-3 (07-01) | HIGH | Android biometric lockout → device-credential fallback (accepted deviation) | `BiometricService` | 2026-07-01 |
| G2-ROOTCERT-PIN | HIGH | Play Integrity root pin is an issuer-string heuristic, not an SPKI fingerprint | `PlayIntegrityPlugin.kt` | 2026-07-15 |
| RASP-A1 | HIGH | RASP browser probe is a module-load snapshot (partly addressed by P2-1 fresh re-probe) | `browserProbe.js:76` | 2026-07-05 |
| D-04 | HIGH | I3 egress race: `isDecoy` React state lags the module flag (PLAUSIBLE) | `WalletProvider.jsx:316-321` | 2026-07-05 |
| P2-2 | MEDIUM | WC signing timing side-channel (real awaits attestation, decoy skips) — **accepted residual** | `WalletConnectProvider.jsx` | 2026-07-15 |
| M-K | MEDIUM | Passkey `signCount` not persisted (no-backend architecture) | `passkey.js` | 2026-06-28 |
| M-6 / iOS-F5 residual | MEDIUM | iOS `NSString hB64` bridge copy of H (architectural) | `HardwareKekPlugin.m` | 2026-07-08 |
| M-1 (07-08) | MEDIUM | EVM private key as a JS string — unzeroable (ethers v6); ACCEPTED RESIDUAL | EVM signing path | 2026-07-08 |
| PW-01 | MEDIUM | In-app guarded wipe requires no re-auth (types `"WIPE"` only) — **re-confirmed** | `PanicWipe.jsx:57,106` (grep) | 2026-07-05 |
| **DEP-PIN** | LOW | **NEW** — crypto/security-critical deps carry `^` ranges against the project's own exact-pin rule; only `@walletconnect/core` is exact | `package.json:98,99,129-131,145` (grep) | 2026-07-28 |
| weekly L-1…L-7 (07-14) | LOW | `checkSystemWritable` weak; negative `txGas` unclamped; duplicated chainId helper; stale modal identity; iOS cancel misclassified; Android salt unzeroed; async prompt try/catch | various | 2026-07-14 |
| #1111 | MEDIUM | Vault AAD v:3 migration — plan r2 done, implementation blocked on owner decisions | `vault.js` | — |

**Accepted-residual / by-design:** M1–M19, L1–L10 (06-26); M-NEW-1…12 (06-27);
F-05/F-11/CS-1/SC-1/RASP-2/RASP-4/RASP-5 (07-04);
D-01/D-02/D-05/D-06/SW-01/SW-02/PW-02/PW-04/PW-05/AL-01/AL-02/AL-06/BIO-03/BIO-05/BIO-06/BIO-07/RASP-A4
(07-05). Consult the source audit for per-item rationale.

**Refuted on verification** (recorded so a future pass doesn't re-file): ROOTED→WARN biometric
ladder (deliberate design); "Play Integrity uses JWE not JWS" (codebase uses the Classic API →
JWS); "heuristic root checks fail open per-check" (intentional OR-chain tradeoff); JS↔native
bridge integrity (architectural, disclosed); `HARDWARE_FACTOR_DEGENERATE` wipe-counter miscount
(the finding read the wrong enum — it *is* exempted at `WalletEntry.jsx`).

---

## Needs On-Device / On-Chain / Live-Backend Verification 📱

| ID | Finding | Why verification is needed |
|---|---|---|
| **SQL-UNEXECUTED** | **NEW this run.** The five-finding SQL hardening set (`587baecc`, `13844f3e`, `559a58fb`, `3095f0ac`/`a7e43fac`/`d9261d2c`, `f5571caf`) | **Migration text, not applied state.** Static analysis cannot read the live Supabase policy/grant catalogue. Each file ships its own `has_function_privilege` / `pg_proc.proconfig` verification queries — **none has been run**. Note the trap recorded in `check-first-referral-bonus-hardening.sql`: re-running the superseded base file silently reverts the hardened body (CREATE OR REPLACE preserves privileges but not attributes) |
| **first-referral-bonus Edge Function** | BUILT, **NOT DEPLOYED** | Needs the SQL migrations run in order, then `supabase functions deploy` **without** `--no-verify-jwt`, plus `REVENUECAT_V1_SECRET_KEY` in Edge Function secrets |
| **RASP on a Play-delivered install** | `detectTamper()` on a real internal-track install | The 2026-07-23 build proves the AAB signs and compiles the right constant. It does **not** prove RASP passes on a device. Carried unresolved from `audit-2026-07-23-branch-review.md` |
| H-NEW-1 | APK tamper detection | Real release cert CI-injected and exercised on a repackaged APK |
| H10 | Cert pinning | 16 placeholder pins need real device-observed SPKI values + MITM-proxy validation |
| G2-ROOTCERT-PIN | Play Integrity root pin | Needs a captured real token from a registered Play Console app |
| iOS App Attest | Entitlement wiring | `DCAppAttestService.isSupported` no-ops; needs `App.entitlements` + DeviceCheck link |
| C-1 v2→v3 migration | Android KEK salt migration | BLOCKED on-device (PIN-cohort divergence APK-OLD/APK-NEW); unit-tested only |
| iOS-F5 residual | Heap-dump zeroing | Source+build verified; heap dump outstanding |
| weekly M-1 / M-2 | Native H residue | Heap-dump on a compromised device to demonstrate extractability |
| H1 / H2 / BIO-01 | Biometric OS-ACL binding (M2c/M2d) | Native plugin + real device |
| weekly H-1 (07-14) | Timing equalisation | Redesign is code-correct; on-device wall-clock across success/duress/miss still unmeasured |
| 2026-07-20 weekly H-1 | WC session-approval BLOCK | Merged and code-correct; that `TIER.BLOCK` actually refuses a WC session approval on a rooted/hooked device is unmeasured |
| M13 / M14 | FLAG_SECURE + WebView CDP disable | Unverified on a real release build |
| RASP hostile-device | All "BUILT / INTERNAL" RASP tags | Rooted/jailbroken/Frida device session with an on-chain txid |
| M-2 (07-08) | `hw-send.js` Ledger/Trezor | Stub-level tests only; physical device required |
| Safety Plus IAP | Promotional offers, both stores | 10 store-side offers exist; **no real purchase has ever completed on either platform** |
| Independent audit | Entire KEK + vault-cipher + S1–S4 surface | **Still outstanding** — no internal or Codex pass substitutes |

---

## Regressed 🔴

| ID | Finding | What broke |
|---|---|---|
| **ECC F-P3-3 (#1160)** | First-run security walkthrough | **ACTIVE REGRESSION.** PR #1403 deleted `src/components/FirstRunTour.jsx` and its placement test with no note. The tour *was* the remediation for ECC F-P3-3; deleting it reopens the finding. grep-confirmed absent from `src/`. `docs/Feature-Status.md:1421` now records it honestly (HONEST-DISABLED, orphaned `veyrnox-first-run-tour-*` keys, revert path `de8cb829^`) — **the documentation is correct; the remediation is gone.** Owner decision needed: revert, rebuild, or accept and tell ECC. |

Historical regressions on record (re-fixed; preserved, not swept away):

| ID | Finding | What broke → resolution |
|---|---|---|
| **Release/debug cert guard** | Android signing fingerprint check | **Regressed four times**: #1310 added → #1313 silently dropped it in a rewrite → #1325 restored → #1338 caught it → inert again until #1386/#1391. Survived ~15 merges over two days because the regression test was gated to `main`-only, so **no PR could ever fail on it**. Now runs on PRs (`release-guard-scope` + `release-cert-guard`). Watch item: if `-PALLOW_MISSING_DEBUG_KEYSTORE` or `-PALLOW_UNREADABLE_UPLOAD_KEYSTORE` ever appears in a workflow, the guard is inert again. |
| **Telemetry consent** | Consent enforced in the wrong layer | Shipped 2026-07-26 gating only `analytics.js emit()` while 13 call sites used `trackEvent()` directly — a consent control that did almost nothing. Fixed at the egress chokepoint (`434718d6`), then a *second* consent defect (re-ask-forever, overwriting a stored denial) shipped 2026-07-27 and was fixed by #1409. Two chokepoints now: `trackEvent.js` gates EGRESS, `lib/consent.js` gates WRITES. |
| C-1 (KEK) | Android per-enrollment salt binding | v2 fix (PR #529) recorded RESOLVED 2026-07-02, found **cryptographically inert on-device** 2026-07-05. Re-FIXED same day via v3 (PR #568), device-verified. |
| C-01 | RASP pre-sign gate fail-open | Fixed on SendCrypto (PR #825) but **scope-regressed** — 3 other chokepoints left fail-open, caught by the 2026-07-14 weekly. Now fully propagated. |

### Pattern worth naming

Three of this window's findings share one shape: **a control that exists but cannot fire.**
The cert guard (test gated to `main`), the consent gate (enforced in a layer nothing calls),
and the regression tests that were *edited to assert the defect*. A green pipeline was
consistent with all three. When reviewing, the question "is the check present?" is not the
same question as "can the check fail?" — and only the second one is worth anything.

---

*Automated weekly tracker. Static analysis only — does not substitute for on-device,
on-chain, or live-backend verification. "FIXED" = the code change is present on
`origin/main`; it is not a claim the control is verified working. SQL migrations are
counted as unexecuted text until their own verification queries have been run against the
live project. The independent third-party audit remains outstanding and is not substituted
by any internal or second-model (Codex) pass.*
