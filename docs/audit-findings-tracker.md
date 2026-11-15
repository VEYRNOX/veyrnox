# Audit Findings Tracker
Last updated: 2026-10-26
Analysed against: origin/main @ `88cbe054f5cd3d40b080c8fbe86d36ae5ec33b96`
(clean branch worktree cut from `origin/main` per Step 0 — not the live checkout,
not a `git show` fallback. macOS/zsh.)

> Automated weekly synthesis of every finding across the audit corpus, checked against a
> **pinned snapshot of `origin/main`**. **Static analysis only.** "FIXED" means the code
> change is present on `main` — it does **not** mean the control is verified working
> on-device, on-chain, or against a live backend. Rows tagged `(grep)` were re-verified
> against source this run; rows tagged `(doc)` carry the status recorded in an audit doc or
> PR history and were not independently re-checked.

## Window since last run (2026-10-12 → 2026-10-26)

Previous run analysed `4b98715a`. `main` has moved **12 commits** since (`88cbe054`). **Zero
commits touch `src/wallet-core`, `src/rasp`, `android/`, `ios/App/App`, `supabase/` or
`functions/`.** Code changes: Settings i18n extraction (#2890/#2891), Vigil owl paywall
animation (#2902), a repo-wide `.npmrc` (#2903). **No finding fixed, none regressed this window.**

**The 2026-10-12 weekly internal audit landed** (#2887, `docs/audit-2026-10-12-weekly.md`)
*after* the 10-12 tracker (#2884) was cut, so this is the first tracker to ingest it. Every
carried item is STILL PRESENT; it adds 5 new items (below). It could not locate the 09-28 H-5
(refused WC request stays queued) at its cited lines and did not re-read L-4/L-5 — those two
are carried by prior status, not re-confirmed by that audit.

**Re-verified this run (grep, at `88cbe054`):** M-7 `SceneDelegate.swift:67-73`
`QA-INSTRUMENT-TEMP` present (seventh consecutive window unfiled); H-3 `kekProfiles.js:101`
`usedFallback: !stamped && i > 0` unchanged; H-1 `typed-data.js` 0 hits for
`TransferWithAuthorization`; N-B2 `RequestApprovalModal.jsx:89` unguarded `BigInt(...)`;
N-A1 `AndroidManifest.xml` 0 `<queries`; H-2 `useRaspArtifact.js:59` `HEARTBEAT_MS = 60_000`;
M-3 `vault.js:323` `AAD_V3_MIGRATION_ENABLED = false`; M-5 `WalletEntry.jsx:1089,1218`
`clearPinAttempts()`; N-C2 `fastpathUnlock.js:62-63` `isFastpathEnabled()` is
`value !== OFF` (default-on); N-C4 `kek.js:245,250` Web Crypto HKDF; L-6 iOS `enroll`
RASP-gated (`HardwareKekPlugin.m:113-119`). WC queue (`WalletConnectProvider.jsx:912-993`)
still filters `pendingRequests` by `id` only (supports N-B6).

### New this run — 2026-10-12 weekly (5)

| ID | Sev | Finding | File:Line | Evidence |
|---|---|---|---|---|
| 10-12 N-C2 | MEDIUM | Silent fast-path stores the RAW DEK under a 30 s device-wide `BIOMETRIC_STRONG` window with no `CryptoObject`, bypassing H, C and the KEK; **default-on** despite "opt-in OFF" comments. Owner decision whether accepted | `native.js:625-660,1322-1345`, `AndroidBiometricCachePlugin.kt:546-575`, `fastpathUnlock.js:62-63` | (grep) default-on; (doc) bypass analysis, device-unverified |
| 10-12 N-B6 | LOW | WC pending queue filtered by `id` only, not `topic+id`; a second dApp can evict another dApp's pending request (griefing, no spoof) | `WalletConnectProvider.jsx:~912-989` | (grep) id-only filter |
| 10-12 N-C3 | LOW | StrongBox fallback catches only `StrongBoxUnavailableException`; OEM `ProviderException` fails enroll instead of TEE fallback (fail-closed) | `HardwareKekPlugin.kt:256`, `AndroidBiometricCachePlugin.kt:572,625` | (doc) |
| 10-12 N-C4 | LOW | `combineKek` uses Web Crypto HKDF; CLAUDE.md says @noble/@scure only. I6 concat/domain correct, buffers zeroed | `kek.js:245-250` | (grep) |
| 10-12 N-C5 | LOW | `unwrapDek` still accepts `WRAP_V1` without AAD (needs the KEK to forge) | `kek.js:151-157` | (doc) |
| 10-12 N-D2 | LOW | `credentialVerifier` defaults to 96 MiB/t6, half the memory-hardness of 192 MiB/t3 legacy vaults; comment overclaims (session-local) | `credentialVerifier.js:3-4,105-110` | (doc) |

*(10-12's own `N-D1` — PIN counter in localStorage, session floor lost on restart, disclosed — is
tracked here as **10-12 N-D1 (INFO)**; it is a different item from the 10-05 `N-D1`
subscription-refresh/I3 row. IDs collide across weeks, so cite the date prefix.)*

### New this run — daily diffs 10-14 … 10-22

| ID | Sev | Finding | File:Line | Evidence |
|---|---|---|---|---|
| **DIFF-1022-NPMRC** | NEEDS-REVIEW (supply chain, low) | New repo-wide `.npmrc` `before=2026-10-21T00:00:00.000Z` (#2903). `npm ci` is unaffected, but any fresh install/`npm audit fix`/Dependabot bump cannot resolve versions published after that date, so a new security patch for a crypto package would silently fail to resolve. Labelled temporary; no expiry or tracking issue | `.npmrc` | (grep) file present with `before=`; (doc) diff-2026-10-22 |
| DIFF-1022-VIGIL-COMMENT | LOW (doc drift) | `TierLockedPage.jsx` comment says Vigil self-gates on deniability; `Vigil.jsx` deliberately renders identically in decoy (I3). Behaviour correct, comment stale | `TierLockedPage.jsx` | (doc) |

Daily diffs 10-14, 10-16, 10-18: no security-relevant commits. 10-15 (Settings i18n): SAFE, I3 branch
intact. 10-22 Vigil paywall animation: SAFE. Dependency audit 2026-10-12 (clean tree): 5 low, all
the accepted `elliptic` residual; none critical/high.

### Summary adjustment (this run)

Prior totals (~407 / ~309 fixed / ~101 open / 2 regressed / ~36 on-device) plus 8 new open items
(6 from the 10-12 weekly, 2 from daily diffs): total **~415**, fixed **~309** (+0), still open
**~109**, regressed **2** (unchanged: 09-28 H-3 KEK stamp, 09-28 H-5 WC queue — the latter not
re-located by the 10-12 audit, status carried), needs on-device **~37** (N-C2).

---

## Previous window (2026-10-05 → 2026-10-12, retained for reference)

Previous run analysed `87e868b6`. `main` has moved **21 commits** since (`4b98715a`). **Zero
commits touch `src/wallet-core`, `src/rasp`, `android/`, `ios/App/App`, `supabase/` or
`functions/`**; the code changes are UI restyles (Send/Receive/Settings/Home), review-prompt
gating, upsell-card dedupe and dependency bumps. **The 2026-10-05 weekly internal audit
landed** (#2854, `docs/audit-2026-10-05-weekly.md`) — it adds 12 new findings (below) and
re-confirms every 09-28 item STILL PRESENT. Daily diffs 10-06 … 10-12: 0 REGRESSION; one
NEEDS-REVIEW (low, `package.json`/lockfile, 10-08) carried.

**Re-verified this run (grep, at `4b98715a`):** M-7 `SceneDelegate.swift:67-73`
`QA-INSTRUMENT-TEMP` `NSLog` still present; H-3 `kekProfiles.js:101`
`usedFallback: !stamped && i > 0` unchanged; H-1 `typed-data.js` has no
`TransferWithAuthorization`/`SafeTx` entry; N-A1 `AndroidManifest.xml` has 0 `queries`
elements; N-B2 `RequestApprovalModal.jsx:89` unguarded `BigInt(reqParams[0].value)`;
H-2 `HEARTBEAT_MS = 60_000` unchanged. **No finding fixed, none regressed this window.**
M-7 (logs WalletConnect pairing secrets, one-line delete) is now sixth consecutive window unfiled.

### New this run — 2026-10-05 weekly (12; IDs scoped per surface, `N-` prefix)

| ID | Sev | Finding | File:Line | Evidence |
|---|---|---|---|---|
| N-A1 | MEDIUM | Android package-based RASP detections (Xposed/Magisk/mock-location/keyboard/a11y) likely inert on targetSdk 36: no `<queries>`/`QUERY_ALL_PACKAGES` | `AndroidManifest.xml`, `RaspIntegrityPlugin.kt:419,753,688,726,635` | (grep) 0 `queries`; effect (doc), device-unverified |
| N-B1 | MEDIUM | Off-chain asset-move typed data (CoW, Hyperliquid UsdSend/Withdraw, `to`+amount structs) scores OK; extends H-1 | `typed-data.js:34,75` | (doc) |
| N-B2 | MEDIUM | Garbage `value` crashes approval modal render, re-crashes WC page until session deleted (fails closed) | `RequestApprovalModal.jsx:89` | (grep) |
| N-A2 | LOW | TokenApprovals revoke has no `presignGate`/biometric tier friction | `TokenApprovals.jsx:152-170` | (doc) |
| N-A3 | LOW | WARN-tier biometric step-up is a UI boolean in one place | `SendCrypto.jsx:1272,1338` | (doc) |
| N-A4 | LOW | M-7 reach wider: logs rejected URLs too, incl. unredacted `wc:` pairing URI | `SceneDelegate.swift:67-73` | (grep) block present |
| N-B3 | LOW | Gas-estimation failure still broadcasts at 1M cap; fee ceiling skippable on bad fee data | `WalletConnectProvider.jsx:785-800` | (doc) |
| N-B4 | LOW | Flagged dApp domain banner-only at sign time, tier-gated | `RequestApprovalModal.jsx:233-256` | (doc) |
| N-B5 | LOW | `personal_sign` content never scored (32-byte hash as raw hex; Safe vector, inference) | `WalletConnectProvider.jsx:414-468` | (doc) |
| N-D1 | LOW | Subscription refresh doesn't re-check deniability after awaited RevenueCat call (I3) | `TierProvider.jsx:46-150` | (doc) |
| N-D2 | INFO | `deniabilitySession.js` imports `demoClient` (load-time side effect); fail-closed | `deniabilitySession.js` | (doc) |
| N-C1 | INFO | R8 optimisation (#2765) has no release-APK KEK/RASP device test (extends DIFF-1004-R8) | `proguard-rules.pro` | (doc) |

Also recorded **PASS (doc):** Android tamper-cert placeholder — blank release cert hard-fails
the build (`build.gradle:370-380,518-527`). Not reviewed by the audit: `OtaBundleVerifier.kt` /
`OtaUpdatePlugin.kt` (OTA is inside the RASP trust boundary; in next week's brief).

### Summary adjustment (this run)

Prior totals (below) plus 12 new open items: total **~407**, fixed **~309** (+0; tamper-cert
PASS was already counted as fixed), still open **~101**, regressed **2** (unchanged: 09-28 H-3,
WC queue), needs on-device **~36** (N-A1). The 10-05 summary block below is otherwise superseded
by this section.

---

## Previous window (2026-09-28 → 2026-10-05, retained for reference)

Previous run analysed `b3a8c58c` (2026-09-28). `main` has moved **75 commits** since. Almost
none are security-relevant: release/OTA/paywall/portfolio work, dependency bumps, and eight
daily diffs (`diff-2026-09-28.md`, `09-30` … `10-05`). **No weekly internal audit landed in
this window** (the next is due today; none is on `main` at this pin), so the 09-28 weekly's 25
new findings and carried set were re-checked here, not re-audited.

**The headline: nothing from the 09-28 weekly has been fixed.** Re-verified against source at
this pin: H-1 (EIP-3009/SafeTx typed-data gap), H-3 (KEK stamp-on-fallback regression), M-1
(`'sign'` in `blockedActions` read by no signing chokepoint), M-3 (v3 reseal stamp, still
latent behind `AAD_V3_MIGRATION_ENABLED = false`), M-5, M-7 and the carried WC-queue
regression are all still present, unchanged file:line. No issue has been filed for any of
them (`gh issue list --state open` is empty at this run). The one that matters most for
release posture: **M-7 (SceneDelegate `NSLog` of the WalletConnect pairing key,
`QA-INSTRUMENT-TEMP: remove before commit`) is still on `main`** (`SceneDelegate.swift:67-73`,
last touched by `d4af8d9d`/#2751, 2026-09-23), and `main` carries it through every 1.0.3
commit — so the iOS 1.0.3 build that went `READY_FOR_SALE` on 2026-10-03 was cut from a tree
that contains it (inference from the unchanged file; the shipped binary was not inspected).
This is now the fifth consecutive audit window in which an audit-found item stayed unfiled.

## Sources synthesised

Carried: the 06-26 through 09-28 corpus, `docs/audit-triage/` (29 files),
`docs/security-audits/` (11 files), `docs/honesty-check-2026-08-31.md`,
`docs/audit-gemini-sweep-2026-09-13.md`.

**New this run:** `docs/security-diffs/diff-2026-09-28.md`, `09-30`, `10-01`, `10-02`,
`10-03`, `10-04`, `10-05` (the 09-29 report does not exist; 09-30's window covers it). No
new files in `docs/audit-triage/`, `docs/security-audits/` or `docs/dependency-audits/` (the
last report there is `dep-audit-2026-09-01.md`; dependency residuals this window are recorded
in commit messages #2784, #2811, #2832 and a CLAUDE.md pointer, not in a report file).

## Summary

- Total findings catalogued: **~395** (approximate by construction — MEDIUM/LOW grouped)
- Fixed (code-confirmed): **~309** — 1 closed this run (the 10-03 App Store description
  honesty REGRESSION, fixed by `fc2a1c4d`/#2833 within one day, **grep** below)
- Still open / accepted-residual: **~89** — the 09-28 set unchanged, plus 4 new daily-diff
  items (below)
- **Regressed: 2** — both from the 09-28 run, both **re-verified still present (grep)**:
  the KEK-stamp unlock-timing regression (09-28 H-3) and the WC refused-request-stays-queued
  regression (09-28 H-5, fourth week unfiled)
- Needs on-device / on-chain / live-backend verification: **~35** (one new: R8 optimization,
  below)

---

## What changed this run (2026-10-05)

### Fixed this run

| ID | Sev | Finding | Fixed by | Confirmed by |
|---|---|---|---|---|
| **10-03 REGRESSION: App Store description** | I4 honesty | `92f50bbf` (#2826) re-introduced two claims the repo had recorded as false ("BUY CRYPTO IN-APP", "on-device security assistant") and dropped the Advisor server-call disclosure; 1.0.3 went live with it on 2026-10-03 | `fc2a1c4d` (#2833), pinned by new `src/__tests__/store-copy-honesty.test.js` | (doc) diff-2026-10-04 "SAFE — resolves yesterday's REGRESSION in the repo". **The repo is fixed; whether App Store Connect carries the corrected text is not checked by this tracker** |
| **#2713 bookkeeping gap** | — | The chaff-provisioning wipe race was fixed in code by #2725 (tracked last run) but its GitHub issue stayed open | issue now **CLOSED** | **grep**: `gh issue view 2713 --json state` = `CLOSED` |
| **IOC manifest fetch** | — | (not a prior finding) Wallet now fetches the IOC manifest through the `tip-manifest` Edge Function instead of from the client | #2837 | (doc) diff-2026-10-04 SAFE, with `src/wallet-core/deniabilitySession.js:93` listed as a control added |

### New this run — daily diffs 09-28 … 10-05

| ID | Sev | Finding | File:Line | Evidence |
|---|---|---|---|---|
| **DIFF-1004-BACKUP-DECOY** | NEEDS-REVIEW (I3) | #2792/#2835 made the Backup → Advanced recovery-share tab render on every tier. In a decoy/hidden session it now shows "Recovery shares are unavailable in this session." — a string no real session can show. Someone with the unlocked phone who knows the app can tell decoy from a real free wallet. Before the window the tab needed Safety Plus, and a decoy is always free | `src/pages/PersonalBackup.jsx:802-809,1223` | **grep**: `isDecoy \|\| isHidden` branch present at `:802` |
| **DIFF-0930-PANICWIPE-GATE** | NEEDS-REVIEW (owner decision) | `/panic-wipe` is still a route-level `SAFETY_PLUS_ROUTES` gate, so a lapsed subscriber loses the page itself, while Emergency PIN removal and backup restore were made free. Pre-existing, not introduced this window; the subscription-entitlement doc names it as an open owner decision. A coercion-resistance control behind a paywall is in tension with the spirit of I3/I4 | `src/lib/safetyPlusRoutes.js` | (doc) diff-2026-09-30 |
| **DIFF-1001-CHANGELOG** | NEEDS-REVIEW (honesty) | `CHANGELOG.md:94` still says the 2026-09-21 audit remediation "addressed all findings (#2731)". The 09-28 weekly found four HIGH items in that very remediation's wake, one a direct regression from #2731 (H-3) | `CHANGELOG.md:94` | **grep**: line present, unchanged |
| **DIFF-1004-R8** | NEEDS-REVIEW (low) | Release builds switched to `proguard-android-optimize.txt`; the bridge keep rule was corrected to the real `com.getcapacitor.PluginMethod` package. R8 optimization is a classic way to strip a Capacitor plugin method — including the RASP and KEK plugins — and nothing in the repo shows a release AAB exercised on a device | `android/app/build.gradle:176`, `proguard-rules.pro:21-25` | (doc) diff-2026-10-04; 1.0.3 Play rollout is recorded as published, but this tracker has no device evidence for these plugins under R8 |
| **DIFF-1004-BRACES** | NEEDS-REVIEW (supply chain, low) | `braces` replaced by a vendored fork (`vendor/braces`, `3.0.4-veyrnox.1`) with a nesting cap. Build/test-only, not in the wallet bundle, but "identical to upstream apart from the guard" is the PR's claim; the scan did not diff against the 3.0.3 tarball | `vendor/braces/**`, `package.json` overrides | (doc) diff-2026-10-04 O-1 |

The daily diffs also recorded SAFE for: the paywall/free-trial and subscription-lifecycle
changes, `OtaVersionRow`/`otaStatus` (OTA version made visible), `verify-live.mjs`, the
Android OTA prepare fix, `sentry.js` (I2-preserving), and the portfolio price-basis fixes.

### Re-verified this run — carried 09-28 findings (all grep, all STILL OPEN)

| ID | Check at `87e868b6` |
|---|---|
| **09-28 H-1** | `typed-data.js` has no `TransferWithAuthorization`/`ReceiveWithAuthorization` entry; `SafeTx` appears only in unrelated comments (count 2). Still open |
| **09-28 H-3** | `kekProfiles.js` still returns `usedFallback: !stamped && i > 0` — no stamp on a current-profile vault. Still regressed |
| **09-28 M-1** | `degrade.js:136` still appends `'sign'` only at call time; `grep -c blockedActions` over `sign-gate/compose.js` and `sign-gate/presign.js` = **0 and 0**. Inert on the sign path. Still open |
| **09-28 M-3** | `vault.js:323` `AAD_V3_MIGRATION_ENABLED = false`. Latent; must land before Phase 0b |
| **09-28 M-5** | `WalletEntry.jsx` calls `clearPinAttempts()` at `:1089` and `:1218`, unchanged |
| **09-28 M-7** | `SceneDelegate.swift:67-73` `QA-INSTRUMENT-TEMP` `NSLog` block present |
| **09-28 H-5 (WC queue)** | `WalletConnectProvider.jsx:1078,1103,1122` still filter `pendingRequests` after the handler, outside any `finally` |

---

## Carried from the 2026-09-28 run (reference; items above supersede where they overlap)

### What changed in the 2026-09-28 run

### Fixed this run

| ID | Sev | Finding | Fixed by | Confirmed by |
|---|---|---|---|---|
| **09-14 M-2** | MEDIUM | Import-time migration silently re-enabled Biometric Unlock every cold start | `56126fb7` (#2704, SEC-05) | (doc) 09-28 weekly "Status vs prior audit" |
| **09-14 M-3** | MEDIUM | TP and its spend limits switchable off with no step-up | `80acddf9` (#2696) | (doc) 09-28 weekly. Residual: the step-up itself is H-7's passcode-accepting gate |
| **Dormancy-reminder panic residue** | NEEDS-REVIEW (I3) | 7-day OS notification (id 9005) armed on unlock, never cancelled by panic wipe — survives and fires after a wipe, proving prior use | `ffda3dfd` (#2695) | (doc) diff-2026-09-22: cancellation verified for ids 9001–9005, best-effort where the plugin is unavailable |
| **#2739** | NEEDS-REVIEW | `classifyApprove()` scored multicall- and permit-wrapped `approve()` as "not an approval" (false-green S2/S3) | `2ef5f681` (#2740) | **grep**: `OPAQUE_APPROVAL_KINDS` present in `src/risk/calldata.js`; new tests assert `level !== LEVEL.OK` |
| **#2741** | NEEDS-REVIEW | S7 calldata/contract-code mismatch signal fetched but never added to the WC scoring array | `a0ab4645` (#2743) | (doc) diff-2026-09-23: direct test of `buildWcTransactionIntelligence` returns `S7: CAUTION` |
| **SEC-03** | MEDIUM | Revoking the current device left its minted token usable until next action | `63fe0dac` (#2708) | (doc) diff-2026-09-22 |
| **Panic residue: biometric pref + nav-route keys** | LOW (I3) | Wipe re-created the biometric preference; nav-route session keys swept | `3ba2406c` (#2712) | (doc) diff-2026-09-22 |
| **Panic residue: chaff-provisioning wipe race (#2713)** | NEEDS-REVIEW (I3) | Un-awaited `provisionDeniabilityChaff()` could finish writing after a wipe completed, recreating storage | `725c6c77` (#2725) — `wipeEpoch.js` guard checked before every write | **grep**: `runChaffJob`/`guard()` in `stealth.js:150,388,391,400,407` and `provisionChaff.js:71,75,79`. **GitHub issue #2713 is still OPEN** — the code fix landed, the tracking issue was never closed. Flagging the bookkeeping gap |
| **WalletSeedQR print residue** | LOW (I1) | Printed recovery phrase stayed in the DOM after print/Clear/unmount | `e8a8abbf` (#2699) | (doc) diff-2026-09-22 |
| **GEM-0913-NEWS** (carried since 09-13) | LOW (I3) | `NewsSentimentPage.jsx` saved-list read ungated in decoy sessions | `c7759e60` (#2711) | (doc) diff-2026-09-22. Closes a finding carried for 3 tracker cycles |
| **DIFF-0911-N-4** (Regressed since 09-11, unfiled 2 weeks) | — | `bs58check`'s bundled `readable-stream` throws on `process.version.slice(0,5)` when `process.version` is absent | `b2e98528` (#2700) — moved the shim to `src/lib/globalPolyfills.js`, first import in `main.jsx`, and **merges** into any pre-existing partial `process` rather than skipping | **grep**: `globalPolyfills.js:49` `version: base.version ?? ''` — a string, never `undefined`. Landed 2026-09-21, after last week's pin (`cc1cc4eb`) so this is the first run to see it |

### New this run — 2026-09-28 weekly audit (first since 09-14)

Full detail in `docs/audit-2026-09-28-weekly.md`. Four new HIGHs, one of them a regression
from `2e17c655` (#2731, last week's own audit-remediation commit):

| ID | Sev | Finding | File:Line | Status tag |
|---|---|---|---|---|
| **H-1** | HIGH | EIP-3009 `TransferWithAuthorization` (USDC), marketplace orders (0x/Blur/LooksRare) and Safe `SafeTx` have no named list and no matching structural-backstop field name, so they score `LEVEL.OK` and WalletConnect signs them — a live drain vector on mainnet | `src/wallet-core/evm/typed-data.js:12-16,34,62-74,135-168` | **[VERIFIED]** |
| **H-2** | HIGH (I2/I3) | Remote attestation fires on every primary-dashboard mount, foreground and 60s heartbeat — contradicts "NEVER ON UNLOCK"; a network observer can tell primary from decoy by the periodic traffic alone, for every user, not only Theft Protection opt-ins | `SecurityPosture.jsx:105`, `useRaspArtifact.js:118-138,170-195` | **[VERIFIED]** (wiring); egress volume [AGENT] |
| **H-3** | HIGH — **REGRESSION from #2731** | The KEK profile-fallback walk stamps only on *fallback* success; a vault enrolled at the current profile between 2026-08-24 and #2731 is never stamped, so every unlock on it pays (real PIN) or dodges (wrong/duress PIN) an extra two Argon2id runs — reopens the H-1(09-14) unlock-timing oracle | `src/wallet-core/keystore/kekProfiles.js:86-116`, `native.js:789-795`, `web.js:538-540` | **[VERIFIED]** (logic); timing magnitude [AGENT], not benchmarked |
| **H-4** | HIGH (I3) | `attestationProbeSource` returns UNAVAILABLE first in deniability (correct for I3), but that feeds `detectAttestation` → WARN, while a primary session with a passing device gets ALLOW — the RASP tier itself differs by set, and the difference is visible in SendCrypto, SecurityDashboard and RaspSecurity copy | `attestation.js:244-246`, `SendCrypto.jsx:1297,1490-1541`, `SecurityPosture.js:232` | **[VERIFIED]** (code path); prevalence [AGENT] |
| **M-1** | MEDIUM (I4) | The #2731 "M9" fix appends `'sign'` to `blockedActions` on native `INTEGRITY_UNAVAILABLE`, but no signing chokepoint reads that field — `compose.js`/`presign.js` read only the tier. Send, WC and CryptoSigning proceed unaffected; only the TokenApprovals *revoke* path reads `'sign'`, so the protection is inverted | `degrade.js:226`, `compose.js:64-75`, `presign.js:44-53` | **[VERIFIED]** |
| **M-2** | MEDIUM | Approval-granting calldata outside the decoded/opaque sets (Compound v3 `allow`, Aave `approveDelegation`, ERC-777 `authorizeOperator`, `approveAndCall`, legacy `increaseApproval`) scores "not an approval" and signs with no Approval row — a gap in #2731/#2740 the multicall/permit fix didn't cover | `src/risk/calldata.js:96-105` | **[AGENT]** |
| **M-3** | MEDIUM — latent (`AAD_V3_MIGRATION_ENABLED = false`, confirmed `vault.js:323`) | v3 reseal branches spread `{...blob, ...sealed}`, so the **old** `kekKdf` stamp survives a PIN change while the new C is derived at profile[0] — bricks the vault (`KEK_UNWRAP_FAILED`) once the flag flips. **Must land before Phase 0b** | `vault.js:676-713`, `native.js:1160-1167,1678-1684,1780-1787`, `web.js:784-792,932-936` | **[AGENT]** |
| **M-4** | MEDIUM | A miss is only counted after `unlock()` throws; on an H-3-cohort vault a success takes ~2 Argon2id runs longer than the eventual miss would, so a force-quit before `localStorage.setItem` on the correct guess dodges both the wipe counter and the backoff | `WalletEntry.jsx:1200-1206` | **[AGENT]** — direct consequence of H-3 |
| **M-5** | MEDIUM — owner decision needed | `clearPinAttempts()` runs after any non-throwing unlock including decoy/duress, by design (`pinAttemptGuard.js:19-22`) — so a coercer holding the surrendered PIN gets unlimited guesses at the real PIN between decoy unlocks, since the 10-miss wipe counter keeps resetting | `WalletEntry.jsx:1086-1089` | **[VERIFIED]** |
| **M-6** | MEDIUM (I3, read-side tell) | Settings renders a one-line placeholder for the whole security block in a decoy session instead of the real controls — closes a write-side leak but is itself spottable by anyone who knows the app's real Settings | `Settings.jsx:425-431` | **[VERIFIED]** |
| **M-7** | MEDIUM (secrets in logs) — **independently found by diff-2026-09-24, still unfiled** | A `QA-INSTRUMENT-TEMP: remove before commit` block ships in 1.0.2 and NSLogs every incoming URL, including the WalletConnect pairing `symKey`, before the allowlist decision | `ios/App/App/SceneDelegate.swift:67-73` (`d4af8d9d`, #2751) | **[VERIFIED]** |
| **L-1 … L-14** | LOW | PersonalBackup mounts full attestation on restore panels; cold-launch deep links bypass the allowlist (independently found 09-24); storyboard instantiates the bridge VC before the RASP block decision; Argon2id OOM (unlock-side) counted as wrong PIN; tampered `kekKdf` stamp throws uncoded; literal-`to` check runs post-modal with no reject; WC risk inputs never receive the address corpus (S4 always OK, S3 always an unactionable RISK ack on WC); per-request expiry never enforced; spend cap misses router-swap value; plaintext PIN retained in an unused ref all session; background triggers exhaust `copySecret`'s wipe-retry budget; Buy's 15-min lock-suppression cap is a JS timer with no wall-clock deadline check (owner-only, report only); fast-path read has no passkey check; stale comments describing open holes as closed | see `docs/audit-2026-09-28-weekly.md` §LOW | Mostly **[AGENT]**; L-1, L-10, L-3 (via cited lines) **[VERIFIED]** |

**Carried HIGHs (09-14 → renamed in 09-28), all STILL PRESENT, some widened:**

| 09-14 | 09-28 | Status |
|---|---|---|
| H-1 TP runs attestation on unlock, primary only | **H-9** | STILL PRESENT; **generalised to every user** by H-2 above |
| H-2 TP skipped on fast-path biometric unlock | **H-6** | STILL PRESENT |
| H-3 Refused WC request stays queued | **H-5** | STILL PRESENT, reachability widened (see Regressed) |
| H-4 TP "biometric" accepts the passcode | **H-7** | STILL PRESENT, **now also governs the #2696 step-ups** — a passcode authorises turning TP off |
| H-5 TP turns WARN into an unlock refusal | **H-8** | STILL PRESENT, **WIDENED**: #2696 closed the in-app off-switch behind the same gate |

**Carried MEDIUMs still present:** M-1 (Android biometric-cache storage alias not auth-bound),
M-4 (TP prompts only on primary unlock — worse now, the seeded $500 cap makes a decoy send
over $500 with an empty limits list and no prompt), M-5 (over-limit WC send cleared by a
generic biometric), M-6 (daily cap ignores WC sends), M-7 (stalled bridge bypasses both
session latches — #2731's M9 does not close it, and this week's M-1 shows M9 is itself inert
on the sign path), M-8 (fast-path attestation on unlock). All **[AGENT]**, unchanged file:line
from 09-14, cited in full in `docs/audit-2026-09-28-weekly.md`.

**Carried LOWs (09-14, all STILL PRESENT):** L-1 (TP refusal leaves decrypted container
resident), L-2 (TP token not consumed on Digital Shield), L-3 (step-up OOM counted as wrong
PIN), L-4 (unparseable fee skips WC fee ceiling), L-5 (**escalated into 09-28 H-1** — SafeTx/
`address[]` backstop gap), L-6 (no RASP gate on KEK enroll/clearCredential), L-7 (plaintext
H/DEK write-side residue), L-8 (web fresh RASP artifact can never be ALLOW), L-9 (stale
comments, extended into 09-28 L-14), INFO (`handleSendTransaction` deps omit
`isDecoy`/`isHidden`, mitigated).

---

## ⚠️ Checklist drift — standing Step-2 checks

All re-verified at `87e868b6` this run (grep). File paths corrected where earlier runs
used wrong ones: `degrade.js` is `src/rasp/`, `compose.js`/`presign.js` are `src/sign-gate/`,
`WalletConnectProvider.jsx`/`copySecret.js`/`twoFactorGate.js` are `src/lib/`, `vault.js` is
`src/wallet-core/vault.js`, `WalletEntry.jsx` is `src/components/`. `ColdSign.jsx` and
`PRIMARY_UNLOCK_EQUALIZER_MS` were **not found** by name this run (H11/H3 checks not
re-verified; carried from the prior run as (doc)). No drift otherwise:

| Check | Result |
|---|---|
| `C3/H7: WalletConnectProvider.jsx` presign gate + chain binding | `presignGateOrReject` ×7, `proceedAllowed` ×9, `domain.chainId` bound at `:516-537` and pre-modal `:940-959` (grep) |
| `C4: RequestApprovalModal.jsx` reads session peer metadata | `src/components/walletconnect/RequestApprovalModal.jsx:242-243` — comment and code confirm read from `session.peer.metadata`, never `params.proposer` (grep) |
| `H4: twoFactorGate.js` opaque WRONG | Single opaque `WRONG: 'WRONG'` at `:32`, message at `:77` (grep) |
| `H6: BLOCKED_METHODS` | `src/wallet-core/evm/walletconnect/router.js:48-54` — `eth_sign`, `eth_signTransaction`, both typed-data v1/v3 variants, add/switch chain (grep) |
| `C6/H13: CryptoSigning.jsx` no key state | `withPrivateKey` scoping at `:90`, `copyPlain` import/use at `:8,24`, no `useState` holding key material (grep) |
| `H-NEW-3: copySecret.js` wipe sentinel | Non-empty `WIPE_REPLACEMENT = '•'.repeat(24)` at `:65`, `visibilitychange` listener at `:170` (grep) |
| `M20/H-NEW-4: kek.js combineKek` zeroes ikm | `zero(ikm)` at `:248` and `:280` (grep) |
| `H-NEW-1: EXPECTED_CERT_SHA256` | `RaspIntegrityPlugin.kt:765` reads `BuildConfig.RELEASE_CERT_SHA256`; blank ⇒ fail-closed at `:769-770` (grep) |
| `H10: pinning.js placeholders` | Still **16** (re-counted this run) `PLACEHOLDER_*_REPLACE_ON_DEVICE` entries — **open**, unchanged count (grep) |
| `RASP-A2: SendCrypto.jsx` fallback | `:1299` and `:1492` both `?? TIER.BLOCK`; no `?? TIER.ALLOW` anywhere (grep) |
| `H15/H16: HardwareKekPlugin.kt` | `setIsStrongBoxBacked(true)` best-effort at `:246`; `AUTH_DEVICE_CREDENTIAL` only in removal comments (grep) |

---

## Still Open ⚠️

### 2026-09-28 weekly — 4 new HIGH, 7 new MEDIUM, 14 new LOW, plus 5 carried HIGH and 6 carried MEDIUM STILL PRESENT

See the full tables above (New this run) and `docs/audit-2026-09-28-weekly.md`. Not one of
these 25 new findings, nor any of the still-present carried ones, has a filed issue as of
this pin.

### Daily diffs and in-window issues

| ID | Severity | Finding | File:Line | First reported |
|---|---|---|---|---|
| **#2676** | MEDIUM | tip-chat entitlement gate's 3s budget covers two RevenueCat round trips on a cold isolate; neither failure path logs | `supabase/functions/tip-chat/index.ts` (doc) | 2026-09-20 |
| **#2639** | MEDIUM | A later invite link overwrites an unredeemed pending referral with no confirmation | referral capture path (doc) | 2026-09-19 |
| **DIFF-0912-N-1** | NEEDS-REVIEW | `partner-referral-codes.sql` drops only the `(text,text,text)` overload of `mint_partner_referral_code`; a surviving `(text,text)` overload defeats the platinum partner-tier default. Not touched this window — `sql/` had no changes since `cc1cc4eb` (grep: `git diff --stat` empty for `sql/`) | `sql/partner-referral-codes.sql:98` (grep, unchanged) | 2026-09-12 |
| **DIFF-0914-SOLANA-PIN** | NEEDS-REVIEW (A03) | `@solana/web3.js` caret-ranged, absent from the exact-pin/Dependabot-ignore split | `package.json` (doc, not re-checked this window) | 2026-09-14 |
| **09-16 surface #5** | LOW | `get_referral_count`/`get_referral_tier` still anon-executable; REVOKE SQL shipped but unapplied | `sql/api-security-hardening.sql:633` (doc) | 2026-09-16 |
| **DIFF-0915-OTA-PREUNLOCK** | NEEDS-REVIEW (I3) | OTA update check fires before unlock, before session type is known. Both hardware keys are now pinned and OTA is armed for 1.0.2 (confirmed this window: `64c61512`, `30094931`, `6e8fe8cd` per the weekly audit's "changes since last audit" table) | `src/lib/otaUpdate.js` | 2026-09-15 |
| **iOS cold-launch deep-link bypass** | LOW — **independently found twice** (diff-2026-09-24, then 09-28 weekly L-2) | `connectionOptions` forwarded unfiltered to `Capacitor.SceneDelegateProxy`, which replays URLs through its own unfiltered methods — the native allowlist chokepoint that existed pre-UIScene-migration is gone on cold launch | `SceneDelegate.swift:42-56` (grep) | 2026-09-24 |

### Carried

Unchanged from `cc1cc4eb` — not re-derived this run except where noted above (H-2(08-25),
M-5(08-25), DIFF-0823-TIER, DIFF-0823-CI, DIFF-0823-BACKUP, DIFF-0830-QRSCAN,
DIFF-0826-SESSTOKEN, DIFF-0902-* (four items), DIFF-0825-FASTPATH-DOC (folded into 09-14
L-9, now 09-28 L-14), DIFF-0829-TIPSECRET, DIFF-0905-GEMFILE-UNPINNED,
DIFF-0905-IOS-REPLAYKIT, DIFF-0816-REJECT, DIFF-0816-MAINSYNC, DIFF-0730-MT, DIFF-0809-GOV,
DIFF-0822-CODERABBIT, #2275 (1 `test.fixme`, re-confirmed grep), G2-ROOTCERT-PIN/#2276
(re-confirmed: still a Play Integrity WARN posture, and 09-28 H-8 confirms TP still converts
it into a lockout), C-6/C1, C2, H10 (re-confirmed above), H1/H2/BIO-01/H-NEW-5, BIO-02, H5,
H-3(07-01), RASP-A1, D-04, C-7/#1111, P2-2/M-K/M-1(07-08)/PW-01, weekly M-4/M-6/L-1..L-8
(07-14), iOS re-sign tamper (07-14, re-confirmed in 09-28 weekly's "Status vs prior audit"
table), L-2(08-03), L-3..L-8(08-25 carried).

**Accepted-residual / by-design:** unchanged list from `cc1cc4eb` — see
`git show cc1cc4eb:docs/audit-findings-tracker.md` for the full by-item rationale. No new
accepted-residual designation was made this run.

**Refuted on verification:** unchanged from `cc1cc4eb`.

---

## Needs On-Device / On-Chain / Live-Backend Verification 📱

All items from `cc1cc4eb` carry forward unchanged (see prior tracker for the full list of
~31 items: Theft Protection end-to-end, OTA first armed build, 09-16 surface #5 REVOKEs,
tip-chat staging gate, WC refusal-retry broadcast, #2537 decoy-session exercise, the
`process.version` reproduction question — **now moot, the underlying bug is fixed** — and
the rest). Three items from the 09-28 weekly audit, plus one new this run (R8):

| ID | Finding | Why verification is needed |
|---|---|---|
| **09-28 H-3 timing magnitude** | **New.** The extra unlock cost for an unstamped current-profile vault is "likely seconds on a mid-range phone" per the audit — not benchmarked. Needs an actual timed unlock on a real device with a vault enrolled in the affected window (2026-08-24 → 2026-09-21) |
| **09-28 H-4 prevalence** | **New.** The primary/decoy RASP-tier distinguisher exists only where a primary device actually reaches ALLOW. On devices where #2276's pin posture already yields WARN for everyone, both sets look alike — device population data would settle how exposed this really is |
| **R8 optimization (#2765)** | **New.** Release builds now run R8 with optimization on. Needs a release-AAB exercise on a real Android device confirming the RASP-integrity and Hardware-KEK plugin methods are still reachable (unlock, send, attestation) |
| **09-28 H-2 egress volume** | **New.** [AGENT]: the 60s-heartbeat attestation call is mainly an Android cost (`requestIntegrityToken`); iOS after the first `attestKey` is local. A network capture on both platforms would confirm the asymmetry and the actual call volume |

Note: `DIFF-0911-N-4` / `process.version` is removed from this list — the fix is now
code-confirmed and no longer needs device reproduction to be believed; it needed
reproduction before only because the tracker distrusted an unfiled, then-still-present
regression claim.

---

## Regressed 🔴

| ID | Finding | What broke |
|---|---|---|
| **09-28 H-3** (from `2e17c655` / #2731, 2026-09-21) | **NEW this run.** `unwrapDekWithProfiles` stamps a successfully-unwrapped vault only when a *fallback* profile was used (`usedFallback: !stamped && i > 0`, `kekProfiles.js:101`). A vault enrolled at the **current** profile between 2026-08-24 (`0a6565e8`) and #2731 is therefore never stamped — every correct-PIN unlock on it costs exactly one profile's Argon2id run, while a wrong/duress PIN on the same vault walks all three unstamped profiles before falling through to the equalizer. #2731 fixed a genuine vault-bricking bug in the same walk and, in doing so, reopened the exact real/decoy timing-oracle shape the 09-14 audit filed as H-1 (now 09-28 H-9) — for a cohort of vaults the fix itself defines. Unfiled as of this pin |
| **09-14 H-3** (from 09-07 H-1 fix, #2422; now **09-28 H-5**) | A refused WC request stays queued with Approve enabled; a retry can sign and broadcast after the dApp was told "rejected". Re-confirmed present at `b3a8c58c`: `WalletConnectProvider.jsx` still filters `pendingRequests` in a plain `.then`-style statement after the awaited handler (`:1103`, `:1121-1122`; `handlePersonalSign`/`handleSignTypedData` both shown above), never in a `finally`. The 09-28 audit adds that the modal enables Approve for verdicts the signer always refuses (L-7) and that a TIP verdict can itself differ between calls. **Unfiled, third week running** |

**`DIFF-0911-N-4` (`process.version`) is removed from this table this run — see Fixed
this run.** The pattern noted for two runs running still holds for the newly-added
regression: a remediation commit rewrote a block and dropped a property the previous
version guaranteed (here: "every legacy-profile unlock gets stamped"), and nothing pinned
that property across all unlock shapes. The historical list (four release-cert-guard
regressions, the iOS `reject:` arg swap, telemetry consent, C-1 salt binding, C-01 pre-sign
gate, ECC F-P3-3, Digital Shield send-gate bypass, `screenAssetContract` I3 egress, the
bug-report SQL policy, and now the WC-queue and KEK-stamp regressions) is in
`git show acbb5ebe:docs/audit-findings-tracker.md`.

---

## Patterns worth naming, from this window

**1. A remediation commit reopened the exact class of bug it was fixing elsewhere.** #2731
closed a vault-bricking defect and, in the same function, created a timing-oracle regression
of the same shape as the finding it was responding to. Neither the commit's own tests nor
the two daily scans that reviewed it (`diff-2026-09-22`: "NEEDS-REVIEW... fail-closed in the
reviewed paths"; the review did not model the stamp-only-on-fallback condition) caught it.
It took a full second specialist audit, one week later, to find it.

**2. A `blockedActions` fix that changes nothing on the path it names is now a repeating
shape.** 09-28 M-1 is structurally identical to prior "fix landed, chokepoint doesn't read
the field" findings — the field is real, the write is real, and the reader that would give
it teeth does not exist. This is a cheap, high-value class of bug to pin: a native-mocked
test asserting the actual gate output changes when the field is set would have caught it in
CI, not in the next weekly audit.

**3. A finding can be independently discovered twice and still not get filed.** The
SceneDelegate `NSLog` of the WalletConnect pairing key was flagged as a REGRESSION by the
daily scan on 09-24 ("Before iOS 1.0.2 is archived: grep for QA-INSTRUMENT... Nothing
currently pins against this marker") and, four days later, independently re-found by the
weekly audit as M-7. Both times it was correctly triaged as fixable with a six-line delete.
Neither time did anything file it. The code is still on `main` at this pin.

**4. The filed/unfiled split from last week is now categorical.** Every finding that
entered this tracker as a GitHub issue this window was fixed within roughly a day
(#2739/#2741, both same-day). Every finding that entered only as an audit-doc or daily-scan
entry — all 25 new items in the 09-28 weekly, the SceneDelegate NSLog (twice), the cold-launch
deep-link bypass (twice), DIFF-0912-N-1, DIFF-0914-SOLANA-PIN — moved zero, with the single
exception of a fix landing for a finding described only in a commit message
(`GEM-0913-NEWS`, fixed via #2711 despite never being filed either). The loop from
"report" to "issue" remains the gap; nothing in this run's tooling closes it.

**5. A code fix can land without ever closing its own tracking issue.** #2713 was filed,
diagnosed precisely, and fixed in the very next day's commits (#2725) — and the GitHub issue
is still open. This is the opposite failure mode from #4: the fast path worked, but the
paperwork didn't follow the code. Worth a one-line habit: closing the issue is part of
landing the fix, not a separate step.

---

*Automated weekly tracker. Static analysis only — does not substitute for on-device,
on-chain, or live-backend verification. "FIXED" = the code change is present on
`origin/main`; it is not a claim the control is verified working. SQL migrations are
counted as unexecuted text until their own verification queries have been run against the
**live project confirmed from the shipped client bundle**, not from a project name. The
independent third-party audit remains outstanding and is not substituted by any internal,
ECC-skill, second-model (Codex), long-context (Gemini), or third-party-reviewer (CodeRabbit)
pass.*
