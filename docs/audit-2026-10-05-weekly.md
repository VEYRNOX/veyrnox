# Internal Security Audit — 2026-10-05
## Scope: RASP · WalletConnect · Hardware KEK · Auth Gates (Weekly)

> **Internal static-analysis pass.** Conducted by internal Claude specialist agents.
> Static code review only — no dynamic testing, no on-device verification.
> An independent third-party audit remains RECOMMENDED (see CLAUDE.md §Hard rules).

Conducted: 2026-10-05
Method: Static code analysis via parallel specialist agents (4 agents × 4 surfaces)
Branch audited: `security-audit/2026-10-05`, pinned to `origin/main` @ **`87e868b6`**
Status: **Findings only — nothing fixed. Do not mark anything verified without on-chain txid or on-device evidence.**

---

## How to read this report

- **[VERIFIED]** — the audit author independently re-read the decisive lines at the pin.
- **[AGENT]** — reported on agent evidence with citations, not independently re-read.

`file:line` references are against `87e868b6`. Re-read before acting. Finding IDs
for carried items keep the numbering of `docs/audit-2026-09-28-weekly.md`. IDs
prefixed `N-` are new this run and are scoped per surface (A/B/D below).

### Deviations from the runbook

- All four runbook `subagent_type` names resolved. No substitution.
- **This was a low-delta week.** `git log e92d72db..HEAD` is 76 commits, but none
  touch the WalletConnect, KEK, `src/rasp`, `src/sign-gate` or auth-gate files in
  scope, apart from #2765 (R8 optimisation, `proguard-rules.pro`) and one RASP
  test file. Every carried finding was re-read at the pin and is STILL PRESENT.
  No finding is FIXED and none REGRESSED.
- Agents also swept new non-surface code: subscription lifecycle
  (`TierProvider`, `subscriptionState.js`), OTA status row, intro-trial gates and
  the IOC manifest refresh.
- Not reviewed: `OtaBundleVerifier.kt` / `OtaUpdatePlugin.kt` (changed in
  `3481ac51`). The OTA path replaces the JS bundle containing `src/rasp`, so it is
  part of the RASP trust boundary and should be in next week's brief.
- No `node_modules` in the worktree, so the merged Android manifest could not be read.

---

## Changes since last audit (2026-09-28 @ `e92d72db` → 2026-10-05 @ `87e868b6`)

Security-relevant commits touching or adjacent to the audited surfaces:

| Commit | Surface | Summary |
|---|---|---|
| `99afccf7` (#2765) | RASP, KEK (Android) | R8 optimisation on (`proguard-android-optimize.txt`); keep rule corrected to `@com.getcapacitor.PluginMethod`; one RASP test touched. Static read found no regression. |
| `3481ac51`, `e59120a3`, `a51d1707` | OTA | OTA prepare/verify-live changes. `OtaBundleVerifier.kt` not reviewed. |
| `efd1063f` (#2818) | Auth/UI | Settings "Web bundle" row (`OtaVersionRow.jsx`); hidden in decoy and non-native. |
| `1f50ac0f`, `98d3ff3b` (#2782, #2781) | Auth/UI | Subscription lifecycle status in Settings. Display only; no gate reads it. |
| `62d415a3`, `37bf314e` (#2837, #2834) | I2/I3 | IOC manifest fetched through signing Edge Function; I3 chokepoint present. |
| `689e2e42`, `6dabb5aa`, `d9391894` | UI | Portfolio price-basis fixes. Not security-relevant to the four surfaces. |

---

## HIGH

No new HIGH. Carried HIGHs, all **STILL PRESENT** (unchanged code):

- **H-1 [WC]** EIP-3009 `TransferWithAuthorization`, `ReceiveWithAuthorization`, `SafeTx`
  and marketplace orders score `LEVEL.OK` and are signed. Named lists
  `typed-data.js:12-16`, `:75`; backstop matches only `spender`/`operator`/`delegate`
  address fields (`:34`, `:62-74`); falls through to `LEVEL.OK`
  (`wcTypedLevel.js:119-127`); the modal does not block (`RequestApprovalModal.jsx:233-239`);
  the handler signs (`WalletConnectProvider.jsx:470-549`). The comment at
  `typed-data.js:18-22` still claims coverage it does not give. **[AGENT]**, re-read by
  the surface agent this run.
- **H-2 [RASP · I2/I3]** Attestation fires on every primary dashboard mount, foreground and
  60 s heartbeat: `SecurityPosture.jsx:105`, `SecurityDashboard.jsx:107`,
  `RaspSecurity.jsx:92` call `useRaspArtifact()` with no opt-outs
  (`useRaspArtifact.js:170-195`, `HEARTBEAT_MS` `:59`, `attestation.js:78`).
- **H-3 [KEK · Auth · I3]** The profile walk leaves the unlock-timing equalizer broken for
  unstamped current-profile vaults. `kekProfiles.js:86-116`, `usedFallback` at `:101`;
  stamp written only on fallback (`native.js:789-795`, `web.js:538-540`). Magnitude not
  benchmarked.
- **H-4 [RASP · I3]** Decoy is WARN where a clean primary is ALLOW:
  `attestation.js:244-246`, `:184-187`.
- Carried HIGHs from 09-14 (H-5 refused WC request stays queued and re-approvable,
  `WalletConnectProvider.jsx:1102-1103`, `:1122`, `:1218`; Theft Protection H-8/H-9):
  STILL PRESENT. TP items were not re-derived (files untouched).

---

## MEDIUM

### New this run

- **N-A1 — [RASP · Android] Package-based detections are probably inert on targetSdk 36 — [AGENT]; manifest facts [VERIFIED]**
  `AndroidManifest.xml` has no `<queries>` element and no `QUERY_ALL_PACKAGES`;
  `android/variables.gradle:4` sets `targetSdkVersion = 36`. `checkXposed` (`RaspIntegrityPlugin.kt:419`),
  `checkSuspiciousPackages` (`:753`, Magisk/LSPosed/KernelFlasher/SuperSU),
  `checkMockLocation` (`:688`), `checkThirdPartyKeyboard` (`:726`) and
  `checkAccessibilityService` (`:635`) query third-party packages. Under Android 11+
  package visibility a non-visible package throws `NameNotFoundException`, which these
  helpers swallow into "not detected". The comment at `:741` presents these as the
  un-spoofable answer to Magisk Hide. About a dozen `/data/adb/*` path probes
  (`checkMagiskPaths` `:214`, `checkRootBinaries`) are also unreachable by an
  `untrusted_app`. What remains operative on Android is `checkDangerousProps` (`:293`),
  spoofable with resetprop-style modules, plus remote attestation.
  *Not confirmed:* a library manifest may merge in `<queries>`; no device test run.
  *Fix:* read the merged manifest in a build; add `<queries>` for the named packages or
  state the loss honestly; correct the `:741` comment. Treat Android root detection
  against a prepared Magisk stack as best-effort.
- **N-B1 — [WC] Other off-chain "move my assets" typed data also scores OK (extends H-1) — [AGENT]**
  CoW Protocol `GPv2 Order`, Hyperliquid-style `UsdSend`/`Withdraw {destination, amount}`,
  and any struct with `to`/`recipient`/`receiver` plus an amount fall through
  `typed-data.js:75`/`:34` to `LEVEL.OK`. Chain binding does not help. UniswapX witness
  types are covered. Fold into H-1's fix: a deny-by-shape rule, not a field-name list.
- **N-B2 — [WC · UI griefing, fails closed] Garbage `value` crashes the approval modal render — [VERIFIED]**
  `RequestApprovalModal.jsx:89` runs `BigInt(reqParams[0].value)` outside any
  try/catch. The pre-modal filter (`WalletConnectProvider.jsx:914-938`) checks only
  `from` and chain, so the request is queued and re-crashes the WC page on every remount
  until the session is deleted or the app restarts. Nothing is signed. App-level
  `ErrorBoundary` prevents a whole-app white screen; the route is unusable.
  *Fix:* guard the parse, or validate `value` before queueing.
- Carried MEDIUMs, all **STILL PRESENT**:
  - **M-1 [RASP · I4]** `'sign'` in `blockedActions` is read only by
    `TokenApprovals.jsx:154,165` (`degrade.js:226`); `compose.js:64-75` and
    `presign.js:44-53` read the tier only.
  - **M-2 [WC]** Approval-granting calldata outside the decoded/opaque selector sets
    scores "not an approval" (`calldata.js:32-37`, `:60-66`, `:104`): e.g. `allow(address,bool)`,
    `approveDelegation`, `authorizeOperator`, `approveAndCall`, `increaseApproval`.
  - **M-3 [KEK, latent]** `encryptVaultWithDekV3` drops `kekKdf` (`vault.js:676-713`);
    reseal sites keep the old stamp (`native.js:1160-1167`, `:1678-1684`, `:1780-1787`,
    `web.js:784-792`, `:932-936`). Latent while `AAD_V3_MIGRATION_ENABLED = false`
    (`vault.js:323`). **Fix before any flag flip.**
  - **M-4 [Auth]** Kill-before-count window on the H-3 cohort (`WalletEntry.jsx:1200`).
  - **M-5 [Auth]** Duress/hidden success clears the wrong-PIN counter
    (`WalletEntry.jsx:1089`); design tension, unresolved.
  - **M-6 [Auth · I3]** Decoy Settings shows a placeholder (`Settings.jsx:425-431`). The
    new Subscription row (`:518-519`) and OTA row (`:656`) add further primary/decoy
    asymmetry around it.
  - **M-7 [iOS]** `QA-INSTRUMENT-TEMP` `NSLog` block, `SceneDelegate.swift:67-73` **[VERIFIED
    still present]**. See N-A4 for reach.
  - Carried M items from 09-14 not re-derived (Android biometric-cache alias auth-binding,
    TP, WC daily cap, fast-path attestation on unlock `native.js:645`, `:1328`):
    presumed STILL PRESENT; files untouched.

---

## LOW

### New this run

- **N-A2 — [RASP] `TokenApprovals` revoke signs with no tier gate.** `TokenApprovals.jsx:152-170`,
  `:89` use `sensitiveGate(artifact,'sign')` + 2FA but never `presignGate` or
  `requiresBiometric`; a ROOTED/ELEVATED WARN device gets no friction. Payload is
  `approve(spender,0)`; BLOCK tiers are stopped. Consistency gap that widens M-1.
- **N-A3 — [RASP] WARN-tier biometric step-up is a UI boolean in one place.**
  `requiresBiometric` read only in `SendCrypto.jsx:1338`, `:1526`, `:1536`; state
  `raspWarnBioOk` (`:1272`); `verifyBiometric2fa` falls back to device passcode
  (`biometric.js:130-170`). Sign-time re-derivation does re-check the fresh artifact.
  WC and CryptoSigning reject WARN outright.
- **N-A4 — [iOS] M-7 reach is wider than recorded.** The `NSLog` iterates every
  `URLContext`, including URLs the allowlist rejects, so a `wc:` / `veyrnox://wc?uri=`
  pairing URI (WalletConnect symKey and topic) is logged unredacted. One-line delete.
- **N-B3 — [WC]** A tx that fails gas estimation is still broadcast at the 1M gas cap
  (`WalletConnectProvider.jsx:797-800`). Bounded by the per-chain fee ceiling and the
  user's Approve tap. Fix: refuse instead of defaulting.
- **N-B4 — [WC]** A flagged dApp domain is banner-only at sign time and tier-gated
  (`RequestApprovalModal.jsx:233-239`, `:254-256`). The session-approval block
  (`session.js:225-233`) is not tier-gated.
- **N-B5 — [WC, inference]** `personal_sign` content is never scored
  (`WalletConnectProvider.jsx:414-468`); a 32-byte hash shows as raw hex. For a Safe
  owner this could be an approval vector. Safe semantics not verified. Add a
  warning for exactly-32-byte hex messages.
- **N-D1 — [Auth · I3]** `applySubscriptionDetail`/`refreshSubscription`
  (`TierProvider.jsx`, new hunks ~`:46-70`, `:102-105`, `:147-150`) do not re-check
  `isDeniabilityOrDemoActive()` after the awaited RevenueCat call. A slow call started
  before a decoy unlock could show real plan state ("Ends on…", "billing retry") in
  the decoy's Settings. Low likelihood. Fix: re-check before `setSubscription`.
- **N-D2 — [Auth, info]** `deniabilitySession.js` now imports `@/api/demoClient`
  (load-time side effect). Fail-closed direction; no practical issue found.
- **N-C1 — [KEK/Android, info]** R8 optimisation (#2765) has no release-APK KEK
  enroll/unlock device test. Static read: all `@PluginMethod`s are public and kept,
  no reflection or JNI. BUILT-level only.
- Carried LOWs, all **STILL PRESENT**: L-4 Argon2id OOM counted as a wrong PIN
  (`kekProfiles.js:102-105`); L-5 tampered `kekKdf` throws uncoded (`:49-55`);
  L-6 (WC) literal-`to` check late and non-rejecting (`WalletConnectProvider.jsx:713-715`);
  L-6 (KEK) no RASP gate on enroll/clearCredential (`HardwareKekPlugin.kt:126-176`,
  `:279-290`; `.m:278-294`); L-7 plaintext H/DEK write-side residue (`HardwareKekPlugin.m:209`,
  `:477`; `AndroidBiometricCachePlugin.kt:642`); WC L-7 no address corpus
  (`:561-569`); L-8 per-request expiry unenforced (`session.js:121`); L-9 spend cap
  values only ERC-20 `transfer`/`transferFrom` and native value (`:302-336`);
  L-10 `sessionUnresolved`-adjacent plaintext PIN ref `sessionUnlockSecretRef`
  (`WalletProvider.jsx:1112`, `:1165`, `:1714`, `:2098`; no readers); L-11 background
  triggers burn `copySecret` wipe retries; L-13 fast-path read side has no passkey
  check; L-14 stale comments (`attestation.js:26-29`, `getFreshRaspArtifact.js:35-38`,
  `nativeProbe.js:91-92`, `degrade.js:126-132`, `vault.js:758`); unparseable fee skips
  the WC fee ceiling (`:785-791`); iOS re-sign with a valid developer cert keeps
  `CS_VALID` (disclosed, `RaspIntegrityPlugin.m:39-41`, `:495-506`); web fresh artifact
  can never be ALLOW (`getFreshRaspArtifact.js:92-100`); stalled bridge skips session
  latches (`getFreshRaspArtifact.js:60-72`, `nativeProbe.js:81-147`).

---

## Status vs prior audit (2026-09-28)

| Finding | Status |
|---|---|
| H-1 WC typed-data fall-through | STILL PRESENT |
| H-2 attestation on dashboard | STILL PRESENT |
| H-3 profile-walk timing | STILL PRESENT |
| H-4 primary/decoy tier | STILL PRESENT |
| M-1 `'sign'` unread | STILL PRESENT |
| M-2 approval calldata gaps | STILL PRESENT |
| M-3 v3 reseal drops `kekKdf` | STILL PRESENT (latent) |
| M-4 kill-before-count | STILL PRESENT |
| M-5 duress resets counter | STILL PRESENT |
| M-6 decoy Settings placeholder | STILL PRESENT (asymmetry widened) |
| M-7 iOS QA NSLog | STILL PRESENT |
| Carried LOWs listed above | STILL PRESENT |
| Android tamper-cert placeholder | FIXED / PASS (blank release cert hard-fails build; `build.gradle:370-380,518-527`) |
| Any REGRESSED | None |

---

## INFO / PASS

Read-confirmed (not device-verified):

- **Gate field reads.** SendCrypto, WC and CryptoSigning read `proceedAllowed` /
  `signerReachable`; the historic `gate.blocked`/`gate.sentence` bug is fixed
  (`WalletConnectProvider.jsx:1018-1027`).
- **Fail-closed lattice.** Unknown RASP tier → BLOCK; unknown tx level → CONFIRM;
  probe error/timeout/shape drift yields WARN or BLOCK, never ALLOW. `BYPASS_RASP` throws
  in a production build.
- **WC.** `presignGateOrReject` in all four handlers with `acknowledged` hard-coded
  false; `eth_sign`, v1/v3 typed data, `wallet_addEthereumChain` blocked; chain and
  session/topic binding; primaryType graph reconciliation; gas and per-chain fee
  ceilings; relay closed in decoy/hidden/demo.
- **KEK.** I6 `combineKek` ordered concat untouched; stamp bounded to the allowlist
  before Argon2id allocation; Android key `setInvalidatedByBiometricEnrollment(true)`,
  `AUTH_BIOMETRIC_STRONG`, no `DEVICE_CREDENTIAL`; StrongBox preferred with honest
  fallback reporting; iOS Secure Enclave key with `.biometryCurrentSet`, no Keychain
  fallback under the SE name (I4).
- **Auth.** `captureVerifierSafe` never throws; credentials over 1024 chars rejected
  before Argon2id; PIN session floor raised before storage write; wipe at 10 misses;
  `copySecret` non-empty wipe sentinel and visibilitychange/blur/focus triggers.
- **New code.** `OtaVersionRow` local and I3-hidden; `subscriptionState.js` display-only,
  no gate reads it, residue key in panic list; intro-trial gates I3-checked; IOC
  manifest refresh sends an empty body, is I3-gated, and verifies Ed25519 signature,
  key id, size cap and rollback; Sentry collection opt-out intact.
- **I3.** `attestationProbeSource` checks deniability before any platform call.

---

## Suggested fix order (for the owner; nothing here was changed)

1. **H-1 + N-B1**: one deny-by-shape fix for typed data. **M-7 / N-A4**: delete the
   `NSLog` block (it logs WalletConnect pairing secrets).
2. **H-3**: stamp on any unstamped success (also closes M-4).
3. **N-A1**: read the merged Android manifest in a build and decide on `<queries>`.
4. **H-2**: opt-outs on display surfaces plus a structural pin.
5. **N-B2**: guard `BigInt` in the approval modal.
6. **H-4 / M-1 / H-8**: owner decision on how the attestation-unavailable leg is weighted.
7. **M-3** before any `AAD_V3_MIGRATION_ENABLED` flip.

---

*INTERNAL audit. Not the outstanding independent third-party audit. Nothing in this
report is device-verified, and no status tag advances on it.*
