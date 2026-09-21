# Audit Findings Tracker
Last updated: 2026-09-21
Analysed against: origin/main @ `cc1cc4eb84e226414ee29eed5e0df9f4b57d8051`
(clean branch worktree cut from `origin/main` per Step 0 — not the live checkout,
not a `git show` fallback. macOS/zsh.)

> Automated weekly synthesis of every finding across the audit corpus, checked against a
> **pinned snapshot of `origin/main`**. **Static analysis only.** "FIXED" means the code
> change is present on `main` — it does **not** mean the control is verified working
> on-device, on-chain, or against a live backend. Rows tagged `(grep)` were re-verified
> against source this run; rows tagged `(doc)` carry the status recorded in an audit doc or
> PR history and were not independently re-checked.

## Window since last run

Previous run analysed `885490ad` (2026-09-14). `main` has moved **142 commits** since
(~95 non-merge). **No new weekly audit was published in the window** — the 09-21 weekly had
not landed at this pin — so the 09-14 weekly is still the newest full audit, and every one
of its findings was re-grepped rather than carried.

## Sources synthesised

Carried from prior runs, unchanged: the 06-26 through 09-14 corpus, `docs/audit-triage/`
(29 files), `docs/security-audits/` (11 files), `docs/honesty-check-2026-08-31.md`,
`docs/audit-gemini-sweep-2026-09-13.md`.

**New this run:**

- **`docs/security-diffs/diff-2026-09-15.md` … `diff-2026-09-19.md`** — 5 daily scans (09-18
  has three passes). No `diff-2026-09-20`/`-21` at this pin — **the first break in the daily
  series since it started**. 7 non-SAFE items; 3 resolved in-window.
- **"2026-09-16 surface audit"** — eight findings (2 MED, 2 LOW-MED, 2 LOW, 2 INFO) across
  Pages Functions, Edge Functions and `sql/`, **recorded only in the commit message of
  `ead82be8` (#2580)**. There is no audit doc. All eight were fixed in that commit; one (#5,
  referral RPC REVOKEs) is SQL that has not been applied live.
- **Issues filed in-window** that are security- or honesty-relevant: #2595/#2628/#2677 (boot
  watchdog), #2659/#2662/#2676 (tip-chat entitlement gate), #2674 (referral bonus grant),
  #2655 (prod Buy 401), #2639/#2640 (pending-referral overwrite/consumption), #2575 (sticky
  `?demo=1` on the production web build).
- No new files in `docs/audit-triage/`, `docs/security-audits/`, or
  `docs/dependency-audits/` this window.

## Summary

- Total findings catalogued: **~365** (dedup across the corpus; MEDIUM/LOW grouped — the
  count is approximate by construction and the delta matters more than the absolute)
- Fixed (code-confirmed): **~297** — **~17 closed this run**, of which **5 were re-verified
  by grep** against the pinned snapshot
- Still open / accepted-residual: **~66** — flat. The window closed about as much as it added
- **Regressed: 2** — unchanged, and both are the same two as last week. Neither is filed
- Needs on-device / on-chain / live-backend verification: **31** (three new: OTA first armed build, 09-16 #5 REVOKEs, staging tip-chat gate)

**The headline is what did NOT move.** Every one of the 09-14 weekly's 22 open findings —
including all five HIGHs and the Regressed WC retry-broadcast — is still present at this pin,
re-verified by grep, and **none has an issue**. Meanwhile Theft Protection gained a feature
(#2680, a seeded $500 per-tx cap) that routes more sends through the same gate the HIGHs
describe. Everything that *was* filed this week was fixed within a day.

---

## What changed this run

### The 09-14 weekly: zero of 22 fixed, zero filed

Re-grepped at `cc1cc4eb`:

| 09-14 | Still true at this pin |
|---|---|
| H-1 attestation on unlock | `theftProtection.js:33` imports `getFreshRaspArtifact`, default arg at `:163` (grep) |
| H-2 no TP on fast path | `WalletProvider.jsx` `unlockBiometricOnly` (`:2308`) has no TP reference; TP callers are `WalletProvider.jsx:1939`, `WalletConnectProvider.jsx:682`, `SendCrypto.jsx:1818` only (grep) |
| H-3 WC refused request stays queued | queue filters still plain statements after the awaited handler at `WalletConnectProvider.jsx:1089`, `:1108`, `:1204`, `:1209` — no `finally` (grep). Line numbers moved; code did not |
| H-4 passcode accepted as "biometric" | `biometric.js:161,168` `allowDeviceCredential: true`; no `androidBiometryStrength` in `src/` (grep) |
| H-5 WARN ⇒ unlock refusal | `theftProtection.js:181` `raspTier !== TIER.ALLOW` (grep) |
| M-1 storage alias not auth-bound | `AndroidBiometricCachePlugin.kt:530-531` `requiresAuth = false`; `REQUIRES_USER_AUTH_LEGACY` still has no production reader (grep) |
| M-2 migration re-enables Biometric Unlock | `fastpathUnlock.js:131`, `:146` (grep) |
| M-8 fast path composes attestation | `native.js:644`, `:1330` (grep) |
| L-9 "OFF by default" | `native.js:1307`, `AndroidBiometricCachePlugin.kt:324` (grep) |

**#2680 widens the blast radius of H-4 and M-5.** Switching TP on now seeds an enabled $500
per-tx limit, so every over-$500 send — including WC sends — is cleared by
`verifyBiometric2fa`, which accepts the device passcode. Before #2680 that path fired only for
users who had configured a limit themselves.

### Boot watchdog: fixed properly, after three rounds

DIFF-0911-N-3 (inline `onclick` blocked by the app's CSP) turned out to be worse than
reported: **the whole watchdog was an inline `<script>` and had never executed once**
(#2595). Fixed in three steps — #2614 moved it to `public/boot-watchdog.js` (`index.html:142`,
grep: no inline `onclick` remains), `3f8bb79e` made it test for paint rather than mount
(#2628), #2645 paints a pre-JS shell. CLAUDE.md now records the general lesson (an
absence-assertion cannot tell dormant from dead). **Closed.** Note #2677 (release bundle on
simulator: watchdog fires, reload does not recover) was closed in-window — not re-derived here.

### tip-chat: an entitlement gate that had never run in production

Found by the 09-17 daily scan as deployment drift, confirmed live 09-18, filed #2659 on
09-20: the deployed `tip-chat` predated the `ai_security_protection` gate merged 2026-08-23,
so AI Security Protection was enforced client-side only for ~4 weeks. Fixing it surfaced two
more defects the gate itself carried — the lookup hit RevenueCat v1 with a v2 key and would
have denied every subscriber (#2662, `fd3078fc`) — and the same bug in `first-referral-bonus`
(#2674, `6d54920d`). Prod redeployed from `fd3078fc`, deployed source diffed byte-identical,
403/403/200 verified live (`fef94415`, doc). #2676 (3s budget, silent failure paths) remains
open.

### Transak: the "rotated — closed" record was wrong, and is now right

`7cf6aa54` found that the 2026-08-29 "rotated" record for the published Transak prod pair was
never true — the squash-merged blobs are redacted, so every rotation check had grepped a clean
file, while the values sat in a pre-squash branch commit on the public repo. `a0654cc2`: the
secret was rotated 2026-09-19 and redeployed; the API key rides in every widget URL and is
public by design. **Exposure closed (doc).** Prod Buy has been down since ~09-16 on a separate
401 (#2655, account provisioning).

### Closed this run

| ID | Sev | Finding | Closed by | Confirmed by |
|---|---|---|---|---|
| **DIFF-0911-N-3** / #2595 / #2628 | NEEDS-REVIEW (I4) | Boot watchdog blocked by CSP, never executed; then tested mount not paint | #2614, `3f8bb79e`, #2645 | **grep**: `index.html:142` `<script src="/boot-watchdog.js">`, no inline handler |
| **#2537** second/third wave | HIGH (I3) | Nine more shared-store pages (WatchWallets, WhitelistManager, CryptoDetailPage, HDWalletManager, ConnectWallet, AddressBook, NotificationCentre, WatchlistPage…) | #2647, #2649, #2593 | (doc) commit bodies; **#2537 CLOSED 2026-09-19**. #2649 also corrects the first wave's own audit (four of nine "ungated" files were already gated) |
| **#2659 / DIFF-0917 tip-chat drift** | HIGH (entitlement) | Deployed tip-chat had no entitlement gate | redeploy from `fd3078fc` | (doc) `fef94415` live 403/403/200 |
| **#2662**, **#2674** | MED | RevenueCat v1 queried with a v2 key (tip-chat gate; referral bonus grant) | `fd3078fc`, `6d54920d` | (doc) |
| **Transak prod secret** | HIGH (secret) | Published secret recorded as rotated when it was not | rotated 2026-09-19 | (doc) `a0654cc2` — operational state |
| **09-16 surface audit #1–#4, #6–#8** | MED/LOW/INFO | `X-Rc-User-Id` dropped by edge proxy; raw RC error body logged; Transak log could leak wallet address; webhook verify default "off" + no body cap; `rpc/[fn].js` no body cap; raw RSS `href`; false Content-Type claim | #2580 (`ead82be8`) | (doc) commit message — no audit doc exists |
| **09-16 surface audit #5** | LOW | `get_referral_count`/`get_referral_tier` anon-executable | #2580 (code) | **Code only** — 09-18 diff confirmed NOT applied on prod or staging. Listed in verification table |
| **PaywallNudge comment**, **`selectedAiPackage` cross-period mis-sale**, **referral-tier retry exhaustion** | NEEDS-REVIEW / finding | 09-18 daily | `63ee8e08` (#2602) | (doc) 09-18 third pass |
| **#2575** | MED (I4) | Production web wallet honoured sticky `?demo=1` (Pages build lacked `VITE_RELEASE=1`) | #2594 | (doc) |
| **CORS dev origin**, **CSP index.html vs `_headers` drift**, **floating action refs** | LOW | Vite dev origin reflected in prod; two CSPs disagreed and the guard could not fail; five unpinned action refs | `4b40daf8`, `fd5b3a86`, `e987393c` | (doc) 09-16 diff rated SAFE/ADDED |
| **Panic residue: biometric markers** | LOW (I3) | Two biometric markers survived panic wipe | `c3f14f7f` | (doc) |
| **Secrets in CI** | PROCESS | No CI gate on new secrets; tracked-`.env` invariant unpinned | #2591 | (doc) |

---

## ⚠️ Checklist drift — standing Step-2 checks that are now wrong

| Check | Why it breaks | Correct check going forward |
|---|---|---|
| `H3: is PRIMARY_UNLOCK_EQUALIZER_MS ≥ 1500?` | **Second run asking.** The constant was **removed** — `WalletProvider.jsx:234` and `deniabilityUnlock.js:77,191` record that it only bridged ~1.4 of a 3-KDF deficit and was superseded by a KDF-count equalizer. Grepping for it returns only history comments, which reads as "open" or, worse, as a pass on the comment. | Assert the H-1 primary-success cost equalizer in `deniabilityUnlock.js` performs the same KDF count on all three outcomes; the 09-05 weekly counted 5 by hand. |
| `C3/H7/C4: WalletConnectProvider.jsx` | Carried. File is `src/lib/WalletConnectProvider.jsx`, not `src/components/`. | Same assertions, correct path. Re-verified: `presignGateOrReject` ×7, `proceedAllowed` ×9, `domain.chainId` bound at `:516-537` and pre-modal `:933` (grep). |
| `H11: does ColdSign.jsx hardcode TIER.ALLOW?` | **Fifth run asking for this to be dropped.** File deleted in #1796; still absent (grep). | **Delete the check.** |
| `H4: twoFactorGate.js` | Carried. File is `src/lib/twoFactorGate.js`. | Single opaque `WRONG: 'WRONG'` at `:32`, one message at `:77` (grep). |
| `DIFF-0823-VC` | **Retire.** Closed by removing the number from the catalogue. | Nothing to check; the catalogue test pins absence. |
| `M20/H-NEW-4: kek.js combineKek` | Carried. Module is `src/wallet-core/keystore/kek.js`. | `zero(ikm)` at `:248` **and** `:280` (grep). |
| `DIFF-0816-MAINSYNC: IntegrityGate.swift:88` | Carried. Path `ios/App/CapApp-SPM/Sources/CapApp-SPM/`. | Still `DispatchQueue.main.sync` at `:88` — **still open** (grep). |
| `H6: BLOCKED_METHODS` | Carried. File is `src/wallet-core/evm/walletconnect/router.js`. | Present at `:48`; includes `eth_signTransaction` at `:50` (grep). |
| `C6/H13: CryptoSigning.jsx` | Carried. Signing scoped inside `withPrivateKey(index, fn)`. | Assert no `privateKey`/`mnemonic` state and `copyPlain` for copies. Re-checked this run: `withPrivateKey` at `:90`, `copyPlain` at `:24`, no key state (grep). |
| `H-NEW-1: EXPECTED_CERT_SHA256` | **New.** Lives in `android/app/src/main/java/com/veyrnox/app/RaspIntegrityPlugin.kt`; a `git ls-files` glob also matches a non-existent `packages/capacitor-rasp-integrity/...` path, so a naive loop errors and reads as "not found". | `:821` reads `BuildConfig.RELEASE_CERT_SHA256` (grep). |
| `M-2 (07-08): hw-send.js` | Carried. Paths deleted in #2032. | Re-point at `src/wallet-core/hw/digitalShield.js`. |

Re-verified unchanged and still correct at `cc1cc4eb` (grep): **C3**, **C4** (`RequestApprovalModal.jsx:240-242`
reads session peer metadata, never `params.proposer`), **H7**, **H6**, **H-NEW-3**
(`copySecret.js` non-empty `WIPE_REPLACEMENT` at `:111`, `visibilitychange` at `:170`),
**H-NEW-4** (`keystore/web.js` zeroes H/C/kek/dek on every path, e.g. `:366-383`),
**H4**, **H15/H16** (`setIsStrongBoxBacked(true)` best-effort at `HardwareKekPlugin.kt:246`;
`AUTH_DEVICE_CREDENTIAL` only in the two removal comments `:23`, `:95`), **H-NEW-1**
(`RaspIntegrityPlugin.kt:821` from `BuildConfig`, blank ⇒ fail-closed at `:829`), **M20**,
**H10** (still **16** `PLACEHOLDER_` entries — **open**), **RASP-A2** (`SendCrypto.jsx:1271`,
`:1464` `?? TIER.BLOCK`; no `?? TIER.ALLOW`), **C6/H13**.

---

## Still Open ⚠️

### 09-14 weekly — still nothing fixed, nothing filed (re-grepped at `cc1cc4eb`)

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
| **M-5** (09-14) + DIFF-0912-N-2 | MEDIUM | Over-limit WC sends now cleared by a generic biometric (or passcode, per H-4) prompt; the modal never shows the cap breach. **Daily scan flagged 09-12; unfiled. Widened by #2680** — TP now seeds a $500 per-tx limit, so every TP user hits this path above $500 | `RequestApprovalModal.jsx` — zero `limit` references (grep) | 2026-09-12 |
| **M-6** (09-14) | MEDIUM | Daily spend cap does not count WalletConnect sends — a dApp can split a drain under the per-tx cap | `txLimits.js:67-77`; WC broadcast path writes no history row [AGENT] | 2026-09-14 |
| **M-7** (09-14) | MEDIUM (I4) | 09-07 M-1 latch fix incomplete: a stalled bridge hits the outer timeout before either latch runs | `getFreshRaspArtifact.js:88-95`, `nativeProbe.js:81,131-165` [AGENT] | 2026-09-14 |
| **M-8** (09-14) | MEDIUM (I3/I2) | Fast-path populate and read also compose attestation on unlock (since #2051, missed 09-07) | `native.js:644`, `:1330` (grep) | 2026-09-14 |
| **L-1..L-9** (09-14) | LOW | TP refusal leaves decrypted container in memory (L-1, [VERIFIED]); TP token not consumed on Digital Shield path (L-2); Argon2id OOM in step-up still counts as wrong PIN (L-3); unparseable-fee bypass of the 09-07 fee ceiling (L-4); Safe `SafeTx` and `address[]` spenders escape the typed-data backstop whose comment claims them (L-5); KEK `enroll`/`clearCredential` ungated by RASP (L-6); plaintext H/DEK residue on write paths (L-7); web RASP artifact can never be ALLOW (L-8); stale comments incl. fast-path "OFF by default" and a `PTRACE_TRACEME` false-positive risk (L-9) | per report; L-9 "OFF by default" re-confirmed at `native.js:1307`, `AndroidBiometricCachePlugin.kt:324` (grep) | 2026-09-14 |

### Daily diffs, Gemini, and in-window issues

| ID | Severity | Finding | File:Line | First reported |
|---|---|---|---|---|
| **DIFF-0912-N-1** | NEEDS-REVIEW | `partner-referral-codes.sql` drops only the `(text,text,text)` overload of `mint_partner_referral_code`; a surviving `(text,text)` overload defeats the platinum partner-tier default. Re-flagged 09-13 and 09-14; unfiled | `sql/partner-referral-codes.sql:98` (grep) | 2026-09-12 |
| **DIFF-0914-SOLANA-PIN** | NEEDS-REVIEW (A03) | `@solana/web3.js` is caret-ranged and absent from the H-4 exact-pin / Dependabot-ignore split despite sitting on the SOL signing path; a grouped Dependabot PR bumped it 1.98.4→1.99.0. Same gap reported for `hash-wasm`, `@stablelib/tss`, `@walletconnect/utils` | `package.json:158` `"^1.99.0"` (grep) | 2026-09-14 |
| **DIFF-SCANLIST-WORKERS** | PROCESS | The daily scan's pattern list does not include `workers/**`; proposed 09-12 and repeated three runs. A run cannot apply it itself — applying it is the handoff | `.claude/scheduled-tasks/veyrnox-daily-security-diff/SKILL.md` (doc, via agent grep) | 2026-09-12 |
| **GEM-0913-WIDGETS** | LOW (I4) | `/dashboard-widgets` ("Custom Widgets" in navigation) saves `dashboard-widget-config` and **nothing in `src/` reads it** — a control with no effect. Swept by panic wipe | `CustomDashboardWidgets.jsx:22`; only other reference is `panic.js:451` (grep) | 2026-09-13 |
| **GEM-0913-NEWS** | LOW (I3) | `NewsSentimentPage.jsx` saved-list query ungated; outside #2537's seven, and not in #2647/#2649's waves either. #2537 is now CLOSED with this page ungated | `NewsSentimentPage.jsx:47` (grep) | 2026-09-13 |
| **DIFF-0915-OTA-PREUNLOCK** | NEEDS-REVIEW (I3) | OTA update check fires **before unlock**, before session type is known. Design claims real/decoy/demo parity (`otaUpdate.js:8-9`); the scan wants that parity argued against I3 rather than asserted. **Escalated 09-19: both hardware keys are now pinned**, so 1.0.2 is the first build where the request actually fires | `src/lib/otaUpdate.js`, `src/main.jsx:54`; keys at `VeyrnoxOta.swift:34` (grep: non-empty) | 2026-09-15 |
| **09-16 surface #5** | LOW | `get_referral_count` / `get_referral_tier` still anon-executable and outside the rate limit; REVOKE SQL shipped in #2580 but **not applied** to either wallet project (09-18 live query) | `sql/api-security-hardening.sql:633`, `sql/get-referral-tier.sql` (doc) | 2026-09-16 |
| **#2676** | MEDIUM | tip-chat entitlement gate's 3s budget covers two RevenueCat round trips on a cold isolate; neither failure path logs | `supabase/functions/tip-chat/index.ts` (doc) | 2026-09-20 |
| **#2639 / #2640** | MEDIUM | A later invite link overwrites an unredeemed pending referral; a failed redemption consumes the code permanently and silently. `86ebe38a` ("preserve pending codes until redemption succeeds") landed; both issues still OPEN | referral capture path (doc) | 2026-09-19 |
| **#2655** | HIGH (availability) | Prod Buy down since ~09-16: Transak create-session `401 invalid_api_key`. Diagnosed as partner-side account provisioning, not wiring | `functions/api/buy/session.js` (doc) | 2026-09-19 |

### Carried

| ID | Severity | Finding | File:Line | First reported |
|---|---|---|---|---|
| **H-2** (08-25) | HIGH | KDF v2 broke chaff↔real parity for already-written footprints; only a rekey heals it. Wider than first described (`secondary`/`tertiary` slots) | `stealth.js`, `deniabilityKdfProfile.js` (doc) | 2026-08-25 |
| **M-5** (08-25) | MEDIUM | iOS has no FLAG_SECURE equivalent — only the `isCaptured` read | `IntegrityGate.swift:82`, `RaspIntegrityPlugin.m:201` (grep) | 2026-08-25 |
| **DIFF-0823-TIER** | MEDIUM (I3) | `bindOwnReferralCode()` egress demo-blind — `isDeniabilitySessionActive()` alone at three sites. **Still the last demo-blind holdout**, now outlived four K-2 fix waves (#2647 and #2649 this week) | `TierProvider.jsx:88,134,177` (grep) | 2026-08-23 |
| **DIFF-0823-CI** | MEDIUM | App Store archive built with `npm install --no-audit --legacy-peer-deps`; the script's own "flip back to `npm ci`" is **29 days** overdue | `ios/App/ci_scripts/ci_post_clone.sh:40` (grep) | 2026-08-23 |
| **DIFF-0823-BACKUP** | MEDIUM (I4) | Native seed backup marks the wallet backed up before anything is backed up | `src/pages/WalletSeedQR.jsx:119-120` — `setPrinted(true); confirmWalletBackup(...)` run on the native branch too (grep) | 2026-08-23 |
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
| **OTA, first armed build (1.0.2)** | **New.** Two keys pinned (`VeyrnoxOta.swift:34`); the pre-unlock update check fires for the first time on 1.0.2. Whether the request pattern is identical across real/decoy/demo (I3) is a network-capture question. No OTA bundle has ever been applied on a device |
| **09-16 surface #5 REVOKEs** | **New.** SQL in #2580 not applied on prod or staging as of 09-18. Apply per the prod-DDL-after-merge rule and re-query `has_function_privilege` for `anon` |
| **tip-chat gate, staging** | **New.** Prod redeployed and verified 403/403/200 (`fef94415`); `3ad35313` recorded staging v14 as ungated too — staging redeploy not evidenced in-tree |
| **WC refusal-then-retry broadcast (09-14 H-3)** | Whether `@walletconnect/sign-client` 2.24.0 really throws "Record was recently deleted" on the post-broadcast respond, leaving the request queued, is [AGENT] from `node_modules`. A testnet dApp session with a cancelled-then-approved request would settle it — and would produce a txid if it is real |
| **#2537 / SendCrypto K-2 in a decoy session** | All three waves (#2537 first wave, #2647, #2649) are unit-level; **#2537 was closed 2026-09-19 without a decoy session exercising any of them**. CLAUDE.md records that a simulator cannot open a decoy session at all — this needs a physical device |
| **`process.version` shim on cold Send parse** | 09-11 N-4 argues the Send chunk blanks again; it has not been reproduced on the 1.0.1 builds since #2500 |
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
| **09-14 H-3** (from 09-07 H-1 fix, #2422) | A refused WC request stays queued with Approve enabled; a retry passes the gates, signs and broadcasts after the dApp was told "rejected". With sign-client's post-broadcast respond throwing, each further tap may broadcast again with a fresh nonce [AGENT] | #2422 made every gate refusal `throw` so the user sees it (correct, I4). The queue filter in all three signing wrappers and `handleRejectRequest` runs **after** the awaited handler, not in a `finally`, so the throw skips it (grep at `cc1cc4eb`: `WalletConnectProvider.jsx:1089`, `:1108`, `:1204`, `:1209` — moved, unchanged). The 09-07 report's own refutation of this path relied on the filter running "unconditionally" — true before its fix, false after. **TP (`4ba80bbf`) made it reachable by a routine action**: cancel Face ID once, approve again; **#2680 makes that routine for every WC send over $500 once TP is on.** **Unfiled, second week.** |
| **DIFF-0911-N-4** (fix `0dc4f673`/#2435 reverted by `bf68a1be`/#2500) | `process.version` shim removed; `bs58check`'s bundled `readable-stream` reads `process.version.slice(0, 5)` at module init, which is what blanked the Send page on cold parse | #2500 rewrote the `process` shim in `src/main.jsx` for a blank-on-launch guard and dropped the `version` field #2435 had added. At `cc1cc4eb`: `{ env: {}, browser: true, versions: {}, platform: 'browser' }` (grep, `main.jsx:24-25`); no `process.version` anywhere in `src/`, `public/`, `index.html` or `vite.config.js`; `git show 0dc4f673 -- src/main.jsx` shows the removed `globalThis.process.version = ''`. Flagged by the daily scan 09-11, re-confirmed 09-13 and 09-14, **then dropped from the scan's carried list** — none of the 09-15..09-19 diffs mentions it. **Unfiled, second week.** Three watchdog PRs (#2614, `3f8bb79e`, #2645) rewrote the same boot path this week without restoring it Not reproduced on device — listed in the verification table |

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

**1. The filed/unfiled split is now the whole story.** Every issue opened this week that
touched security or honesty — #2595, #2628, #2659, #2662, #2674, #2575, #2537's later waves —
was fixed within about a day. Every finding that lives only in a report — all 22 from the
09-14 weekly, DIFF-0911-N-4, DIFF-0912-N-1, DIFF-0914-SOLANA-PIN, the two Regressed rows —
moved zero. The weekly audit, the daily scan and this tracker are all forbidden from filing.
**Nothing in the loop converts a report finding into an issue**, and after two weeks that is
indistinguishable from accepting them.

**2. The daily scan's carried list decays silently.** DIFF-0911-N-4, DIFF-0912-N-1 and
DIFF-0914-SOLANA-PIN were re-confirmed on three consecutive days and then vanished from the
09-15..09-19 reports — not resolved, not re-stated. The 09-18 second pass proposed exactly the
fix ("carried-forward items are re-verified, not re-stated"); like the `workers/**` scan-list
handoff before it, it is a handoff nobody has applied. And the daily series itself has a gap:
no report for 09-20 or 09-21.

**3. An audit that exists only as a commit message is invisible to every reader but this
one.** The 09-16 surface audit's eight findings are in `ead82be8`'s body and nowhere under
`docs/`. Seven were fixed in that commit, which is fine; the eighth is live-unapplied SQL,
and the only place that says so is a daily diff. A finding that can be left open needs a file
or an issue.

**4. "Deployed" is a separate claim from "merged", and both halves of this week's biggest fix
were about that gap.** tip-chat's gate was merged 2026-08-23 and never deployed; the Transak
secret was recorded rotated and never was, because the check read a redacted squash blob. Both
were found by reading the live object instead of the record. Same shape as the SQL-applied
question (09-16 #5) and the referral Worker redeploy (#2534) — the verification table now
carries four of these.

**5. A new feature routed through an open finding widens it without touching it.** #2680's
seeded $500 limit is a reasonable product fix for a real gap (TP protected unlock and nothing
else). It also makes 09-14 H-3, H-4 and M-5 reachable by default for every TP user. None of
those three were mentioned in #2680. Review for a change that increases traffic through a
gate should read that gate's open findings, not only its code.

---

*Automated weekly tracker. Static analysis only — does not substitute for on-device,
on-chain, or live-backend verification. "FIXED" = the code change is present on
`origin/main`; it is not a claim the control is verified working. SQL migrations are
counted as unexecuted text until their own verification queries have been run against the
**live project confirmed from the shipped client bundle**, not from a project name. The
independent third-party audit remains outstanding and is not substituted by any internal,
ECC-skill, second-model (Codex), long-context (Gemini), or third-party-reviewer (CodeRabbit)
pass.*
