# Internal Security Audit — 2026-09-28
## Scope: RASP · WalletConnect · Hardware KEK · Auth Gates (Weekly)

> **Internal static-analysis pass.** Conducted by internal Claude specialist agents.
> Static code review only — no dynamic testing, no on-device verification.
> An independent third-party audit remains RECOMMENDED (see CLAUDE.md §Hard rules).

Conducted: 2026-09-28
Method: Static code analysis via parallel specialist agents (4 agents × 4 surfaces)
Branch audited: `security-audit/2026-09-28`, pinned to `origin/main` @ **`e92d72db`**
Status: **Findings only — nothing fixed. Do not mark anything verified without on-chain txid or on-device evidence.**

---

## How to read this report

Every finding carries one of:

- **[VERIFIED]** — the reporting agent traced the path, *and* the audit author
  independently re-read the decisive lines at the audited pin.
- **[AGENT]** — reported on agent evidence with citations, not independently re-read.
  Where an agent traced a path but the *magnitude* (timing, prevalence, SDK or OS
  behaviour) is inferred, that half is tagged **[AGENT]** separately.

`file:line` references are against `e92d72db`. Re-read before acting. Finding IDs
are this report's own; agent-local IDs (A-n, B-n, C-n, D-n) are in brackets.

### Deviations from the runbook

- All four runbook `subagent_type` names resolved (`Penetration Tester` ×2,
  `Blockchain Security Auditor`, `Application Security Engineer`). No substitution.
- Agents ran on the session's Opus model (CLAUDE.md: wallet-core, signing, KEK and
  RASP are the escalation cases).
- Briefs were extended to the files that changed since 09-14 on each surface:
  `src/wallet-core/keystore/kekProfiles.js` (new in #2731), `src/risk/calldata.js`,
  Theft Protection settings/step-up (#2696), and the Buy idle-lock suppression
  (#2756, #2763).
- Three findings are outside the four surfaces and were hit in passing
  (`ios/App/App/SceneDelegate.swift`: M-7, L-2, L-3). They are reported because one
  of them is an explicit "remove before commit" block in the live 1.0.2 build.
- Buy / Transak is owner-only (CLAUDE.md). L-12 is **reported, not a fix request.**

---

## Themes of this run

1. **The #2731 remediation (2026-09-21) opened new holes on two surfaces.**
   - The KEK profile-fallback walk fixed a real vault-bricking bug. But it stamps
     only on *fallback* success, so vaults enrolled at the current profile between
     2026-08-24 and 2026-09-21 are never stamped. On those vaults a wrong PIN, or a
     duress PIN, costs two extra Argon2id runs that the real PIN does not. That
     reopens the H-1 real/decoy timing oracle (H-3). Agents C and D found this
     independently.
   - The "M9" RASP fix appends `'sign'` to `blockedActions`, but no signing
     chokepoint reads that field (M-1).
2. **Deniability tells are coming from the attestation leg, not from `degrade()`.**
   The I3 guard in `attestationProbeSource` correctly makes zero calls in a decoy.
   But the guard sits upstream of the set-blind `degrade()`. So a decoy is always
   WARN where a clean primary is ALLOW (H-4). Meanwhile the primary dashboard fires
   attestation on mount and every 60 s (H-2), which a network observer can see.
3. **Typed-data scoring is still a denylist-by-omission.** EIP-3009
   `TransferWithAuthorization` (USDC) has no spender/operator/delegate field and is
   not in a named list, so it scores `LEVEL.OK` and WalletConnect signs it (H-1).
   The structural-backstop comment names payloads it does not actually catch.

---

## Changes since last audit (2026-09-14 @ `845f9b4e` → 2026-09-28 @ `e92d72db`)

Security-relevant commits on or touching the audited surfaces:

| Commit | Surface | Summary |
|---|---|---|
| `2e17c655` (#2731) | KEK, WC, RASP, server | 2026-09-21 audit remediation: `kekProfiles.js` profile-fallback unwrap + `kekKdf` stamp; approval-shape decoding (approve/increaseAllowance/setApprovalForAll/Permit2); literal `to` required on WC sends; `degrade.js` M9 (`'sign'` in `blockedActions` on native INTEGRITY_UNAVAILABLE); network-security config, Pages Functions, edge functions |
| `2ef5f681` (#2740) | WC | Fail closed on multicall- and permit-wrapped approvals |
| `a0ab4645` (#2743) | WC | S7 calldata/contract-code mismatch scored on the WC path |
| `56126fb7` (#2704) | Auth, KEK | SEC-05: stop re-arming biometric unlock each launch (closes 09-14 M-2) |
| `80acddf9` (#2696) | Auth, RASP | Step-up required to loosen a spend limit or turn Theft Protection off (closes 09-14 M-3) |
| `19058327` (#2680) | Auth, WC | Theft Protection seeds a $500 per-tx cap |
| `63fe0dac` (#2708) | Auth | SEC-03: revoking the current device locks the session |
| `3ba2406c`, `c3f14f7f`, `ffda3dfd`, `725c6c77` | Auth | Panic-wipe residue fixes (biometric pref, notifications, chaff provisioning) |
| `1aa55857` (#2705) | WC | CSP allowlists WalletConnect relay and verify API |
| `d4af8d9d` (#2751) | RASP (iOS) | UIScene lifecycle; RASP block screen moved to `SceneDelegate` |
| `ae50bfef` (#2756), `4a39a87e` (#2763) | Auth (Buy, owner-only) | Wallet idle lock suppressed during Transak checkout, 15-min cap |
| `64c61512`, `30094931`, `6e8fe8cd` | OTA | Two pinned hardware keys; OTA armed for 1.0.2. Out of this audit's surfaces |

`2e17c655` is an ancestor of the live 1.0.2 build commits (`dbb7f135`,
`a4559997`). The #2731 code paths below are therefore in the store builds.

---

## HIGH

### H-1 — [WC] EIP-3009 `TransferWithAuthorization`, marketplace orders and `SafeTx` score `LEVEL.OK` and are signed — **[VERIFIED]** · NEW [B-1]

**Where.**
- The named lists are `PERMIT_PRIMARY_TYPES` and `SEAPORT_PRIMARY_TYPES`
  (`src/wallet-core/evm/typed-data.js:12-16`, `:75`).
- The structural backstop fires only on an `address` field named
  `spender`/`operator`/`delegate` (`:34`, `:62-74`).
- Anything else falls through `detectAssetAuthorising` (`:135-168`) to
  `scoreWcTypedDataLevel` → `LEVEL.OK` (`src/lib/wcTypedLevel.js:119-127`).
- On WC, OK on a clean device means ALLOW, and the handler signs.

**Payloads that fall through.**
- USDC `TransferWithAuthorization(from,to,value,validAfter,validBefore,nonce)` and
  `ReceiveWithAuthorization`.
- 0x `ERC721Order`, Blur `Order`, LooksRare `MakerOrder`.
- Safe `SafeTx`. This is 09-14 L-5, now subsumed here.

The comment at `:18-22` names SafeTx, 0x ERC721Order and Blur Order as the reason
the backstop exists. It does not catch them. `grep -rnF TransferWithAuthorization src`
returns nothing, so this shape was never considered.

**Failure scenario.**
1. A dApp requests `eth_signTypedData_v4`
   `TransferWithAuthorization{from:user, to:attacker, value:balance}` on the USDC
   domain. The domain carries `chainId`, so chain binding passes.
2. The modal shows the struct name, no permit warning, and an enabled Approve.
3. The user approves and the wallet signs.
4. Anyone can now relay `transferWithAuthorization` and drain the USDC balance.

The spend caps and Theft Protection never apply to typed data.

**Fix.**
- Add the EIP-3009, Safe and marketplace primary types to named lists that score RISK.
- Better: default to CAUTION (which is refused on WC) for any domain whose
  `verifyingContract` is a registry token, known marketplace or Safe, unless the
  primaryType is on a small benign allowlist.
- Widen the backstop to `to`/`recipient`/`taker`/`receiver` when a `value`/`amount`
  uint is also present.
- Correct the comment.
- Add a pin test per type, and mutation-check it.

### H-2 — [RASP · I2/I3] Remote attestation fires automatically on every primary dashboard mount, foreground and 60 s heartbeat — **[VERIFIED]** (wiring) · per-call network egress **[AGENT]** · NEW, present since `e3682135` (2026-08-02) [A-2]

**Where.**
- `WalletPortfolioPage.jsx:1078` mounts `SecurityPostureMount` → `SecurityPosture`.
- `SecurityPosture.jsx:105` calls `useRaspArtifact()` with neither
  `deferAttestation` nor `excludeAttestation`. It runs before the dismissed-card
  `return null` (`:182`).
- The attestation effect (`src/rasp/useRaspArtifact.js:170-195`) re-runs on every
  `probeKey` bump:
  - on foreground (`:118-130`);
  - on the 60 s heartbeat (`:134-138`, `HEARTBEAT_MS = 60_000` at `:59`);
  - while `ATTESTATION_ENABLED = true` (`attestation.js:78`).
- The same unguarded call appears at `SecurityDashboard.jsx:107`,
  `RaspSecurity.jsx:92`, and `PersonalBackup.jsx:517` and `:776` (see L-1).

**Why it matters.** This contradicts the documented boundary. The hook's own options
comment (`useRaspArtifact.js:88-94`, "attestation only on explicit pre-sign
egress") and `attestation.js:26-29` ("NEVER ON UNLOCK") both say otherwise.

**Consequences.**
- A decoy/hidden session makes zero calls, so a network observer can tell a
  primary session from a decoy by the periodic Play Integrity / App Attest traffic.
  This is the 09-14 H-1 oracle, but it now applies to every primary user, not only
  those who opted into Theft Protection.
- [AGENT] On Android each call is a `requestIntegrityToken`. On iOS, after the first
  `attestKey`, calls are local assertions, so the egress is mainly Android.
- [AGENT] Quota exhaustion across the install base would push attestation to
  UNAVAILABLE (WARN) for everyone.

**Fix.**
- Pass `excludeAttestation: true` (display surfaces) or `deferAttestation: true` on
  every non-sign caller.
- Add a structural pin that `attestationProbeSource` is reachable only from the sign
  paths: SendCrypto review/confirm, WC `presignGateOrReject`, and CryptoSigning.

### H-3 — [KEK · Auth · I3] The KEK profile walk permanently breaks the H-1 unlock-timing equalizer for unstamped current-profile vaults — **[VERIFIED]** (logic) · timing magnitude **[AGENT]**, not benchmarked · NEW, regression from `2e17c655` [C-2, D-1]

**Where.**
- `unwrapDekWithProfiles` (`src/wallet-core/keystore/kekProfiles.js:86-116`) walks
  all of `KEK_C_PROFILES` when the blob has no `kekKdf` stamp. The profiles are
  96 MiB/t6, then 192 MiB/t3, then 64 MiB/t3.
- It returns `usedFallback: !stamped && i > 0` (`:101`).
- The caller writes the stamp only `if (unwrapped.usedFallback)`
  (`native.js:789-795`, `web.js:538-540`).

**Affected cohort.** A KEK vault enrolled at the current profile between 0a6565e8
(2026-08-24) and #2731, and not rewrapped since. On that vault:
- The correct PIN succeeds at `i === 0` and **is never stamped**, on every unlock.
- The M2c Enclave inner-blob path (`native.js:1435-1446`) never stamps at all
  [AGENT].

**Timing.**
- Real PIN: 1 × C(96/t6), then the 3-KDF equalizer.
- Duress, hidden or wrong PIN: C(96/t6) + C(192/t3) + C(64/t3), then the 3-KDF
  resolver (`WalletProvider.jsx:1800-1866`).

The extra cost is one 192 MiB/t3 plus one 64 MiB/t3 Argon2id, likely seconds on a
mid-range phone [AGENT]. It never heals itself. The claim at `kekProfiles.js:69-71`
that the cost is "paid once per legacy vault" is false for this cohort.

**Failure scenario.** A coercer times a known-wrong PIN, then the surrendered PIN. If
the surrendered PIN is as slow as the wrong one, it is the decoy. If it is clearly
faster, it is the real wallet.

**Fix.**
- Stamp any unstamped blob on success (`usedFallback || !blob.kekKdf`), including
  the M2c inner blob.
- Add a KDF-ledger test: on an unstamped current-profile blob, a hit and a miss spend
  the same profile multiset. Mutation-check it.
- Consider padding a hit on an unstamped blob up to the full walk, so the transient
  tell also closes for legacy vaults.

**Consequence.** M-4 (kill-before-count) follows directly from this asymmetry.

### H-4 — [RASP · I3] The RASP tier differs between primary and decoy sets on the same device, and the difference shows in the UI — **[VERIFIED]** (code path) · prevalence **[AGENT]** · NEW [A-1]

**Where.**
- Under deniability, `attestationProbeSource` returns `UNAVAILABLE` first
  (`attestation.js:244-246`). That is correct for I3.
- `detectAttestation` maps it to `INTEGRITY_UNAVAILABLE` (`:184-187`), which
  becomes WARN.
- A primary session on a device where attestation passes gets ALLOW.
- `degrade()` is set-blind, but its *input* is not. The existing deniability tests
  cover `degrade()` alone.

**Where the difference is visible.**
- SendCrypto: WARN sentence, ack, and a biometric only in the decoy
  (`SendCrypto.jsx:1297`, `:1490-1494`, `:1533-1541`).
- SecurityDashboard: an integrity banner only in the decoy (`:185-188`).
- The posture score is 15 points lower in the decoy (`SecurityPosture.jsx:158`,
  `securityPosture.js:232`).
- RaspSecurity shows the condition label `integrity_unavailable` in the decoy
  versus `clean` (`RaspSecurity.jsx:94`).

**Prevalence [AGENT].** The distinguisher exists only where the primary actually
reaches ALLOW. On Android devices where the #2276 pin posture already yields WARN,
both sets look alike.

**Fix (needs an owner decision).**
- Make an *unavailable* attestation leg neutral. Only a positive
  `attestationFailed:true` (or the session latch) escalates.
- The OS leg carries "unavailable" on its own.
- Test the whole chain in a deniability session against a primary session with the
  same device state.

### Carried HIGHs (09-14), all STILL PRESENT

- **H-5 — [WC] A refused request stays queued and can be approved again.** Its
  reachability has widened. **[AGENT]** [B-2; 09-14 H-3]
  - Every refusal throws after `rejectRequest`, but the request is removed only
    after the handler succeeds (`WalletConnectProvider.jsx:1102-1103`,
    `:1121-1122`, `:1218`, `:1221-1224`).
  - `approveBlocked` ignores `err` (`RequestApprovalModal.jsx:233-239`), and
    `WalletConnect.jsx:188-190` reopens the request.
  - New: the modal enables Approve for verdicts the signer always refuses (L-7). A
    TIP verdict can also differ between calls, so a retry after `TX_RISK_REJECTED`
    can sign after the dApp was told "rejected".
  - Fix: remove the request in a `finally`, add an answered-latch per (topic,id),
    and disable Approve once `err` is set.
- **H-6 — [Auth] Theft Protection never runs on the fast-path biometric unlock.**
  **[AGENT]** [D-C1; 09-14 H-2]
  - `WalletProvider.unlockBiometricOnly` (`:2351-2400`) sets the session unlocked
    with no `runTheftProtectionGate`.
  - The keystore gate matrix (`native.js:1299-1328`) has no TP check either.
- **H-7 — [Auth · I4] Theft Protection's "biometric" accepts the device passcode.**
  Its scope has widened. **[AGENT]** [D-C2; 09-14 H-4]
  - `biometric.js:159-162` and `:167-168` fall back to the passcode, and
    `androidBiometryStrength` is never set.
  - New: the #2696 step-ups (turn TP off, loosen a limit) use this same gate, so a
    passcode now authorises them too.
- **H-8 — [RASP · availability] Theft Protection turns WARN into an unlock refusal,
  and #2696 now also closes the in-app off-switch.** **[AGENT]** [A-4; 09-14 H-5]
  - `theftProtection.js:176-182` still refuses anything that is not ALLOW.
  - `TheftProtectionSettings.jsx:164-167` now runs the same gate before TP can be
    turned off. The #2515 escape hatch covers only `supported === false`.
  - A persistent WARN (developer mode, accessibility service, third-party keyboard,
    offline attestation) leaves reinstall plus seed restore as the only way out.
  - Fix as on 09-14: refuse only on BLOCK, use the local-only leg, and exempt TP-off
    from the RASP tier while keeping the biometric.
- **H-9 — [RASP · I3/I2] Theft Protection composes remote attestation into unlock,
  primary set only.** **[AGENT]** [09-14 H-1]
  - `theftProtection.js:33`, `:163`, `:176` are called at `WalletProvider.jsx:1967`.
  - It is now also run on TP-off and limit-raise (`TheftProtectionSettings.jsx:167`,
    `:251`).
  - H-2 generalises this oracle to all users.

---

## MEDIUM

### M-1 — [RASP · I4] The #2731 "M9" fix does not block signing: `'sign'` in `blockedActions` is read by no signing chokepoint — **[VERIFIED]** · NEW [A-3]

**Where.**
- `degrade.js:226` appends `'sign'` on native INTEGRITY_UNAVAILABLE, but the tier
  stays WARN.
- `composeGate` and `presignGate` read only the tier (`compose.js:64-75`,
  `presign.js:44-53`).

**Effect.**
- SendCrypto, WC and CryptoSigning never read `blockedActions`. The only `'sign'`
  consumer is `sensitiveGate` on the TokenApprovals *revoke* path (`:154`, `:165`).
  So a muted RaspIntegrity plugin still lets Send proceed after ack plus biometric,
  while a defensive revoke is hard-blocked. The protection is inverted.
- The M9 comment's premise ("unavailable means the plugin call itself failed") is
  wrong. INTEGRITY_UNAVAILABLE also comes from the attestation leg: offline, a
  sideloaded build, or the #2276 pin miss.
- The tests pass only because jsdom is non-native (`degrade.test.js:86`,
  `g4-warn-sensitive-gate.test.js:82`).

**Fix.**
- Split the condition into OS-probe-unavailable (native; a real sign block that the
  gate reads) and attestation-unavailable (neutral, per H-4).
- Add a native-mocked chokepoint test.
- Do *not* simply map INTEGRITY_UNAVAILABLE → BLOCK. That is H-8 at Send scale.

### M-2 — [WC] Approval-granting calldata outside the decoded and opaque selector sets is scored "not an approval" and signs with no Approval row — **[AGENT]** · NEW, gap in #2731/#2740 [B-3]

**Where.**
- An unknown selector yields `{isApprove:false}` (`src/risk/calldata.js:96-105`).
- S2, S3 and S7 then score OK, and the modal's Approval row renders only when
  `isApprove` is true (`RequestApprovalModal.jsx:459-460`).

**Shapes that slip through.** Selector values are [AGENT]:
- Compound v3 `allow(address,bool)`;
- Aave `approveDelegation(address,uint256)`;
- ERC-777 `authorizeOperator(address)`;
- `approveAndCall`;
- legacy `increaseApproval`.

**Fix.**
- Add these to `OPAQUE_APPROVAL_KINDS`, or decode them.
- Longer term: treat non-transfer calldata to a never-seen contract as CAUTION on WC.

### M-3 — [KEK] v3 reseal branches drop the new `kekKdf` and keep the old stamp, so the vault is bricked after a PIN change once `AAD_V3_MIGRATION_ENABLED` flips — **[AGENT]** · latent (flag is `false`, `vault.js:323`) · NEW [C-1]

**Where.**
- `encryptVaultWithDekV3` (`vault.js:676-713`) returns a blob without `kekKdf`.
- The five v3 rewrap sites write `{ ...blob, ...sealed }`, so the *old* stamp
  survives while the new C is derived at profile[0]. The sites are
  `native.js:1160-1167`, `:1678-1684`, `:1780-1787`, and `web.js:784-792`,
  `:932-936`.

**Effect.** A vault stamped `[1]` then has its PIN changed. The correct new PIN fails
`KEK_UNWRAP_FAILED`, which counts toward the panic wipe.

**Sibling.** The AAD-v3 migration write drops a just-written stamp (`native.js:791`
→ `:822`; `web.js:539` → `:555`), but it self-heals.

**Fix.** Carry `kekKdf` through `encryptVaultWithDekV3`. Add the test "stamped [1] →
v3 → changePassword → unlock with new PIN". This **must land before the Phase 0b
flag flip.**

### M-4 — [Auth] Kill-before-count window on the H-3 cohort lets an attacker dodge the 10-miss wipe and the backoff — **[AGENT]** · NEW [D-2]

**Where.**
- A miss is counted only after `unlock()` throws (`WalletEntry.jsx:1200-1206`).
- On an H-3 vault, a success renders about two Argon2id runs before a miss would be
  counted.

**Failure scenario.** No dashboard appears at success time, so the attacker
force-quits before `localStorage.setItem`. Each guess still needs the hardware
factor prompt, which H-7 lets the device passcode satisfy.

**Fix.**
- Fix H-3.
- Pre-increment the attempt counter before `unlock()`, and roll it back on success or
  on a classified non-PIN error.

### M-5 — [Auth · design tension] A successful duress or hidden unlock resets the wrong-PIN counter, so a coercer who holds the decoy PIN gets unlimited guesses at the real PIN — **[VERIFIED]** · NEW [D-3]

**Where.** `clearPinAttempts()` runs after any non-throwing unlock, including decoy
(`WalletEntry.jsx:1086-1089`). This is intended per `pinAttemptGuard.js:19-22`.

**Failure scenario.** The coercer makes six guesses (below the 5-minute tier), enters
the surrendered duress PIN, locks, and repeats. The 10-miss wipe never fires.

**Trade-off.** Not resetting would itself reveal the decoy.

**Owner decision needed.** Either keep a silent real-PIN miss counter that a
decoy/hidden success does not clear, with a higher threshold, or record this as a
disclosed residual.

### M-6 — [Auth · I3] Settings replaces the whole security block with a one-line placeholder in a decoy session — **[VERIFIED]** · NEW [D-4]

**Where.** `Settings.jsx:425-431` renders "Security settings are managed from your
unlocked wallet." in place of the Biometric, Theft Protection, Passkey, 2FA and KEK
controls.

**Why it matters.** Anyone who knows the app's normal Settings, or who has seen a
store screenshot, can spot the decoy. The sentence also contradicts itself inside a
visibly unlocked wallet. Hiding the block closes a write-side leak but opens a
read-side tell.

**Fix.** Render the same controls in a decoy, backed by in-memory non-persisted
state. The setters are already I3 no-ops.

### M-7 — [iOS · secrets in logs] A `QA-INSTRUMENT-TEMP: remove before commit` block ships in 1.0.2 and NSLogs every incoming URL in full — **[VERIFIED]** · NEW, out of surface [A-6]

**Where.** `ios/App/App/SceneDelegate.swift:67-73`, landed in `d4af8d9d` (#2751).

**What gets logged.** Every URL is written to the unified log before the allowlist
decision, including rejected ones:
- `veyrnox://wc?uri=wc:…&symKey=…`, which is the WalletConnect pairing symmetric key;
- referral links;
- Transak return URLs.

This violates the CLAUDE.md rule "never log … keys". The unified log is readable via
sysdiagnose / Console with device access.

**Fix.** Delete the block. Add a CI grep for `QA-INSTRUMENT-TEMP` under `ios/` and
`android/`.

### Carried MEDIUMs (09-14)

| 09-14 | Status | Evidence |
|---|---|---|
| **M-1** Android biometric-cache storage alias not auth-bound | **STILL PRESENT** **[AGENT]** | `AndroidBiometricCachePlugin.kt:527-533` (`requiresAuth = false`), `getSecret` `:99-121`; `REQUIRES_USER_AUTH_LEGACY` has no production reader |
| **M-4** TP prompts only on primary unlock (distinguishes real from decoy) | **STILL PRESENT, WORSE** **[AGENT]** | `WalletProvider.jsx:1960-1967`. #2680 seeds an enabled $500 per-tx row when TP is on; a decoy sends over $500 with no prompt and an empty limits list (`SendCrypto.jsx:636-643`, `SecurityCenter.jsx:140-144`) |
| **M-5** Over-limit WC send cleared by a generic biometric; the modal never shows the cap breach | **STILL PRESENT** **[AGENT]** | `WalletConnectProvider.jsx:676-690`; now reached more often because of the seeded $500 cap |
| **M-6** Daily cap ignores WC sends | **STILL PRESENT** **[AGENT]** | `txLimits.js:67-77` counts only `type:'send'`; WC broadcast `:717-806` records nothing |
| **M-7** A stalled bridge bypasses both session latches | **STILL PRESENT** **[AGENT]** | Outer timeout `getFreshRaspArtifact.js:88-95`; latch inside the un-timed source (`nativeProbe.js:81`, `attestation.js:258-291`); tests mock the whole source. #2731 M9 does not close it |
| **M-8** Fast-path populate/read composes attestation on unlock | **STILL PRESENT** **[AGENT]** | `native.js:645`, `:1328`. The duress marker is set only by `DuressPin.jsx:270` |

---

## LOW

- **L-1 — [RASP] PersonalBackup restore panels mount a full-attestation artifact.**
  **[AGENT]** [A-5]
  - `PersonalBackup.jsx:517`, `:776` call `useRaspArtifact()` without
    `excludeAttestation`, contrary to the 2026-07-16 owner decision.
  - The mount-time `'export'` gate then refuses a restore from shares on an
    offline or sideloaded device.
  - Fix: `excludeAttestation: true`.
- **L-2 — [iOS] Cold-launch URLs may bypass the deep-link allowlist.** **[AGENT]**
  [A-7]
  - `SceneDelegate.swift:53-57` forwards `connectionOptions` to
    `SceneDelegateProxy` unfiltered. `isAllowedDeepLink` is applied only in
    `openURLContexts` (`:66`) and `continue` (`:78-83`).
  - The Capacitor source was not available to confirm the behaviour.
- **L-3 — [iOS] The storyboard instantiates the bridge view controller before the
  RASP block decision.** **[AGENT]** [A-8]
  - `Info.plist:76-77` sets `UISceneStoryboardFile=Main`.
  - `SceneDelegate.swift:128-130` says instantiating it is what the gate exists to
    prevent.
  - Fix: build the Capacitor window in code on the non-blocked path.
- **L-4 — [KEK · Auth] An Argon2id OOM on the unlock path counts as a wrong PIN
  toward the wipe, and the 192 MiB walk adds exposure.** **[AGENT]** [C-3, D-5]
  - `kekProfiles.js:102-105` rethrows the uncoded error, which reaches
    `registerFailedPinAttempt` (`WalletEntry.jsx:1200`).
  - It is the unlock-side sibling of 09-14 L-3.
  - Fix: a stable `KDF_OOM`-style code, exempt from the counter.
- **L-5 — [KEK] A tampered or out-of-set `kekKdf` stamp throws an uncoded error that
  counts as a wrong PIN.** **[AGENT]** [C-4]
  - `kekProfiles.js:55`.
  - Fix: throw with a `MALFORMED_VAULT` code, and optionally fall back to the full
    walk when a stamped attempt fails.
- **L-6 — [WC] The literal-`to` check (#2731 M4) runs after the TP biometric and the
  tip-screen egress, and never answers the dApp.** **[AGENT]** [B-4]
  - `WalletConnectProvider.jsx:710-715` throws `WC_SEND_INVALID_TO` without
    `rejectRequest`.
  - Fix: move the check pre-modal and to the top of the handler, with a reject.
- **L-7 — [WC] WC risk inputs never receive the address corpus.** **[AGENT]** [B-5]
  - `buildRiskInputsFromWcRequest` is called without
    `history`/`knownAddresses`/`whitelist` (`walletConnectIntel.js:131-135`).
  - As a result S4 (address poisoning) is always OK on WC. S3 is always RISK for a
    bounded approval, so the modal offers an ack that the signer always refuses.
  - The 09-14 PASS list over-stated S4 as live on WC.
- **L-8 — [WC] Per-request expiry is never enforced.** **[AGENT]** [B-6]
  - `session_request_expire` is filtered by `topic` (`WalletConnectProvider.jsx:991-993`)
    on a payload that carries only `{id}`.
  - `expiryTimestamp` is never checked at sign time.
- **L-9 — [WC] The spend cap values only `transfer`/`transferFrom` and native
  `value`.** **[AGENT]** [B-7]
  - `resolveWcSpendAmount` (`WalletConnectProvider.jsx:302-336`).
  - A router swap using an existing allowance moves value at "$0" against the cap.
- **L-10 — [Auth] The plaintext unlock PIN is kept in `sessionUnlockSecretRef` for
  the whole session and nothing reads it.** **[VERIFIED]** [D-7]
  - Written at `WalletProvider.jsx:1111`, `:1164`, `:1713`, `:2097`.
  - `grep -F` finds only writes, nulling assignments and a comment.
  - Fix: delete the ref.
- **L-11 — [Auth] Background triggers use up copySecret's wipe retry budget.**
  **[AGENT]** [D-8]
  - `copySecret.js:106-117` counts `hidden`/`blur` attempts, which are expected to
    fail, against `MAX_WIPE_ATTEMPTS = 8`.
  - Once the budget is gone, cleanup drops the lock-event retry.
  - [AGENT] WebKit may reject a timer-driven `writeText`.
- **L-12 — [Auth · Buy — OWNER-ONLY, report only] The 15-min lock-suppression cap
  is a JS timer, so it does not bound suspended-app time.** **[AGENT]** [D-6]
  - `BuyCrypto.jsx:158`. There is no wall-clock deadline check on resume.
  - The manual-lock cancel, the absence of any deep-link/dApp trigger, and the decoy
    exclusion were all checked and hold.
- **L-13 — [Auth] The fast-path read side has no passkey check.** **[AGENT]** [D-9]
  - Populate checks the passkey (`native.js:643`), but `unlockBiometricOnly`
    (`:1299-1400`) does not.
  - The clear on passkey registration is fire-and-forget (`passkey.js:119-133`).
  - Fix: add a read-side gate beside the duress one.
- **L-14 — [RASP/KEK] Stale comments that describe open holes as closed.**
  **[AGENT]** [A-9, C-6; carries 09-14 L-9]
  - `attestation.js:26-29` ("NEVER ON UNLOCK": false, see H-2/H-9/M-8).
  - `getFreshRaspArtifact.js:35-38` and `nativeProbe.js:91-92` (stall "closed": see
    carried M-7).
  - `degrade.js:126-132` (signing "blocked": see M-1).
  - `detect.js:16-22` and `sensitiveGate.js:5-9`.
  - `vault.js:758` points at `kek.js` for `unwrapDekWithProfiles`; it lives in
    `kekProfiles.js`.
  - All the 09-14 L-9 items remain as well: `HardwareKekPlugin.m:471-472`, the
    `EnclaveKeyService.swift` "NOT DEVICE-VERIFIED" headers, "OFF by default", the
    fixed-salt claim, and the dead `KEY_PERMANENTLY_INVALIDATED` branches.

### Carried LOWs (09-14)

| 09-14 | Status |
|---|---|
| **L-1** TP refusal leaves the decrypted container resident | **STILL PRESENT**: `containerRef.current` at `WalletProvider.jsx:1938`, before the gate at `:1967` |
| **L-2** TP one-shot token not consumed on the Digital Shield path | **STILL PRESENT**: `SendCrypto.jsx:837` deps, `:1880` |
| **L-3** Step-up OOM counted as a wrong PIN | **STILL PRESENT**: `credentialVerifier.js:128-133`. Unlock-side sibling: L-4 |
| **L-4** Unparseable fee skips the WC fee ceiling | **STILL PRESENT**: `WalletConnectProvider.jsx:738-760` |
| **L-5** SafeTx / `address[]` escape the typed-data backstop | **STILL PRESENT, subsumed and escalated** into H-1 |
| **L-6** No RASP gate on KEK `enroll`/`clearCredential` | **STILL PRESENT**: `HardwareKekPlugin.kt:126-176`, `:279-290`; `HardwareKekPlugin.m:278-294` |
| **L-7** Plaintext H/DEK residue (write side) | **STILL PRESENT**: `HardwareKekPlugin.m:209`, `:477`; `AndroidBiometricCachePlugin.kt:642` |
| **L-8** Web fresh RASP artifact can never be ALLOW | **STILL PRESENT**: `getFreshRaspArtifact.js:92-100` |
| **L-9** Stale comments | **STILL PRESENT**, extended: L-14 |
| **INFO** `handleSendTransaction` deps omit `isDecoy`/`isHidden` | **STILL PRESENT** (mitigated): `WalletConnectProvider.jsx:1219` |

---

## Status vs prior audit (2026-09-14)

| Prior | Status |
|---|---|
| **H-1** TP runs attestation on unlock, primary only | **STILL PRESENT** (H-9); generalised to all users by H-2 |
| **H-2** TP skipped on the fast-path biometric unlock | **STILL PRESENT** (H-6) |
| **H-3** Refused WC request stays queued | **STILL PRESENT**, reachability widened (H-5) |
| **H-4** TP "biometric" accepts the passcode | **STILL PRESENT**, now also governs the #2696 step-ups (H-7) |
| **H-5** TP turns WARN into an unlock refusal | **STILL PRESENT, WIDENED**: #2696 closed the off-switch (H-8) |
| **M-1** Android storage alias not auth-bound | **STILL PRESENT** |
| **M-2** Import-time migration re-enables Biometric Unlock | **FIXED** by `56126fb7` (`fastpathUnlock.js:117-132`) |
| **M-3** TP / limits switchable off with no step-up | **FIXED** by `80acddf9`. Residual: the step-up is H-7's passcode-accepting gate |
| **M-4** TP prompts only on primary unlock | **STILL PRESENT, WORSE** (seeded $500 cap) |
| **M-5** Over-limit WC send / generic biometric | **STILL PRESENT** |
| **M-6** Daily cap ignores WC | **STILL PRESENT** |
| **M-7** Stalled bridge bypasses latches | **STILL PRESENT**. #2731 M9 does not close it, and M-1 shows M9 is itself inert on the sign path |
| **M-8** Fast-path attestation on unlock | **STILL PRESENT** |
| **L-1 … L-9** | All **STILL PRESENT**; L-5 escalated into H-1 (see the carried-LOW table) |
| iOS re-sign tamper not detected (2026-07-14 MEDIUM) | **STILL PRESENT, disclosed** (`RaspIntegrityPlugin.m:39-41`, `:500-506`) |
| #2276 Play Integrity pin posture | Unchanged: WARN, accepted residual. TP still converts it into a lockout (H-8) |

**Summary.**
- 2 of 5 prior MEDIUMs were fixed (M-2, M-3). No prior HIGH was fixed.
- One HIGH regression came from a remediation commit (H-3, `2e17c655`), and one
  claimed fix is inert on the path it names (M-1, `2e17c655` M9).
- Two prior HIGHs were widened by later commits (H-7 and H-8, both by `80acddf9`).

### INFO — provenance of the 2026-09-21 audit

`2e17c655` / #2731 describe their source as "the independent security audit of
2026-09-21 (4 HIGH, 10 MEDIUM, 13 LOW, 8 INFO)". No report for that audit is
checked in under `docs/`, and CLAUDE.md still records the independent third-party
audit of the full stack as **outstanding**. Those two statements need reconciling:
either check in the report and its provenance, or correct the PR/commit wording.
This audit does not treat #2731 as independent verification of anything.

---

## INFO / PASS — controls confirmed working

**RASP** [A]
- `compose.js:64-75`, `:82-95`: an unknown RASP tier → BLOCK, an unknown tx level →
  CONFIRM, and BLOCK is never overridable. `presign.js:52-53`: only a clean ALLOW
  proceeds without an ack.
- `degrade.js:222`: an unknown condition → FAIL_CLOSED with the full sensitive set;
  monotonicity is intact.
- `detect.js:89-111`: `available !== true` or a partial shape →
  INTEGRITY_UNAVAILABLE, never CLEAN.
- Hard-signal latches arm only on a positive verdict and reset on app-lock
  (`nativeProbe.js:131-165`, `attestation.js:229-291`).
- The historic `gate.blocked` misread is not present: every WC, SendCrypto and
  CryptoSigning caller reads `proceedAllowed`, `signerReachable` or `decision`.
- Android: the release-cert guard fails the build on a blank or malformed cert
  (`build.gradle:366-380`), and the runtime check fails closed on a blank value.
  The probe canary rejects rather than returning a false clean.
- iOS: a matching canary; `earlyDetectTamper` fails closed on a `csops` failure;
  the pre-bridge `raspBlocked` verdict is enforced in `SceneDelegate.swift:48-51`.
- Seed, export and import surfaces use the local-only fresh probe (`SeedGrid.jsx:76`,
  `useRevealWithReauth.jsx:101`, `RestoreFromFile.jsx:266`, `PersonalBackup.jsx:138`).

**WalletConnect** [B]
- The pre-sign RASP+tx gate covers personal_sign, typed data, send and session
  approval. Its timeout fails closed, a detection throw or missing tier → BLOCK, and
  WC never passes an ack.
- Signing and session approval are covered by:
  - M11 expiry and step-up at every signing wrapper;
  - `from` and signer address binding;
  - chain binding against the live session store, pre-modal and at sign time;
  - the VULN-19 RPC chainId check.
- The following are blocked: v1/v3 typed data, `eth_sign`, `eth_signTransaction`,
  and add/switch chain. Only 3 methods are advertised, and a domainless typed
  payload is rejected.
- H-4 primaryType graph reconciliation holds, and all 6 Permit2 types score RISK.
- #2731 decodes approve, increaseAllowance, setApprovalForAll and Permit2 approve
  correctly, and the modal renders them. #2740 treats multicall/permit wrappers as
  opaque and fails closed. #2743 wires S7.
- An unreadable cap or unvalued token is a hard reject that TP cannot clear.
- The known-bad dApp check applies to all tiers, and a Reown Verify scam/INVALID
  result is refused.
- I3: the relay is torn down in decoy/hidden/demo.

**Hardware KEK** [C]
- I6 holds: ordered H‖C with HKDF under the fixed domain, length and all-zero input
  are rejected, and inputs are zeroed in `finally` (`kek.js:216-285`).
- The `kekProfiles.js` loop zeroes per-attempt H/C/KEK and the caller's H on every
  exit. The stamp is bounded to the shipped profile set before any allocation, and it
  cannot weaken C (C must match the GCM-authenticated wrap).
- One `unlock()` counts one wrong PIN however many profiles it walked.
- Android KEK key: `setInvalidatedByBiometricEnrollment(true)`, BIOMETRIC_STRONG
  only, a CryptoObject on every use, no DEVICE_CREDENTIAL. StrongBox is preferred
  with an honest TEE fallback, the real `KeyInfo` tier is reported, and JS refuses
  SOFTWARE.
- iOS: the SE P-256 key uses `BiometryCurrentSet`, and a failed store rolls back.
  The `SecureEnclave` label is honest.
- Fast-path DEK: blocked in decoy/demo, with duress configured, before disclosure,
  and at any non-ALLOW tier, on both read and write.

**Auth gates** [D]
- `constantTimeEqual` compares the full length. An absent verifier is reported as
  `bricked`, and `twoFactorGate` fails closed with one opaque `WRONG`.
- The unlock equalizer is correct for stamped and non-KEK vaults (see H-3 for the
  exception).
- PIN guard: backoff is checked before an attempt is spent, the session floor is a
  monotonic max, and TP, biometric, KEK-hardware, cancel and malformed-vault errors
  are not counted as wrong PINs.
- `lock()` overwrites seeds, zeroes the verifier, bumps generations, cancels Buy
  suppression, dispatches `APP_LOCK_EVENT` and clears every timer. The 8-hour
  ceiling holds regardless of the idle setting.
- Buy suppression: `lock()` cancels it, there is no deep-link or dApp trigger, the
  page returns null in deniability, and a missing timer is refused.
- #2696 step-ups cover TP-off, and loosening, editing or deleting a limit. Create
  paths can only tighten.
- Panic wipe: the biometric pref is written before the sweep, and the unlock-secret
  cache and notifications are cleared.

---

## Suggested fix order (for the owner; nothing here was changed)

1. **H-1** (live drain vector on mainnet WC) and **M-7** (a one-line delete that
   removes key material from device logs).
2. **H-3**: stamp on any unstamped success. This also closes **M-4**.
3. **H-2**: opt-outs on the display surfaces, plus a structural pin.
4. **H-4**, **M-1**, **H-8**: owner decision on how the attestation-unavailable leg
   is weighted, then one change covering all three.
5. **M-3** before any `AAD_V3_MIGRATION_ENABLED` flip.

---

*INTERNAL audit. Not the outstanding independent third-party audit. Nothing in this
report is device-verified, and no status tag advances on it.*
