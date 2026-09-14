# Internal Security Audit — 2026-09-14
## Scope: RASP · WalletConnect · Hardware KEK · Auth Gates (Weekly)

> **Internal static-analysis pass.** Conducted by internal Claude specialist agents.
> Static code review only — no dynamic testing, no on-device verification.
> An independent third-party audit remains RECOMMENDED (see CLAUDE.md §Hard rules).

Conducted: 2026-09-14
Method: Static code analysis via parallel specialist agents (4 agents × 4 surfaces)
Branch audited: `security-audit/2026-09-14`, pinned to `origin/main` @ **`845f9b4e`**
Status: **Findings only — nothing fixed. Do not mark anything verified without on-chain txid or on-device evidence.**

---

## How to read this report

Every finding carries one of:

- **[VERIFIED]** — the reporting agent traced the path, *and* the audit author
  independently re-read the decisive lines at the audited pin.
- **[AGENT]** — reported on agent evidence with citations, not independently re-read.

`file:line` references are against `845f9b4e`. This repo merges 10+ times a day;
re-read before acting. Finding IDs are this report's own; the agent-local IDs
(A-n, B-n, C-n, D-n) are given in brackets so the source can be traced.

### Deviations from the runbook

- All four runbook `subagent_type` names resolved (`Penetration Tester` ×2,
  `Blockchain Security Auditor`, `Application Security Engineer`). No substitution.
- All four agents ran on `opus` (CLAUDE.md model-cost rule: wallet-core, signing,
  KEK and RASP are the escalation cases).
- Each brief was extended beyond the runbook's file list to cover **Theft
  Protection** (`src/lib/theftProtection.js`, `src/lib/sendGate.js`,
  `src/pages/SendCrypto.jsx`), which landed after the last audit and touches all
  four surfaces.
- Two agents read third-party dependency source (`@aparajita/capacitor-biometric-auth`
  10.0.0, `@walletconnect/sign-client` 2.24.0) from `node_modules` in *other*
  `/tmp` worktrees, because the audit worktree has no `node_modules`. Versions were
  matched to `package-lock.json`. The shared primary checkout was not read.
  Behaviour claimed from those libraries is **[AGENT]** even where the calling code
  is **[VERIFIED]**.

---

## The theme of this run: Theft Protection shipped around the audit gates, not through them

Theft Protection (#2498, 4ba80bbf, #2518, #2519) landed four days after the
2026-09-07 audit and is the source of **four of five HIGHs**. Individually each
branch of `runTheftProtectionGate` fails closed, and the agents confirmed that. The
defects are in how the gate was *composed* with the existing controls:

1. It reuses `getFreshRaspArtifact`, which composes **remote attestation** — the
   leg whose own header says "NEVER ON UNLOCK" — into the unlock path (H-1).
2. It was wired into `unlock()` only, not the default-ON fast-path unlock that
   `WalletEntry` tries first (H-2).
3. It reuses `verifyBiometric2fa`, which deliberately falls back to the device
   passcode — the opposite of what TP's copy and catalogue entry promise (H-4).
4. It requires `TIER.ALLOW`, turning every WARN condition — including the #2276
   `INTEGRITY_UNAVAILABLE` that was accepted at WARN precisely so genuine devices
   are not refused — into a hard unlock refusal whose off-switch is behind the
   lock (H-5).

And the TP mirror on the WC signer converted a refusal the user can retry, which
exposed a queue-retention bug created by the previous audit's H-1 fix (H-3).

Every one of these reuses an existing helper whose documented contract differs
from the new caller's assumption. That is the pattern to check in review: when a
security feature calls an existing gate, read the callee's header, not its name.

---

## Changes since last audit (2026-09-07 @ `d0c4423c` → 2026-09-14 @ `845f9b4e`)

`d0c4423c` confirmed an ancestor of the audited commit. Security-relevant commits
(non-merge, filtered to audited surfaces plus `functions/`, `supabase/functions/`, `sql/`):

| Commit | Surface | Summary |
|---|---|---|
| `5e852aad` (#2422) | WC, Auth | 09-07 H-1/H-2: WC refusals throw; send 2FA uses detailed verify |
| `3424de6f` (#2426) | RASP, WC | 09-07 M-1/M-2: hard-signal session latch; WC remote screen tier-gated |
| `d6300dc4` (#2428) | all | 09-07 LOWs: 13 fixed, L-2 and L-3 disclosure half by-design |
| `0af3192f` (#2430) | KEK | 09-07 M-5/M-6: unauth alias requires hardware KEK; raw-DEK comment |
| `aba21e0f` (#2431) | Auth | 09-07 M-3/M-4: dead step-up exports deleted; equalizer visible outcome |
| `29e6c0a9` (#2498) | Auth, RASP | **NEW** Theft Protection: OS biometric step-up on unlock |
| `c8c72fc8` (#2518) | Auth | TP refusal never counted as a wrong PIN |
| `61fa71e8` (#2519) | Auth | TP opt-in marker added to panic-wipe residue list |
| `4ba80bbf` | WC, Send | **NEW** TP authorises over-limit sends (SendCrypto + WC signer) |
| `cc9efadb` (#2537) | Send | SendCrypto deniability gates on shared-store reads/writes |
| `f7fc8cb7`, `2a7a06ae`, `e5415046`, `9b22cde1` | SQL | bug_reports storage policy removed; parity audit |
| `803bfb07`, `230637fd`, `69fbd29c`, `f3f764a5` | referrals | Out of this audit's four surfaces; covered by the daily diff |

---

## HIGH

### H-1 — [RASP · I3/I2] Theft Protection runs remote attestation on unlock, for the primary set only — **[VERIFIED]** · NEW [A-1]

- `theftProtection.js:33` imports `getFreshRaspArtifact`; `:174-183` awaits it.
  Called from `WalletProvider.jsx:1930` inside `unlock()`.
- `getFreshRaspArtifact.js:92-94` composes `attestationProbeSource()` on native
  whenever `ATTESTATION_ENABLED` — which is `true` (`attestation.js:78`).
- `attestation.js:26-29` and `:202`: "NEVER ON UNLOCK … attestation-on-unlock is
  the exact deniability trap §4 of the egress-decision doc rejects. Do not import or
  call this from any unlock path." `docs/rasp-attestation-egress-decision.md` §5
  marks attestation at unlock **REJECTED** (Option C).
- The gate returns early when `!isPrimary` (`theftProtection.js:168`), so a primary
  unlock with TP on emits a Play Integrity / App Attest request and a decoy/hidden
  unlock does not. `attestationProbeSource`'s own deniability guard does not fire
  because no deniability session is active at primary unlock.
- **Reachability:** TP opt-in, native, primary unlock; a network observer (or
  latency timing — up to `FRESH_PROBE_TIMEOUT_MS`) separates the sets. On iOS only
  the first attestation reaches Apple; later ones are local assertions **[AGENT]**.
- **Mitigating:** TP's biometric prompt is already a visible primary-only
  difference (see M-4). This adds a passive, remote channel on top.
- **Fix:** use `getFreshLocalRaspArtifact` (the on-device-only leg already used by
  `SeedGrid.jsx` and `WalletEntry.jsx`). Add a test that the unlock path never
  reaches `attestationProbeSource`.

### H-2 — [Auth] Theft Protection never runs on the fast-path biometric unlock — **[VERIFIED]** (code path) · on-device **[UNVERIFIED]** · NEW [D H-1]

- `runTheftProtectionGate` has exactly three production callers:
  `WalletProvider.jsx:1930` (`unlock()`), `SendCrypto.jsx:1778`,
  `WalletConnectProvider.jsx:689`. `WalletProvider.unlockBiometricOnly`
  (`:2277-2330`) mounts the primary session and calls `setUnlocked(true)` with no TP
  check, and `keyStore.unlockBiometricOnly` (`native.js:1301+`) gates on
  deniability, fast-path enabled, disclosure, duress, RASP ALLOW and KEK — not TP.
- `WalletEntry.jsx:866` tries `unlockBiometricOnly()` first; fast path is default-ON
  (`fastpathUnlock.js:62-63`).
- **Reachability [AGENT]:** Android, KEK vault, biometric unlock on, no duress, RASP
  ALLOW. The DEK read is silent inside the Keystore 30 s auth window
  (`native.js:1338-1346`) — the phone-snatch case TP exists for. TP's settings copy
  promises the check happens "before opening the wallet" (`TheftProtectionSettings.jsx:5`, `:65-69`).
- **Fix:** in `unlockBiometricOnly`, if `isTheftProtectionEnabled()`, throw a
  `FastpathError` so the user falls back to PIN (simplest), or run the gate before
  `setUnlocked`.

### H-3 — [WC] A refused request stays queued and can be approved again; the retry signs and broadcasts after the dApp was told "rejected" — **[VERIFIED]** (code path) · SDK behaviour **[AGENT]** · REGRESSION from 09-07 H-1 fix [B-1]

- All three signing wrappers remove the request from `pendingRequests` only after
  the handler returns: `WalletConnectProvider.jsx:1096`, `:1115`, `:1211`
  (`handleRejectRequest` likewise at `:1216`, after an awaited `rejectRequest`). Since
  #2422 every gate refusal `throw`s after `rejectRequest(...)`, so the filter is
  skipped and the request stays queued. (The 09-07 report's refutation relied on
  the filter running "unconditionally after the handler returns" — true before the
  fix, false after.)
- `RequestApprovalModal.jsx:268-287`: on throw the modal sets `err` and stays open;
  `approveBlocked` (`:232-238`) does not consider `err`, so Approve stays enabled.
- A second tap re-runs the handler. There is no "already answered" latch (no
  `answered`/`responded` state in `WalletConnectProvider.jsx` or
  `evm/walletconnect/*.js`). If the transient cause has cleared, the gates pass and
  `withPrivateKey` signs and broadcasts (`:717+`).
- **[AGENT]** sign-client 2.24.0: the post-broadcast `respondToRequest` throws
  ("Record was recently deleted"), so the request remains queued with Approve
  enabled; each further tap broadcasts another transaction with a fresh nonce.
  `handleRejectRequest` also throws before its filter, and `WalletConnect.jsx:189`
  re-opens the same request.
- **Reachability:** any first refusal that can clear on retry — TP `declined`
  (user cancels Face ID; new with 4ba80bbf), `RASP_WARN_REJECTED` on a probe
  timeout, `WC_SEND_LIMITS_UNAVAILABLE` on a failed read.
- **Impact:** user-approved on-chain sends while every surface says the send
  failed and the dApp believes it was rejected — likely followed by a retry from
  the dApp.
- **Fix:** remove the request from the queue in a `finally` in all three wrappers
  and in `handleRejectRequest` (`:1214-1217`); add a per-`(topic,id)` answered latch checked before
  `withPrivateKey`. Pin it at modal level: after a refusal, a second Approve must
  not reach the signer.

### H-4 — [Auth · I4 honesty] Theft Protection's "biometric" accepts the device passcode, and on Android a Class-2 biometric — **[VERIFIED]** (passcode fallback) · Android strength default **[AGENT]** · NEW [D H-2, B-3]

- Claims: `theftProtection.js:9-15` ("iOS face-STRICT", "Android BIOMETRIC_STRONG"),
  `featureCatalogue.js:193` ("BiometricPrompt Class 3"), `sendGate.js:136`
  ("fresh Face ID / BIOMETRIC_STRONG prompt").
- Code: TP calls `verifyBiometric2fa` (`biometric.js:130-171`), which
  - on `biometryLockout` retries with `allowDeviceCredential: true` (`:160-162`);
  - with biometrics not enrolled but the device secured, goes straight to the
    passcode (`:167-168`).
- The iOS face-strict post-check (`theftProtection.js:199-207`) reads cached
  `biometryType` — the device's capability, not the method that authenticated — so
  a passcode entered after Face ID lockout still passes on a Face ID iPhone.
- **[AGENT]** `androidBiometryStrength` is never set; the plugin defaults to
  `BIOMETRIC_WEAK`.
- The result is a JS boolean with no hardware-bound key behind it, against the
  CLAUDE.md A07 rule ("never a simple boolean").
- **Reachability:** TP's threat model is a thief who already knows the wallet PIN.
  The same shoulder-surf usually yields the device passcode. Fail Face ID five
  times, enter the passcode, TP passes. The same weakness now authorises over-limit
  sends in SendCrypto and on the WC signer (see M-5). H-3's retry loop is a free way
  to burn the five attempts.
- **Fix:** give TP its own verify — `allowDeviceCredential: false` on every branch,
  `androidBiometryStrength: STRONG`, lockout/not-enrolled → `declined`; or bind TP
  to a Keystore/Keychain key requiring biometric auth. Until then, correct the three
  claims (I4: fail honest).

### H-5 — [RASP · availability] Theft Protection turns every WARN into a hard unlock refusal with no in-app way out — **[VERIFIED]** (tier mapping) · prevalence **[AGENT]** · NEW [A-2]

- `theftProtection.js:181`: `if (raspTier !== TIER.ALLOW) throw … 'rasp-blocked'`.
- `INTEGRITY_UNAVAILABLE` is `TIER.WARN` (`degrade.js:118-127`). Through the
  attestation leg (H-1) it is produced by: device offline, Play Integrity slower
  than 1500 ms, sideloaded build, iOS entitlement gaps (#2277), and #2276 pin misses
  **[AGENT]**. Every ELEVATED soft signal (developer mode, third-party keyboard,
  accessibility service, proxy — `degrade.js:69-93`) is also WARN **[AGENT]**.
- The refusal fires after the PIN decrypts the vault; the TP off-switch is in
  Settings, behind unlock. `TheftProtectionSettings.jsx:44` checks biometric support
  only, never RASP tier, before enabling.
- **Why HIGH:** #2276 was closed as accepted residual at WARN specifically so a
  wrong pin would not self-renew a BLOCK on genuine devices. TP re-imports that
  lockout at unlock instead of at sign. Recovery is reinstall + seed restore.
- **Fix:** gate unlock on the on-device leg only (same change as H-1); treat
  ELEVATED / `INTEGRITY_UNAVAILABLE` as "biometric required", refuse only on BLOCK;
  probe RASP when the user enables TP.

---

## MEDIUM

### M-1 — [KEK] Android biometric-cache storage alias is not auth-bound; the 09-07 M-6 guard is bypassable by calling `getSecret()` directly — **[VERIFIED]** · NEW [C-1]

- `AndroidBiometricCachePlugin.kt:527-533`: `ensureStorageKey()` generates
  `storageAlias` with `requiresAuth = false` on both StrongBox and TEE attempts.
- `getSecret()` (`:99-121`) checks only RASP block tier, structural presence and the
  invalidation sentinel, then `decryptSecret` — no `BiometricPrompt`/`CryptoObject`.
  The sentinel check treats `UserNotAuthenticatedException` as valid (`:677-678`).
- `AndroidBiometricCacheConfig.kt:64` `REQUIRES_USER_AUTH_LEGACY = true` has **no
  production reader** (`grep -rnF` outside `/test/` returns only the declaration), so
  its JVM test pins a constant that gates nothing — coverage that reads as present.
- `biometricUnlock.js:274-278` already admits the "auth-gated" legacy read "does not
  itself fire a JS-layer prompt — the JS gate lives in retrieveUnlockSecret".
- **Reachability [AGENT]:** in-process code (WebView script injection, a hook RASP
  grades WARN, root as the app UID). On an Android 11+ **non-KEK** vault with
  Biometric Unlock on, this returns the vault password. On a KEK vault it returns C
  only, which is useless without H. The agent also reports `HardwareKek.enroll()` is
  un-gated, so alias presence (the M-6 guard's "unforgeable Keystore fact") can be
  forged — see L-6.
- **Fix:** auth-bind the storage alias (`setUserAuthenticationParameters(0,
  BIOMETRIC_STRONG)` + `CryptoObject` in `getSecret`) under a `.v2` alias with
  migration; wire the config constant into `ensureStorageKey`; correct the M-6
  wording in the plugin comment and the 09-07 report.

### M-2 — [Auth] An import-time migration silently re-enables Biometric Unlock after the user turned it off in Settings — **[VERIFIED]** · NEW [C-2]

- Settings OFF: `BiometricUnlockSettings.jsx:79` → `disableBiometricUnlock`
  (`WalletProvider.jsx:2144-2155`) writes biometric `'0'` and clears the cache, but
  never touches the fast-path key.
- Fast-path key absent reads as ON (`fastpathUnlock.js:62-64`: only exact `'0'`
  disables).
- `migrateFastpathState` runs at module import (`:164`) and, when fast path is on and
  biometric is off, calls `setBiometricUnlockEnabled(true)` (`:130-132`). Net: every
  cold start reverses the opt-out; the next PIN unlock re-caches the PIN (M-1's
  cache). Bypasses the NF-2 two-step enable confirm.
- The first-run consent **decline** path is safe — `BiometricConsent.jsx:64-66`
  writes both prefs `false`. Only the later Settings opt-out is reversed.
- **Fix:** have `disableBiometricUnlock` also set fast path `'0'`, or run the
  migration only when fast path is explicitly `'1'` and biometric is not explicitly
  `'0'`.

### M-3 — [Auth] Theft Protection and the spend limits it enforces can be switched off with no step-up — **[AGENT]** · NEW [D M-1]

- `TheftProtectionSettings.jsx:17` ("Switching OFF is never gated"), `:53`.
  `SecurityCenter.jsx:157-165`: `toggleLimit`/`deleteLimit` have no
  `requireTwoFactor`; only session revoke is guarded (`:50`).
- TP's own threat model is someone holding an unlocked primary session; one tap
  defeats the over-limit gate, after which only the `limitAck` checkbox remains
  (`sendGate.js:146`).
- **Fix:** gate TP-off and limit toggle/delete behind `requireTwoFactor`, or behind
  `runTheftProtectionGate` while TP is on.

### M-4 — [Auth · I3] Theft Protection prompts only on the primary unlock — a coercer-visible real/decoy distinguisher — **[AGENT]** · NEW [D M-2]

- On KEK vaults the hardware-factor prompt fires before the PIN is checked
  (`native.js:747-757`), so real and duress PINs currently look identical. TP adds a
  second biometric prompt (plus H-1's attestation) only when `isPrimary`
  (`WalletProvider.jsx:1920-1930`; `theftProtection.js:168`).
- `twoFactorGate.js:48-56` explicitly names a gate that skips on decoy sessions a
  "deniability TELL" and fixes it with per-set parity; `theftProtection.js:18-20`
  argues the opposite.
- A forensic examiner can read `veyrnox-theft-protection=1`, force an unlock, and see
  no TP prompt.
- **Fix:** when TP is enabled, run the same prompt sequence (on-device RASP +
  biometric) on decoy/hidden unlocks with the same outcome handling. Reading the flag
  is already permitted by the module's convention.

### M-5 — [WC] Over-limit WC sends are now authorised by a generic biometric prompt; the modal never discloses the cap breach — **[AGENT]** · NEW [B-2]

- Before 4ba80bbf the WC cap was a hard stop (`WalletConnectProvider.jsx:632` calls
  it "THE ONLY THING ENFORCING THE CAP"). Now a breach is cleared by
  `runTheftProtectionGate` (`:683-697`), whose OS prompt reads "Authorise this action
  in VEYRNOX" (`biometric.js:145`).
- SendCrypto renders an inline over-limit note (`SendCrypto.jsx:2448`);
  `RequestApprovalModal.jsx` never reads limits.
- Against a thief the biometric is the right factor; against a dApp tricking the
  owner (the drain case the cap backs up) the cap is cleared by a routine-looking
  prompt. Compounded by H-4.
- **Fix:** evaluate limits in the modal with `evaluateSendAgainstLimits` and render
  the breach with the cap amount before Approve, or keep WC over-limit a hard reject.

### M-6 — [WC] The daily spend cap does not count WalletConnect sends — **[AGENT]** · NEW [B-4]

- `sumSentTodayUSD` (`txLimits.js:67-77`) totals `history` rows of type `send`; only
  SendCrypto writes them (`SendCrypto.jsx:1610`, `:1952`). The WC broadcast path
  (`WalletConnectProvider.jsx:717-806`) records nothing.
- A dApp can split a drain into requests each under the per-transaction cap; in-app
  sends never see WC spend either. Each request still needs user approval.
- **Fix:** record WC sends through the same entity write (primary only), or keep a
  local WC spend ledger that `sumSentTodayUSD` reads.

### M-7 — [RASP · I4] 09-07 M-1 latch fix is incomplete: a stalled bridge bypasses both session latches — **[AGENT]** · PARTIAL REGRESSION of claimed coverage [A-3]

- `getFreshRaspArtifact.js:88-95`, `WalletConnectProvider.jsx:372-378`,
  `getFreshLocalRaspArtifact.js:79-81` wrap `nativeProbeSource()` /
  `attestationProbeSource()` in `withFailClosedTimeout`; the latches
  (`nativeProbe.js:81,131-165`; `attestation.js:258-291`) run inside those functions
  only once the bridge settles.
- A bridge that never resolves hits the outer timeout first → `{available:false}` →
  `INTEGRITY_UNAVAILABLE` → WARN (biometric + ack overridable on Send).
  `nativeProbe.js:91-92` and `attestation.js:219` claim stall/timeout as closed.
  `nativeProbe.hardSignalLatch.test.js` has no never-settling case.
- **Ceiling:** the same Frida-capable attacker can forge an all-false verdict, which
  clears the latch by design (`nativeProbe.js:143-144`).
- **Fix:** move the timeout inside the latch
  (`applyHardSignalLatch(await withTimeout(sampleNativeProbe()))`), same for
  attestation; add a never-settling bridge test.

### M-8 — [RASP · I3/I2] Fast-path populate and read also compose attestation on unlock (since #2051, missed 09-07) — **[VERIFIED]** (call) · decoy-set coverage **[AGENT, medium confidence]** [A-4]

- `native.js:644` calls `getFreshRaspArtifact()` inside `populateFastpathBestEffort`,
  awaited after a successful primary PIN decrypt (`:800`); also
  `unlockBiometricOnly` (`:1330`).
- Guards include `isDuressConfigured()` (`:636`), which covers a duress PIN. The
  agent did not confirm whether a decoy/hidden set also sets the duress marker; if
  not, a primary unlock emits attestation and a decoy PIN unlock does not.
- **Fix:** switch both sites to `getFreshLocalRaspArtifact`.

---

## LOW

- **L-1 — [Auth] A Theft Protection refusal leaves the decrypted container in
  memory.** `containerRef.current = container` (`WalletProvider.jsx:1901`) and the
  action-password / hidden-2FA state (`:1919-1920`) are set before the gate (`:1930`);
  the throw has no catch and nothing scrubs until `lock()`. `withPrivateKey` checks
  `containerRef`, not `isUnlocked` (`:2386-2388`). The comment at
  `theftProtection.js:171-173` ("fails closed BEFORE the biometric prompt") is true
  of the prompt but not of the decrypt. Low: screens are `WalletGate`-guarded and WC
  checks `isUnlocked`. Fix: run the gate before assigning `containerRef`, or scrub
  and null on throw. **[VERIFIED]** (ordering) [D L-1, A-5]
- **L-2 — [Send] The TP one-shot token is never consumed on the Digital Shield
  path.** `SendCrypto.jsx:1812`, `:1905-1907` evaluate the gate with the ref's live
  value and never reset `theftProtectionVerifiedRef`; only `mutationFn` consumes it
  (`:1539-1540`); preflight short-circuits on a still-true ref (`:1775`). The reset
  at `:784` ignores a same-currency wallet switch. Mitigated by Digital Shield's
  external signer. Fix: consume in `finalizeDigitalShieldSend`; add from-address to
  the reset deps. **[AGENT]** [D L-2, B-7]
- **L-3 — [Auth] An Argon2id OOM during step-up verification still counts as a
  wrong PIN.** `credentialVerifier.js:128-133` catches a `deriveRaw` throw and returns
  `false`, making the `bricked` catch at `:160-164` dead. Burns a 2FA attempt and at
  the cap calls `lock()` (`SendCrypto.jsx:1733-1737`). Same family as 09-07 H-2 on the
  verify side; fails closed. Fix: let `deriveRaw` throw through, or return tri-state.
  **[AGENT]** [D L-3]
- **L-4 — [WC] The 09-07 L-3 fee-ceiling fix is bypassable with an unparseable
  fee.** `maxFeePerGas: "zz"` is truthy, skipping the capped-feeData branch
  (`WalletConnectProvider.jsx:738-761`); `resolveMaxFeePerGas` returns `null`, no fee
  field is set, ethers fills fees uncapped, and the modal's max-fee row is hidden.
  Same for `gasPrice`. Fix: reject, or fall through to the capped branch.
  **[AGENT]** [B-5]
- **L-5 — [WC] The 09-07 L-7 structural backstop's comment claims Safe `SafeTx`
  coverage it does not have.** `SafeTx` fields are flat primitives with no
  spender/operator/delegate and no nested struct, so it scores `LEVEL.OK`
  (`typed-data.js:34, 40-48, 62-74`); `operation=1` delegatecall on a 1-of-1 Safe is a
  takeover. No `SafeTx` test case. `{type:'address[]'}` spenders also escape. Fix: add
  `SafeTx` to the named lists (or flag `operation`), handle `address[]`, correct the
  comment. **[AGENT]** [B-6]
- **L-6 — [KEK] Android `HardwareKek.enroll()`/`clearCredential()` and iOS
  `clearCredential` have no RASP block-tier gate.** `HardwareKekPlugin.kt:126-176`,
  `:279-290`; `HardwareKekPlugin.m:278-293` (iOS `enroll` is gated, `:118-121`).
  Injected JS can delete a live KEK key (destructive DoS until seed restore) and
  forge alias presence (M-1). Fix: add the gate to both. **[AGENT]** [C-3]
- **L-7 — [KEK] Plaintext H / DEK residue beyond the disclosed `hB64` residual.**
  iOS decrypt releases `CFData pt` unwiped (`HardwareKekPlugin.m:394`, `:459-479`);
  iOS enroll never wipes `NSData hData` (`:210`, `:220`) though comments at `:221`,
  `:452-458` imply full zeroing; Android `encryptSecretWith` leaves
  `secret.toByteArray()` unscrubbed (`AndroidBiometricCachePlugin.kt:642`) — for
  `putFastpathDek` that is the base64 raw DEK (09-07 L-11, write side). Heap-dump
  reachability only. **[AGENT]** [C-4]
- **L-8 — [RASP] On web the fresh RASP artifact can never be ALLOW.** Off native,
  `attestationResult` is `null` → `INTEGRITY_UNAVAILABLE` → WARN
  (`getFreshRaspArtifact.js:92-100`; `WalletConnectProvider.jsx:376-392`). Web
  `CryptoSigning.jsx:62-64` always refuses, WC signing always rejects
  `RASP_WARN_REJECTED`, every web Send shows the WARN (click-through training).
  `getFreshRaspArtifact.test.js:111-118` only asserts the tier is defined. Fix: skip
  the attestation leg off native, or record it as intended. **[AGENT]** [A-6]
- **L-9 — [RASP/KEK] Stale comments and one false-positive risk.**
  - `HardwareKekPlugin.m:471-472` says `M2C_HARDWARE_WRAP_ENABLED` "stays false"; it
    is `true` (`native.js:210`). `EnclaveKeyService.swift:3`, `:101-103`, `:204` still
    say NOT DEVICE-VERIFIED / made on Windows.
  - "Fast path opt-in OFF by default" at `AndroidBiometricCachePlugin.kt:324`,
    `fastpathDekCache.js:27-29`, `native.js:1307-1308` — default-ON since #2055.
  - `kek.js:23-24`, `hardware.js:10-11` say Android H is HMAC over a fixed salt; v3
    uses the per-enrollment kekSalt (`HardwareKekPlugin.kt:346-365`).
  - `native.js:1364`, `:1392` match `KEY_PERMANENTLY_INVALIDATED`, which
    `getFastpathDek` never emits (dead branch).
  - `rasp_early.c:11-15,34-36` describes a `PTRACE_TRACEME` BLOCK signal the Kotlin
    discards (`RaspIntegrityPlugin.kt:910-913`); if `TRACEME` succeeds on a
    SELinux-permissive ROM, later TracerPid probes (`:382`, `:995`) may self-detect
    and arm the latch from a false positive. The native early gate treats
    `screenCapture` as BLOCK (`:915-916, 929-931`) while JS grades it WARN — USB-C/DeX
    display users may lose KEK access. **Low confidence.** **[AGENT]** [C-5, A-7]

**INFO** — `handleSendTransaction`'s `useCallback` deps (`WalletConnectProvider.jsx:1212`)
omit `isDecoy`/`isHidden`, which `isPrimary` reads at `:1182`. Covered by the live
`isDeniabilityOrDemoActive()` read and client teardown at `:1007-1015`; add the deps. [B]

---

## Status vs prior audit (2026-09-07)

| Prior | Status |
|---|---|
| **H-1** WC gate refusals returned silently | **FIXED** — throws at `WalletConnectProvider.jsx:433/499/593`. **But the fix introduced H-3** (queue retention). |
| **H-2** Fast-path session read as five wrong PINs by send 2FA | **FIXED** — both SendCrypto gates branch on `bricked` (`:1723-1727`, `:2859-2866`); bare `verifyActiveCredential` gone from `src/`. Verify-side sibling filed as L-3. |
| **M-1** RASP OS-probe leg has no session latch | **PARTIALLY FIXED** — latch arms only on positive hard detection (#2276-safe, confirmed `nativeProbe.js:135-146`). Stall vector still open: **M-7**. |
| **M-2** WC TIP remote screen not tier-gated | **FIXED** — `:1205-1207`. **[VERIFIED]** |
| **M-3** Dead `isVerifierReady` | **FIXED by deletion** — history comment only (`WalletProvider.jsx:1554`). |
| **M-4** Equalizer visible-outcome ordering | **FIXED** — `captureVerifierSafe` before throw (`:1886`); paint timing still unbenched. |
| **M-5** Fast-path raw DEK; stale wrapped-model comment | **FIXED** — comment corrected (`AndroidBiometricCachePlugin.kt:299-329`), but it still says "OFF by default" (L-9). |
| **M-6** `getSecretUnauth` auth-free | **FIXED as written, but bypassable** — guard at `:174-187`, `:217-231`; defeated by calling `getSecret()` on the un-auth-bound storage alias: **M-1**. |
| **L-1** Keychain class claim | **Prose corrected** (`biometricUnlock.js:22-33`, `:536-537`); code sets `whenUnlockedThisDeviceOnly` (`:200`); `biometricUnlockSecurityMode` still has zero callers. |
| **L-2** No attempt counter on password unlock | **BY DESIGN** — recorded at `WalletEntry.jsx:919-942`. Not re-filed. |
| **L-3** Fee ceiling keyed on dApp fee field | **FIXED for omitted fee**; unparseable-fee bypass: **L-4**. Disclosure half by-design. |
| **L-4** `estimateGas` without `from` | **FIXED** — `:732`. |
| **L-5** Approve affordances that can never succeed | **FIXED** — modal `:229-238`. |
| **L-6** Spend-limit read failure fails open | **FIXED** — `:652`, `:1156-1166`. |
| **L-7** Backstop inspected only top-level struct | **FIXED** — recursion at `typed-data.js:62-74`; coverage claim over-states: **L-5**. |
| **L-8 / L-9** Dead WC validators | **FIXED by deletion.** |
| **L-10** Stale `RaspIntegrityPlugin.kt` wiring comments | **FIXED** — `:548-559`, `:573-582`. |
| **L-11** Plaintext scrub on KEK reads | **FIXED** — `:254-258`, `:408-412`, `:661-666`; write side still open: **L-7**. |
| **L-12** `enroll()` docstring `KEK_ALREADY_ENROLLED` | **FIXED** — `HardwareKekPlugin.kt:111-124`. |
| **L-13** RASP gate missing on KEK write methods | **FIXED** — `:75`, `:173`, `:352`. Sibling gap on `enroll`/`clearCredential`: **L-6**. |
| **L-14** `WIPE_EXHAUSTED_EVENT` no consumer | **FIXED** — timer re-arms (`copySecret.js:125-127`), toast on exhaustion (`:143-147`). |
| **L-15** `assertPasskeyFactorSatisfied` never called | **FIXED by deletion** (`WalletProvider.jsx:249` comment only). |
| **Permit2 batch types** (09-05 H-1) | **Still FIXED** — `typed-data.js:12-16`. |
| **iOS re-sign tamper not detected** (2026-07-14 MEDIUM) | **STILL PRESENT, disclosed** — `RaspIntegrityPlugin.m:488-529`. |
| **#2276** Play Integrity pin posture | **Unchanged (WARN, accepted residual)** — but TP converts it into an unlock refusal: **H-5**. |

**One regression** (H-3, caused by the 09-07 H-1 fix). Two prior fixes are
incomplete against their own stated coverage (M-1→M-7, M-6→M-1). Everything else
from 09-07 is fixed or recorded by-design.

---

## INFO / PASS — controls confirmed working

**RASP** [A]
- `compose.js`: unknown RASP tier → BLOCK, unknown tx level → CONFIRM; BLOCK never overridable.
- `presign.js`: only ALLOW proceeds without an ack.
- `detect.js`: partial/malformed shapes and `available !== true` → `INTEGRITY_UNAVAILABLE`, never CLEAN.
- `degrade.js`: unknown condition → FAIL_CLOSED; blocked actions monotonic by danger rank.
- `nativeProbe.js`: reject / non-object / partial core shape → `{available:false}`; latch arms only from an available, well-formed positive verdict.
- `attestation.js`: deniability check runs before any platform or bridge call.
- `getFreshRaspArtifact`: never throws; total failure → BLOCK (`:107-110`), so TP's `rasp-unavailable` branch still fails closed.
- Historic `gate.blocked` misread: `handleApproveSession` reads `proceedAllowed` (`:1018-1025`); the 13 remaining `gate.blocked` readers consume `sensitiveGate()`, which does return that shape.
- Android release-cert tamper check is real, fails closed on a blank value (`RaspIntegrityPlugin.kt:828-831`, `:1038`).
- `useRaspArtifact`: a `BYPASS_RASP` build throws in production.

**WalletConnect** [B]
- Pre-sign RASP gate in personal_sign, eth_signTypedData_v4, eth_sendTransaction and session approval; async with fail-closed timeout; missing tier → BLOCK (`:364-419`). Every refusal throws.
- M11 session expiry (`:1063`); H-NEW-B step-up at every signing handler and session approval.
- H7 chain binding against the live session store pre-modal and at sign time; typed data without `domain.chainId` rejected.
- H8 address binding for personal_sign (both argument orders), typed-data signer, and `from` on sends.
- Blocked: v1/v3 typed data, `eth_sign`, `eth_signTransaction`, add/switch chain; namespaces advertise 3 methods.
- H-4 primaryType reconciliation; all Permit2 types score RISK; unlimited Permit scores RISK.
- 1M gas cap on supplied and estimated gas; per-chain fee ceiling on 1559 and legacy; priority fee clamped.
- ERC-20 transfer/transferFrom valuation; unvalued tokens and unreadable caps fail closed. TP ordering: presign → `from` bind → 2FA → limits → TP; non-TP throw keeps `WC_SEND_LIMIT_EXCEEDED`.
- VULN-19 RPC chainId check before signing; proposal TTL; known-bad dApp re-check inside `approveSession` for all tiers.

**Hardware KEK** [C]
- I6 holds: ordered H‖C, HKDF with fixed domain, length and all-zero rejection; `combineKek` zeroes ikm/H/C/bits in `finally` (`kek.js:216-285`).
- DEK wrap uses v2 AAD; unwrap errors generic.
- `setInvalidatedByBiometricEnrollment` on KEK, fast-path and sentinel keys; KEK key requires fresh BIOMETRIC_STRONG via `CryptoObject` every use; no DEVICE_CREDENTIAL on the KEK key.
- Real `KeyInfo` security tier reported; JS refuses SOFTWARE/unknown (`hardware.js:183-201`).
- iOS SE key uses `kSecAttrTokenIDSecureEnclave` + `biometryCurrentSet`, no software fallback; failed Keychain store rolls back the SE key.
- Fast path blocked in decoy/demo, with duress configured, before disclosure, and at any non-ALLOW tier, on read and write; cleared on DEK rotation and wipe.
- `enrollHardwareCredential` treats a failed probe as wrapped (09-07 M-3 still holding).

**Auth gates** [D]
- Every TP branch fails closed: non-ALLOW RASP, probe throw, verify throw/false, iOS non-face `biometryType` (strict equality).
- TP refusal never counted as a wrong PIN on PIN or biometric path (`WalletEntry.jsx:1134-1137`, `:878-883`); refusal does not reset the miss counter.
- TP settings render a placeholder under deniability/demo (`Settings.jsx:421`); write I3-guarded (`theftProtection.js:52`); TP marker in panic residue (`panic.js:255`).
- Stale `limitAck` cannot bypass TP (`sendGate.js:138-145`); `mutationFn` consumes the token before gate evaluation.
- PIN counter backoff before an attempt is spent; `storageDegraded` session floor (`WalletEntry.jsx:1017-1044`).
- `captureVerifierSafe` never throws; `verifyCredentialDetailed` reports a missing verifier as `bricked`; constant-time compare.
- Unlock race checkpoints A/B/C in place.

---

*INTERNAL audit. Not the outstanding independent third-party audit. Nothing in this
report is device-verified, and no status tag advances on it.*
