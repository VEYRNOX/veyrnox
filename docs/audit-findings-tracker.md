# Audit Findings Tracker
Last updated: 2026-09-14
Analysed against: origin/main @ `885490ad309ac59e2ff12e62ed7e321b73d0711d`
(clean branch worktree cut from `origin/main` per Step 0 — not the live checkout,
not a `git show` fallback. macOS/zsh.)

> Automated weekly synthesis of every finding across the audit corpus, checked against a
> **pinned snapshot of `origin/main`**. **Static analysis only.** "FIXED" means the code
> change is present on `main` — it does **not** mean the control is verified working
> on-device, on-chain, or against a live backend. Rows tagged `(grep)` were re-verified
> against source this run; rows tagged `(doc)` carry the status recorded in an audit doc or
> PR history and were not independently re-checked.

## Window since last run

Previous run analysed `d0c4423c` (2026-09-07). `main` has moved **161 commits** since.
The 09-14 weekly audit is pinned to `845f9b4e`; the seven commits between that pin and this
one are an iOS referral-link allowlist fix, two build bumps and the audit doc itself — none
touches an audited surface, so the 09-14 weekly's `file:line` references hold at this pin.

The previous version of this file carried a long Regressed narrative (the bug-report SQL
policy, the #2424/#2423 overwrite, the `git log <base>..<tip>` reachability lesson). That
finding is closed and the narrative is not repeated here; read it with
`git show acbb5ebe:docs/audit-findings-tracker.md`.

## Sources synthesised

Carried from prior runs, unchanged: the 06-26 through 09-05 corpus, `docs/audit-triage/`
(29 files), `docs/security-audits/` (11 files), `docs/honesty-check-2026-08-31.md`.

**New this run:**

- **`docs/audit-2026-09-07-weekly.md`** — 2 HIGH, 6 MEDIUM, 15 LOW. Published after the
  last tracker run. **Every finding was remediated the same day** (#2422, #2426, #2428,
  #2430, #2431); L-2 and the disclosure half of L-3 recorded by-design.
- **`docs/audit-2026-09-14-weekly.md`** — **5 HIGH, 8 MEDIUM, 9 LOW, 1 INFO. Findings
  only, nothing fixed.** Four of five HIGHs are in Theft Protection, which landed four days
  after the 09-07 audit. One is a regression created by the 09-07 H-1 fix.
- **`docs/audit-gemini-sweep-2026-09-13.md`** — third Gemini pass (`src/pages/`, 180
  files). 14 raw findings: one real K-2 class (seven pages, #2537), one real LOW honesty
  defect, the rest refuted or down-rated, including a same-day self-correction.
- **`docs/security-diffs/diff-2026-09-08.md` … `diff-2026-09-14.md`** — 7 daily scans,
  unbroken. ~20 non-SAFE items; ~14 resolved in-window.
- No new files in `docs/audit-triage/`, `docs/security-audits/`, or
  `docs/dependency-audits/` this window.

## Summary

- Total findings catalogued: **~350** (dedup across the corpus; MEDIUM/LOW grouped — the
  count is approximate by construction and the delta matters more than the absolute)
- Fixed (code-confirmed): **~280** — **~43 closed this run**, of which **14 were
  re-verified by grep** against the pinned snapshot
- Still open / accepted-residual: **~66** — up from ~46. **The 09-14 weekly alone added
  22 open findings**; net closures elsewhere offset about a quarter of that
- **Regressed: 2** — was 0. See Regressed
- Needs on-device / on-chain / live-backend verification: **28**

---

## What changed this run

### Theft Protection shipped around the audit gates, not through them

Theft Protection (#2498, `4ba80bbf`, #2518, #2519) is the source of **four of the 09-14
weekly's five HIGHs**, plus two daily-diff items that the weekly later re-derived
independently. Each branch of `runTheftProtectionGate` fails closed on its own; the defects
are in how it was composed with existing helpers whose documented contracts differ from the
new caller's assumption:

| 09-14 | What TP reused | What the helper's own contract says | Confirmed |
|---|---|---|---|
| H-1 | `getFreshRaspArtifact` | composes remote attestation, which `attestation.js` headers as **NEVER ON UNLOCK** | **grep**: `theftProtection.js:33` imports it; `native.js:644` and `:1330` do too (M-8) |
| H-2 | wired into `unlock()` only | the default-ON fast path is what `WalletEntry` tries first | **grep**: no TP reference in `WalletProvider.unlockBiometricOnly` |
| H-4 | `verifyBiometric2fa` | falls back to device passcode by design | **grep**: `biometric.js:161,168` `allowDeviceCredential: true`; no `androidBiometryStrength` anywhere in `src/` |
| H-5 | requires `TIER.ALLOW` | #2276 was accepted at WARN so genuine devices are not refused | **grep**: `theftProtection.js:181` `raspTier !== TIER.ALLOW` |

The daily scan saw the H-4 shape first — **N-1 (09-11)** flagged the passcode fallback and
**N-2 (09-12)** flagged that the same verify now authorises over-limit sends — three days
before the weekly. Neither was issue-tracked. Both remain open and are folded into H-4/M-5
below rather than listed twice.

**The two TP defects that *were* tracked were fixed within hours** (#2515 → #2518, wrong-PIN
miscount that could trigger the 10-strike wipe; #2517 → #2519, opt-in marker surviving panic
wipe — `panic.js` residue list, grep). Pattern: an issue gets a fix the same day; a finding
that lives only in a report does not.

### The 09-07 weekly closed in a day — and one fix created a HIGH

All 23 findings in the 09-07 weekly were addressed by five PRs the same afternoon. The 09-14
weekly re-derived each and confirms them, with three caveats that matter:

- **09-07 H-1** (WC refusals returned silently) is fixed — every refusal now throws — but
  the throw skips the queue filter that previously ran unconditionally after the handler.
  **The refused request stays queued with Approve enabled, and a retry signs and
  broadcasts after the dApp was told "rejected"** (09-14 H-3). Confirmed at this pin: the
  three wrappers' filters at `WalletConnectProvider.jsx:1096`, `:1115`, `:1211` are plain
  statements after the awaited handler, not in a `finally` (grep). Listed under Regressed.
- **09-07 M-1** (RASP OS-probe latch) is fixed for positive hard signals, but a bridge that
  never settles hits the outer `withFailClosedTimeout` before the latch runs (09-14 M-7).
- **09-07 M-6** (`getSecretUnauth`) is fixed as written, but `getSecret()` on the storage
  alias is not auth-bound — `AndroidBiometricCachePlugin.kt:530-531` `requiresAuth = false`,
  and `REQUIRES_USER_AUTH_LEGACY` at `AndroidBiometricCacheConfig.kt:64` has **no production
  reader** (grep) — so the guard is bypassable (09-14 M-1).

### A fix was silently reverted, and nothing noticed for three days

**DIFF-0911-N-4.** #2435 (`0dc4f673`, 09-08) added a `process.version` shim to
`src/main.jsx` because `bs58check`'s bundled `readable-stream` reads
`process.version.slice(0, 5)` at module init, which blanked the Send page on cold parse.
#2500 (`bf68a1be`, 09-10) rewrote the same block and dropped it. **At this pin the shim is
`{ env: {}, browser: true, versions: {}, platform: 'browser' }` — no `version`** (grep,
`main.jsx:24-26`). The daily scan caught it on 09-11 and re-confirmed it on 09-13 and 09-14;
no issue exists. This is exactly the class CLAUDE.md names as uncovered by any automated
gate after the Robo waiver — the only thing standing between it and users is the owner's
stock-device walkthrough.

### Deniability (K-2): the class is still producing sites, and they are getting fixed

The 09-13 Gemini sweep's substantive result — seven `src/pages/` screens reading and writing
the shared `veyrnox-appdata` IndexedDB with no decoy gate, so a decoy session could show the
real user's send history — was filed as #2537 and **fixed in `6042722e`** the same day. A
sibling in `SendCrypto.jsx` (decoy send wrote a real txid; decoy read real whitelist and
limits, under a comment falsely claiming it was gated) was **fixed in `cc9efadb`**. All seven
pages now reference the deniability predicate (grep, 7–10 hits each).

**#2537 is still OPEN** despite both fixes being on `main`. Probably correct — no decoy
session has exercised either fix — but the issue body should say that, or it reads as
unfixed. **One page was never in scope:** `NewsSentimentPage.jsx:47`'s saved-list query is
still ungated (grep); low practical exposure because the only writer is behind
`LLM_AVAILABLE && !isDeniabilityOrDemoActive()`.

### Closed this run

| ID | Sev | Finding | Closed by | Confirmed by |
|---|---|---|---|---|
| **09-07 H-1** | HIGH | WC pre-sign gate refusals returned silently and the modal answered with a SUCCESS haptic | #2422 | (doc) 09-14 **[VERIFIED]** — throws at `:433/499/593`. **Fix introduced 09-14 H-3** |
| **09-07 H-2** (was 09-05 L-10) | HIGH | Fast-path session read by send 2FA as five wrong PINs, then locks | #2422 | (doc) 09-14 — both SendCrypto gates branch on `bricked`. Verify-side sibling open as 09-14 L-3 |
| **09-07 M-1** / 09-05 M-1 | MED | RASP OS-probe leg had no session latch; file header promised BLOCK where code gives WARN | #2426 | **grep**: header at `getFreshRaspArtifact.js` now states per-leg → WARN, chain → BLOCK, with a `CORRECTED 2026-09-07` note. **Partial** — stall vector open as 09-14 M-7 |
| **09-07 M-2** | MED (I2) | WC sign-path TIP remote screen not tier-gated | #2426 | (doc) 09-14 **[VERIFIED]** |
| **09-07 M-3** | MED | Dead `isVerifierReady` export | #2431 | (doc) — deletion |
| **09-07 M-4** / 09-05 L-12 | MED | Equalizer KDF-count-equal but not equal to the visible outcome | #2431 | (doc) — paint timing still unbenched |
| **09-07 M-5** / 09-05 M-2 | MED | Fast-path raw-DEK plugin comment argued the abandoned wrapped model | #2430 | **grep**: `AndroidBiometricCachePlugin.kt:328` "Do not restore the 'useless without H' reasoning". Still says "OFF by default" at `:324` — open as 09-14 L-9 |
| **09-07 M-6** / 09-05 M-5 | MED | `getSecretUnauth` auth-free | #2430 | (doc) — **bypassable**, open as 09-14 M-1 |
| **09-07 L-1** / 09-05 M-3 | LOW (I4) | Disclosure API stated the wrong Keychain class | #2428 | **grep**: `biometricUnlock.js:536-537` corrected; code at `:200` unchanged |
| **09-07 L-2** / 09-05 M-4 | — | No attempt counter on password unlock | #2428 | **BY DESIGN**, recorded at `WalletEntry.jsx:919-942` (doc) |
| **09-07 L-14** / 09-05 L-9 / 08-25 M-8 | LOW (I4) | `WIPE_EXHAUSTED_EVENT` had no consumer; TTL never re-armed | #2428 | **grep**: timer re-arm and `toast.error` at `copySecret.js:126-147` |
| **09-07 L-3..L-13, L-15** | LOW | Fee ceiling, `estimateGas` `from`, unreachable Approve affordances, spend-limit read fail-open, nested typed-data backstop, dead WC validators, stale RASP comments, KEK plaintext scrub (read side), docstrings, KEK write-method RASP gate, dead passkey assertion | #2428 | (doc) 09-14 status table. Bypasses/siblings open as 09-14 L-4, L-5, L-6, L-7 |
| **DIFF-0823-VC** | LOW (I4) | User-facing catalogue still said "versionCode 10" | #2473 (`d8679685`) | **grep**: `featureCatalogue.js:569` carries no versionCode "deliberately"; test `featureCatalogue.test.js:102` asserts none. **Closed the right way** — by removing the number, not updating it |
| **DIFF-0902-SENDCRYPTO-ADDR-EGRESS** | NEEDS-REVIEW | `sender_address` sent to `tip-chat` possibly beyond consent scope | #2461, `626f16b1`, `f0075455` | (doc) — consent copy no longer promises addresses are never sent, and now discloses app language and the per-install ID. Resolved by disclosure, not by removing the field |
| **#2537** (GEM-0913) | HIGH (I3) | Seven pages read/write shared `veyrnox-appdata` with no decoy gate | `6042722e` | **grep**: all seven carry the gate. Issue still OPEN; decoy session unexercised |
| **DIFF-0914-SENDCRYPTO-K2** | HIGH (I3) | Decoy send wrote a real txid; decoy read real whitelist/limits; false "already gated" comment | `cc9efadb` | (doc) 09-14 diff |
| **#2515 / DIFF-0911-R-1** | REGRESSION | TP refusal after a correct PIN counted as a wrong PIN — could reach the 10-strike wipe | #2518 | (doc) 09-14 weekly **[VERIFIED]** `WalletEntry.jsx:1134-1137`, `:878-883` |
| **#2517 / DIFF-0911-N-2** | NEEDS-REVIEW (I3) | TP opt-in marker survived panic wipe, and the wipe reported clean | #2519 | (doc) 09-14 weekly — `panic.js:255` |
| **#2494** | MED | Prod grants anon/authenticated CRUD on three rate-limit tables; PUBLIC EXECUTE on five functions (prod only) | #2475 + live apply 09-10 | (doc) — live state, not re-queried |
| **#2534** | LOW | Three `/r/<code>` readers disagreed on empty path segments | #2534 | **grep**: `workers/referral-redirect/src/index.js:19` now warns against `filter(Boolean)`. **Live Worker redeploy unverified** — see verification table |
| **DIFF-0909-F-1** | NEEDS-REVIEW | `rc-webhook` comment said keep `verify_jwt` ON; live state OFF (correctly) | #2457 | (doc) |
| **DIFF-0910 CI** (#2495, #2496, #2492) | MED | Play-closed publish gated on `github.sha` but uploaded a `target_sha` artifact; FTL run lookup by unvalidated display string; golden-path Robo assertions deleted rather than parked | #2501, #2502, #2503 | (doc) |
| **O-1 (09-08)** | — | Test-only latch reset export claimed to ship in prod | — | **WITHDRAWN** — tree-shaken, verified by build (doc) |
| Doc-honesty items | — | versionCode 45 in Play doc (#2453); 1.0.1 hold text not amended (#2458); telemetry "zero real-user data" (#2508) | various | (doc) |

---

## ⚠️ Checklist drift — standing Step-2 checks that are now wrong

| Check | Why it breaks | Correct check going forward |
|---|---|---|
| `H3: is PRIMARY_UNLOCK_EQUALIZER_MS ≥ 1500?` | **NEW this run.** The constant was **removed** — `WalletProvider.jsx:231` and `deniabilityUnlock.js:77,191` record that it only bridged ~1.4 of a 3-KDF deficit and was superseded by a KDF-count equalizer. Grepping for it returns only history comments, which reads as "open" or, worse, as a pass on the comment. | Assert the H-1 primary-success cost equalizer in `deniabilityUnlock.js` performs the same KDF count on all three outcomes; the 09-05 weekly counted 5 by hand. |
| `C3/H7/C4: WalletConnectProvider.jsx` | Carried. File is `src/lib/WalletConnectProvider.jsx`, not `src/components/`. | Same assertions, correct path. Re-verified: `presignGateOrReject` ×7, `proceedAllowed` ×9, `domain.chainId` bound at `:523-544` and pre-modal `:940` (grep). |
| `H11: does ColdSign.jsx hardcode TIER.ALLOW?` | **Fourth run asking for this to be dropped.** File deleted in #1796; still absent (grep). | **Delete the check.** |
| `H4: twoFactorGate.js` | Carried. File is `src/lib/twoFactorGate.js`. | Single opaque `WRONG: 'WRONG'` at `:32`, one message at `:77` (grep). |
| `DIFF-0823-VC` | **Retire.** Closed by removing the number from the catalogue. | Nothing to check; the catalogue test pins absence. |
| `M20/H-NEW-4: kek.js combineKek` | Carried. Module is `src/wallet-core/keystore/kek.js`. | `zero(ikm)` at `:248` **and** `:280` (grep). |
| `DIFF-0816-MAINSYNC: IntegrityGate.swift:88` | Carried. Path `ios/App/CapApp-SPM/Sources/CapApp-SPM/`. | Still `DispatchQueue.main.sync` at `:88` — **still open** (grep). |
| `H6: BLOCKED_METHODS` | Carried. File is `src/wallet-core/evm/walletconnect/router.js`. | Present at `:48`; includes `eth_signTransaction` at `:50` (grep). |
| `C6/H13: CryptoSigning.jsx` | Carried. Signing scoped inside `withPrivateKey(index, fn)`. | Assert no `privateKey`/`mnemonic` state and `copyPlain` for copies. Not re-checked this run. |
| `M-2 (07-08): hw-send.js` | Carried. Paths deleted in #2032. | Re-point at `src/wallet-core/hw/digitalShield.js`. |

Re-verified unchanged and still correct this run (grep): **C3**, **C4** (`RequestApprovalModal.jsx:240-242`
reads session peer metadata, never `params.proposer`), **H7**, **H6**, **H-NEW-3**
(`copySecret.js` non-empty `WIPE_REPLACEMENT` at `:111`, `visibilitychange` at `:170`),
**H-NEW-4** (`keystore/web.js` zeroes H/C/kek/dek on every path, e.g. `:366-383`),
**H4**, **H15/H16** (`setIsStrongBoxBacked(true)` best-effort at `HardwareKekPlugin.kt:246`;
`AUTH_DEVICE_CREDENTIAL` only in the two removal comments `:23`, `:95`), **H-NEW-1**
(`RaspIntegrityPlugin.kt:821` from `BuildConfig`, blank ⇒ fail-closed at `:829`), **M20**,
**H10** (still **16** `PLACEHOLDER_` entries — **open**), **RASP-A2** (`SendCrypto.jsx:1231`,
`:1424` `?? TIER.BLOCK`; no `?? TIER.ALLOW`).

---

## Still Open ⚠️

### New this run — 09-14 weekly (nothing fixed at this pin)

| ID | Severity | Finding | File:Line | First reported |
|---|---|---|---|---|
| **H-1** (09-14) | **HIGH** (I3/I2) | TP runs **remote attestation on unlock**, for the primary set only — a network-observable real/decoy distinguisher, against the "NEVER ON UNLOCK" rule in `attestation.js` and the rejected Option C in the egress-decision doc | `theftProtection.js:33,163` (grep) | 2026-09-14 |
| **H-2** (09-14) | **HIGH** | TP never runs on the **default-ON fast-path biometric unlock** — the phone-snatch case TP exists for | `WalletProvider.jsx` `unlockBiometricOnly`, no TP reference (grep) | 2026-09-14 |
| **H-4** (09-14) + DIFF-0911-N-1 | **HIGH** (I4) | TP's "biometric" accepts the **device passcode** (lockout or not-enrolled), and on Android defaults to Class-2. Copy and catalogue claim Face-ID-strict / BIOMETRIC_STRONG / Class 3. A JS boolean with no hardware key behind it. **Daily scan flagged this 09-11; unfiled** | `biometric.js:161,168` `allowDeviceCredential: true`; no `androidBiometryStrength` in `src/` (grep) | 2026-09-11 |
| **H-5** (09-14) | **HIGH** (availability) | TP requires `TIER.ALLOW`, so every WARN — including #2276's accepted `INTEGRITY_UNAVAILABLE` — becomes an unlock refusal whose off-switch is behind the lock. Recovery is reinstall + seed | `theftProtection.js:181` (grep) | 2026-09-14 |
| **M-1** (09-14) | MEDIUM | Android biometric-cache storage alias not auth-bound; 09-07 M-6 guard bypassable via `getSecret()`. `REQUIRES_USER_AUTH_LEGACY` has no production reader — a JVM test pins a constant that gates nothing | `AndroidBiometricCachePlugin.kt:530-531`; `AndroidBiometricCacheConfig.kt:64` (grep) | 2026-09-14 |
| **M-2** (09-14) | MEDIUM | Import-time migration **silently re-enables Biometric Unlock** after a Settings opt-out, every cold start | `fastpathUnlock.js:117-164`, `setBiometricUnlockEnabled(true)` at `:131` (grep) | 2026-09-14 |
| **M-3** (09-14) | MEDIUM | TP and the spend limits it enforces switch off with no step-up | `TheftProtectionSettings.jsx:17,53`; `SecurityCenter.jsx:157-165` [AGENT] | 2026-09-14 |
| **M-4** (09-14) | MEDIUM (I3) | TP prompts only on primary unlock — coercer-visible real/decoy distinguisher; contradicts the parity reasoning in `twoFactorGate.js:48-56` | `WalletProvider.jsx:1920-1930`, `theftProtection.js:168` [AGENT] | 2026-09-14 |
| **M-5** (09-14) + DIFF-0912-N-2 | MEDIUM | Over-limit WC sends now cleared by a generic biometric (or passcode, per H-4) prompt; the modal never shows the cap breach. **Daily scan flagged 09-12; unfiled** | `RequestApprovalModal.jsx` — zero `limit` references (grep) | 2026-09-12 |
| **M-6** (09-14) | MEDIUM | Daily spend cap does not count WalletConnect sends — a dApp can split a drain under the per-tx cap | `txLimits.js:67-77`; WC broadcast path writes no history row [AGENT] | 2026-09-14 |
| **M-7** (09-14) | MEDIUM (I4) | 09-07 M-1 latch fix incomplete: a stalled bridge hits the outer timeout before either latch runs | `getFreshRaspArtifact.js:88-95`, `nativeProbe.js:81,131-165` [AGENT] | 2026-09-14 |
| **M-8** (09-14) | MEDIUM (I3/I2) | Fast-path populate and read also compose attestation on unlock (since #2051, missed 09-07) | `native.js:644`, `:1330` (grep) | 2026-09-14 |
| **L-1..L-9** (09-14) | LOW | TP refusal leaves decrypted container in memory (L-1, [VERIFIED]); TP token not consumed on Digital Shield path (L-2); Argon2id OOM in step-up still counts as wrong PIN (L-3); unparseable-fee bypass of the 09-07 fee ceiling (L-4); Safe `SafeTx` and `address[]` spenders escape the typed-data backstop whose comment claims them (L-5); KEK `enroll`/`clearCredential` ungated by RASP (L-6); plaintext H/DEK residue on write paths (L-7); web RASP artifact can never be ALLOW (L-8); stale comments incl. fast-path "OFF by default" and a `PTRACE_TRACEME` false-positive risk (L-9) | per report; L-9 "OFF by default" re-confirmed at `native.js:1307`, `AndroidBiometricCachePlugin.kt:324` (grep) | 2026-09-14 |

### New this run — daily diffs and Gemini

| ID | Severity | Finding | File:Line | First reported |
|---|---|---|---|---|
| **DIFF-0912-N-1** | NEEDS-REVIEW | `partner-referral-codes.sql` drops only the `(text,text,text)` overload of `mint_partner_referral_code`; a surviving `(text,text)` overload defeats the platinum partner-tier default. Re-flagged 09-13 and 09-14; unfiled | `sql/partner-referral-codes.sql:98` (grep) | 2026-09-12 |
| **DIFF-0911-N-3** | NEEDS-REVIEW (I4) | Boot watchdog's recovery UI uses an inline `onclick`, which the app's own CSP (`script-src 'self' 'wasm-unsafe-eval'`) blocks — so the "user never sees a blank screen" claim of #2500 is false on exactly the path it exists for | `index.html:127` vs CSP at `index.html:32`, `public/_headers:7` (grep) | 2026-09-11 |
| **DIFF-0914-SOLANA-PIN** | NEEDS-REVIEW (A03) | `@solana/web3.js` is caret-ranged and absent from the H-4 exact-pin / Dependabot-ignore split despite sitting on the SOL signing path; a grouped Dependabot PR bumped it 1.98.4→1.99.0. Same gap reported for `hash-wasm`, `@stablelib/tss`, `@walletconnect/utils` | `package.json:158` `"^1.99.0"` (grep) | 2026-09-14 |
| **DIFF-SCANLIST-WORKERS** | PROCESS | The daily scan's pattern list does not include `workers/**`; proposed 09-12 and repeated three runs. A run cannot apply it itself — applying it is the handoff | `.claude/scheduled-tasks/veyrnox-daily-security-diff/SKILL.md` (doc, via agent grep) | 2026-09-12 |
| **GEM-0913-WIDGETS** | LOW (I4) | `/dashboard-widgets` ("Custom Widgets" in navigation) saves `dashboard-widget-config` and **nothing in `src/` reads it** — a control with no effect. Swept by panic wipe | `CustomDashboardWidgets.jsx:22`; only other reference is `panic.js:451` (grep) | 2026-09-13 |
| **GEM-0913-NEWS** | LOW (I3) | `NewsSentimentPage.jsx` saved-list query ungated; outside #2537's seven | `NewsSentimentPage.jsx:47` (grep) | 2026-09-13 |

### Carried

| ID | Severity | Finding | File:Line | First reported |
|---|---|---|---|---|
| **H-2** (08-25) | HIGH | KDF v2 broke chaff↔real parity for already-written footprints; only a rekey heals it. Wider than first described (`secondary`/`tertiary` slots) | `stealth.js`, `deniabilityKdfProfile.js` (doc) | 2026-08-25 |
| **M-5** (08-25) | MEDIUM | iOS has no FLAG_SECURE equivalent — only the `isCaptured` read | `IntegrityGate.swift:82`, `RaspIntegrityPlugin.m:201` (grep) | 2026-08-25 |
| **DIFF-0823-TIER** | MEDIUM (I3) | `bindOwnReferralCode()` egress demo-blind — `isDeniabilitySessionActive()` alone at three sites. **Still the last demo-blind holdout**, now outlived two more K-2 fix waves | `TierProvider.jsx:88,134,177` (grep) | 2026-08-23 |
| **DIFF-0823-CI** | MEDIUM | App Store archive built with `npm install --no-audit --legacy-peer-deps`; the script's own "flip back to `npm ci`" is **22 days** overdue | `ios/App/ci_scripts/ci_post_clone.sh:40` (grep) | 2026-08-23 |
| **DIFF-0823-BACKUP** | MEDIUM (I4) | Native seed backup marks the wallet backed up before anything is backed up | `WalletSeedQR.jsx:119-123` (grep) | 2026-08-23 |
| **DIFF-0830-QRSCAN** | LOW | QR WC entry bypasses `QRScanner`'s 2048-byte ceiling; `validateWcUri` has no length bound | `WalletConnect.jsx:93` (grep) | 2026-08-30 |
| **DIFF-0826-SESSTOKEN** | LOW | `ensureSessionToken()` writer unguarded against the pre-hydrate race | `SecurityCenter.jsx:94` (grep) | 2026-08-26 |
| **DIFF-0902-SHARD-PIN** | NEEDS-REVIEW | Shard-restore re-wrap drops passphrase to 8-digit PIN; narrowed to a suppression edge case. #2257 | `RestoreFromShares.jsx:16` (doc) | 2026-09-02 |
| **DIFF-0902-BACKUP-V1-BREAK** | NEEDS-REVIEW | Legacy v1/v2 backup read path dropped; fails honest. Owner call | `vaultBackup.js` (doc) | 2026-09-02 |
| **DIFF-0902-ASSETID-FIRSTMATCH** | NEEDS-REVIEW | Four readers collapse composite asset id to first match; inert until Phase 1b | `sendWalletSource.js:133` et al. (doc) | 2026-09-02 |
| **DIFF-0903-PORTFOLIO-CACHE-STALE** | NEEDS-REVIEW | Cached prices can render after transition to decoy | `usePortfolioMarketData.js:19-40` (doc) | 2026-09-03 |
| **DIFF-0825-FASTPATH-DOC** | LOW (I4) | Fast path described as opt-in/off-by-default after default-ON. **Folded into 09-14 L-9** | `native.js:1307`, `AndroidBiometricCachePlugin.kt:324` (grep) | 2026-08-25 |
| **DIFF-0829-TIPSECRET** | NEEDS-REVIEW | `TIP_SIGNING_SECRET` in git history; rotation claimed, unverifiable statically | `docs/SecurityAdvisor-TIP-integration.md:3` (doc) | 2026-08-29 |
| **DIFF-0905-GEMFILE-UNPINNED** | NEEDS-REVIEW | Unpinned fastlane gems beside signing credentials; fix claimed via #2342, self-authored | `android/Gemfile`, `ios/Gemfile` (doc) | 2026-09-05 |
| **DIFF-0905-IOS-REPLAYKIT** | NEEDS-REVIEW | ReplayKit gating analysis never concluded; likely moot after feature removal | `BugReportPlugin.swift` (doc) | 2026-09-05 |
| **DIFF-0816-REJECT** | LOW | `(code, message)` swap still present at one site | `RaspIntegrityPlugin.kt:146` (grep) | 2026-08-16 |
| **DIFF-0816-MAINSYNC** | LOW | `DispatchQueue.main.sync` deadlock risk | `IntegrityGate.swift:88` (grep) | 2026-08-16 |
| **DIFF-0730-MT** | MEDIUM (I4) | MT disclaimer flag is locale-wide but review covered only `security.json`; es/pt-BR/fr/it/es-419 all `false` | `src/i18n/index.js:81-114` (grep) | 2026-07-30 |
| **DIFF-0809-GOV** | GOVERNANCE | Custom GF(2⁸) Shamir on the DEK-share path; belongs in independent-audit scope | `src/wallet-core/shamir.js` (doc) | 2026-08-09 |
| **DIFF-0822-CODERABBIT** | INFO | `.coderabbit.yaml` routes full private source to a third party — recorded decision | `.coderabbit.yaml` (doc) | 2026-08-22 |
| **#2275** | MED (I4) | 1 `test.fixme` remains | `e2e/post-audit-validation.spec.js` (grep: 1) | 2026-09-03 |
| **G2-ROOTCERT-PIN / #2276** | HIGH → accepted residual | Play Integrity pin posture WARN. **Now in direct conflict with TP** — 09-14 H-5 turns this WARN into an unlock refusal | `PlayIntegrityJwsVerifier.kt`, `attestation.js:298` (doc) | 2026-07-15 |
| C-6 / C1 / weekly M-8 | CRITICAL | PIN counter in clearable storage; session floor mitigates, not persisted. Disclosed | `pinAttemptGuard.js:112` (grep) | 2026-06-26 |
| C2 | CRITICAL | 8-digit PIN offline-exhaustible on non-KEK vaults | `vault.js`, `keystore/native.js` (doc) | 2026-06-26 |
| H10 | HIGH | **16** SPKI pins still `PLACEHOLDER_*` | `src/wallet-core/rpc/pinning.js` (grep) | 2026-06-26 |
| H1 / H2 / BIO-01 / H-NEW-5 | HIGH | Biometric cache not OS-ACL bound to enrollment set; iOS TARGET by owner decision. 09-14 M-1 adds the Android storage-alias half | `biometricUnlock.js` (doc) | 2026-06-26 |
| BIO-02 | HIGH | App-layer biometric gate Frida-bypassable (disclosed). **09-14 H-4 is the same shape applied to a new feature that claims otherwise** | `biometricUnlock.js` (doc) | 2026-07-05 |
| H5 | HIGH | `captureVerifierSafe` OOM; 09-07 H-2 fixed the send side, 09-14 L-3 the verify side remains | `credentialVerifier.js:128-133` (doc) | 2026-06-26 |
| H-3 (07-01) | HIGH | Android biometric lockout → device-credential fallback (accepted deviation on the KEK path). **TP reuses this deviation where it is not accepted** (09-14 H-4) | `BiometricService` (doc) | 2026-07-01 |
| RASP-A1 | HIGH | Browser probe is a module-load snapshot | `browserProbe.js:76` (doc) | 2026-07-05 |
| D-04 | HIGH | I3 egress race: React `isDecoy` lags the module flag; class keeps producing sites | `WalletProvider.jsx` (doc) | 2026-07-05 |
| C-7 / #1111 | MEDIUM | Vault AAD v:3 — rated FIXED 08-17; migration flag live state not re-derived | `vault.js` (doc) | 2026-07-20 |
| P2-2 / M-K / M-1 (07-08) / PW-01 | MEDIUM | WC timing side-channel; passkey `signCount`; EVM key unzeroable (ethers v6); guarded wipe no re-auth | various (doc) | 2026-06-28 |
| weekly M-4 / M-6 / L-1..L-8 (07-14) | MED/LOW | RASP-blocked WC request UI; RaspSecurity under-claims; misc. **M-4 plausibly closed by 09-07 H-1** (refusals now throw) — not re-derived | various (doc) | 2026-07-14 |
| iOS re-sign tamper (07-14) | MEDIUM | Not detected; disclosed | `RaspIntegrityPlugin.m:488-529` (doc, 09-14 re-read) | 2026-07-14 |
| L-2 (08-03) | LOW | RASP detection-chain doc drift | `RaspIntegrityPlugin.kt` (doc) | 2026-08-03 |
| L-3..L-8 (08-25 carried) | LOW | Several marked FIXED in the 08-25 wave, not re-derived | (doc) | 2026-08-17 |

**Accepted-residual / by-design:** M1–M19, L1–L10 (06-26); M-NEW-1…12 (06-27);
F-05/F-11/CS-1/SC-1/RASP-2/RASP-4/RASP-5 (07-04);
D-01/D-02/D-05/D-06/SW-01/SW-02/PW-02/PW-04/PW-05/AL-01/AL-02/AL-06/BIO-03/BIO-05/BIO-06/BIO-07/RASP-A4
(07-05); `stream-json`/`jayson`; **09-07 L-2** (no counter on password unlock) and the
disclosure half of **09-07 L-3**; **#2497** FTL Robo never passing (owner waiver 2026-09-10,
row 5 walkthrough is the substitute). Consult the source audit for per-item rationale.

**Refuted on verification** (recorded so a future pass does not re-file): ROOTED→WARN
biometric ladder; "Play Integrity uses JWE not JWS"; "heuristic root checks fail open
per-check"; JS↔native bridge integrity; `HARDWARE_FACTOR_DEGENERATE` miscount; 07-20 weekly
H-2 (ColdSign, deleted); 08-23 Gemini "corrupted JSDoc"; 09-05 "fast-path cache survives
passkey registration" (narrow residual kept); 09-06 Gemini's three `Seed*` CRITICALs and dead
`SeedVerification.jsx`.
**New this run:** 09-08 **O-1** (test-only export ships — tree-shaken); 09-13 Gemini's
**two "dead file" LOWs** (`CorrelationMatrix.jsx` routed at `/correlation`,
`CustomDashboardWidgets.jsx` at `/dashboard-widgets`); 09-13 Gemini's **`Dashboard.jsx`
CRITICALs** — the ungated queries and localStorage write sit inside `DemoDashboard`, behind
`if (!DEMO) return <WalletPortfolioPage />`, and run on the in-memory demo client. The sweep's
own notes first rated `Dashboard.jsx` the highest-impact instance and corrected it the same
day (#2538). Every line number in the 09-13 sweep was again a corpus offset (1102–15214 on
files ≤541 lines).

---

## Needs On-Device / On-Chain / Live-Backend Verification 📱

| ID | Finding | Why verification is needed |
|---|---|---|
| **Theft Protection, end to end** | **New.** H-2 (fast-path silent DEK read inside the Keystore auth window), H-4 (passcode after five Face ID failures passes), H-5 (prevalence of WARN on genuine devices), M-4 (visible prompt difference). Every claim is code-path only; the reachability arguments are [AGENT] |
| **WC refusal-then-retry broadcast (09-14 H-3)** | Whether `@walletconnect/sign-client` 2.24.0 really throws "Record was recently deleted" on the post-broadcast respond, leaving the request queued, is [AGENT] from `node_modules`. A testnet dApp session with a cancelled-then-approved request would settle it — and would produce a txid if it is real |
| **#2537 / SendCrypto K-2 in a decoy session** | **New.** Both fixes are unit-level. No decoy or hidden session has opened the seven pages or sent from `SendCrypto` since |
| **`process.version` shim on cold Send parse** | **New.** 09-11 N-4 argues the Send chunk blanks again; it has not been reproduced on the 1.0.1 builds since #2500 |
| **Referral Worker redeploy** | **New.** #2534 fixed `/r/<code>` path parsing in source; no CI job deploys `workers/referral-redirect`, so the live Worker may still run the pre-fix code |
| **`partner-referral-codes.sql` live overloads** | **New.** Whether the stale `(text,text)` overload of `mint_partner_referral_code` exists on production and staging is a catalogue query, not a grep. Enumerate all three projects from the API |
| **H-3 PRODUCTION REVOKEs** | STAGE 2 of `sql/live-project-hardening-2026-08-07.sql` still commented out. Re-verify against the ref the shipped bundle connects to |
| **`ENVIRONMENT` / service-role scope** | Whether `SUPABASE_SERVICE_ROLE_KEY` is bound outside the Pages Production scope (canary lane) |
| **`register_referral_code` / `ai-referral-attribution-plan-family.sql`** | CODE only per the prod-DDL-after-merge rule |
| **RC referral chain end-to-end** | Armed 2026-09-08; #2527 records **zero redemptions ever on production**. A real sandbox purchase is still the only verification |
| **`TIP_SIGNING_SECRET` rotation** | Claimed (#2152); operational state |
| **`tip-chat` `vault:` strip deploy state** | No in-tree evidence of redeploy |
| **RASP on a Play-delivered install** | No Play Pre-launch report for any versionCode; no FTL Robo matrix has ever passed (#2497 waived 09-10). Owner stock-device walkthrough is the sole evidence |
| **1.0.1 golden path on an untouched device** | Unresolved by any static pass |
| **iOS App Attest, as shipped** | `appattest-environment` per build config (#2282/#2285); not archive-verified. **09-14 H-1 means TP will exercise it at unlock** |
| **Fast-path × duress** | Largest auth-surface coverage gap per 08-25; 09-14 M-8 adds an attestation-on-unlock question for decoy sets |
| **iOS native wave (#2094)** | Written and merged without compile or hardware run |
| **Android Enclave alias `.v1`→`.v2`** | Migration path never exercised on a device holding `.v1` |
| **Digital Shield** | No physical device has signed through it; no txid. 09-14 L-2 adds a TP token-consumption gap on this path |
| **iOS XCUITest signal** | #2543: ~37% failure rate with five signatures; advisory-only by decision (#2561) |
| **Firebase tripwires** | `workflow_dispatch`-gated; never executed |
| **iOS webview payload freshness** | Gitignored payload + unpinned `npm install` on the archive path (DIFF-0823-CI) |
| H-NEW-1 / H10 / C-1 v2→v3 / C-3 / C-4 | Repackaged-APK tamper; 16 placeholder pins + MITM validation; KEK salt migration; native H residue (09-14 L-7 widens the residue set) |
| weekly H-1 (07-14) / 07-20 H-1 / 09-07 M-4 | Timing equalisation and visible-outcome paint timing — code-correct, unmeasured on a hooked device |
| M13 / M14 / RASP hostile-device | FLAG_SECURE + CDP disable on release build; Frida session with txid |
| Safety Plus IAP | One real full-price purchase; **no promotional-offer path exercised** on either platform |
| `@scure/bip32` zeroization | Getter copy-vs-buffer not verified |
| Independent audit | Entire KEK + vault + Shamir + Digital Shield + Theft Protection + S1–S4 surface. **Outstanding** — no internal, ECC, Codex, Gemini or CodeRabbit pass substitutes |

---

## Regressed 🔴

| ID | Finding | What broke |
|---|---|---|
| **09-14 H-3** (from 09-07 H-1 fix, #2422) | A refused WC request stays queued with Approve enabled; a retry passes the gates, signs and broadcasts after the dApp was told "rejected". With sign-client's post-broadcast respond throwing, each further tap may broadcast again with a fresh nonce [AGENT] | #2422 made every gate refusal `throw` so the user sees it (correct, I4). The queue filter in all three signing wrappers and `handleRejectRequest` runs **after** the awaited handler, not in a `finally`, so the throw skips it (grep: `WalletConnectProvider.jsx:1096`, `:1115`, `:1211`, `:1216`). The 09-07 report's own refutation of this path relied on the filter running "unconditionally" — true before its fix, false after. **TP (`4ba80bbf`) made it reachable by a routine action**: cancel Face ID once, approve again. **Unfiled.** |
| **DIFF-0911-N-4** (fix `0dc4f673`/#2435 reverted by `bf68a1be`/#2500) | `process.version` shim removed; `bs58check`'s bundled `readable-stream` reads `process.version.slice(0, 5)` at module init, which is what blanked the Send page on cold parse | #2500 rewrote the `process` shim in `src/main.jsx` for a blank-on-launch guard and dropped the `version` field #2435 had added. At this pin: `{ env: {}, browser: true, versions: {}, platform: 'browser' }` (grep, `:24-26`); `git show 0dc4f673 -- src/main.jsx` shows the removed `globalThis.process.version = ''`. Flagged by the daily scan 09-11, re-confirmed 09-13 and 09-14. **Unfiled.** Not reproduced on device — listed in the verification table |

**Both regressions share a shape with the closed ones before them: a fix rewrote a block
and dropped a property the previous version guaranteed, and nothing pinned that property.**
#2422 had tests that a refusal throws; none that a refused request leaves the queue. #2435
had no test that `process.version` is a string. The historical record — the release-cert
guard (four regressions), the iOS `reject:` arg swap, telemetry consent, C-1 salt binding,
C-01 pre-sign gate, ECC F-P3-3, Digital Shield send-gate bypass, `screenAssetContract` I3
egress, and the bug-report SQL policy (closed 09-07) — is in `git show
acbb5ebe:docs/audit-findings-tracker.md`.

---

## Patterns worth naming, from this window

**1. A new security feature that calls an existing gate inherits the callee's contract,
not its name.** The 09-14 weekly's own framing, and the strongest single lesson of the
window: `getFreshRaspArtifact` composes attestation, `verifyBiometric2fa` accepts the
passcode, `TIER.ALLOW` excludes the WARN that #2276 was accepted at. Each fact was written in
the callee's header. Review for a feature like TP should read every imported gate's header
as part of the diff.

**2. Report-only findings wait; filed findings get fixed.** #2515 and #2517 were each fixed
within hours of being filed. DIFF-0911-N-1 (passcode fallback), DIFF-0911-N-3 (CSP-blocked
watchdog), DIFF-0911-N-4 (reverted shim), DIFF-0912-N-1 (SQL overload) and DIFF-0912-N-2
(over-limit by passcode) were each re-confirmed by up to three consecutive daily scans and
none has an issue. The daily scan is not permitted to file; nothing else in the loop does it
for the scan. **The scan-list `workers/**` handoff is the same gap in a different place.**
This tracker can only record the backlog; it cannot file it either.

**3. A fix that closes an audit finding can create the next one, and the next audit is
what finds it.** 09-07 H-1 → 09-14 H-3; 09-07 M-1 → M-7; 09-07 M-6 → M-1. All three were
merged with regression tests for the defect they fixed and none for the invariant the old
code maintained incidentally. The 09-14 weekly caught all three only because it re-derived
each prior finding rather than carrying its status — worth keeping as a standing rule for
the weekly.

**4. Gemini's signal-to-noise held steady, and its self-correction is now part of the
output.** 09-13: one real class (seven pages, fixed same day), one real LOW, the rest refuted —
including CRITICALs on demo-only code. The sweep's notes rated `Dashboard.jsx` the
highest-impact instance, then withdrew it the same day because **a page file's default
export is not necessarily the component a user sees**. That generalises beyond Gemini: before
rating any `src/pages/` finding, read `export default` and follow any `DEMO` split.

**5. A standing checklist rots even when the code it checks is healthy.** H3's
`PRIMARY_UNLOCK_EQUALIZER_MS` was removed because a better control replaced it, and a grep
for the old name returns only the comments recording its removal. That is the same
absence-check-matches-its-own-documentation failure CLAUDE.md records three times, arriving
through the runbook instead of a test pin. This is the fourth run to ask for the ColdSign
check to be deleted; the runbook has not changed.

---

*Automated weekly tracker. Static analysis only — does not substitute for on-device,
on-chain, or live-backend verification. "FIXED" = the code change is present on
`origin/main`; it is not a claim the control is verified working. SQL migrations are
counted as unexecuted text until their own verification queries have been run against the
**live project confirmed from the shipped client bundle**, not from a project name. The
independent third-party audit remains outstanding and is not substituted by any internal,
ECC-skill, second-model (Codex), long-context (Gemini), or third-party-reviewer (CodeRabbit)
pass.*
