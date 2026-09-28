# Audit Findings Tracker
Last updated: 2026-09-28
Analysed against: origin/main @ `b3a8c58ca7df704c439cbd12bbbb818c21208eeb`
(clean branch worktree cut from `origin/main` per Step 0 — not the live checkout,
not a `git show` fallback. macOS/zsh.)

> Automated weekly synthesis of every finding across the audit corpus, checked against a
> **pinned snapshot of `origin/main`**. **Static analysis only.** "FIXED" means the code
> change is present on `main` — it does **not** mean the control is verified working
> on-device, on-chain, or against a live backend. Rows tagged `(grep)` were re-verified
> against source this run; rows tagged `(doc)` carry the status recorded in an audit doc or
> PR history and were not independently re-checked.

## Window since last run

Previous run analysed `cc1cc4eb` (2026-09-21). `main` has moved **70 commits** since (all
non-merge). This is the biggest single-window jump in this tracker's history: a new **weekly
internal audit landed this window** (2026-09-28, PR #2777, merged 06:51 UTC today — inside
the pin), the first in two weeks (the 09-21 weekly this tracker expected never appeared as a
doc; #2731's commit message cites "the independent security audit of 2026-09-21" but no
report for it is checked in — the 09-28 audit itself flags this contradiction as unresolved
INFO). Five daily diffs also landed (`diff-2026-09-21.md` … `diff-2026-09-24.md`,
`diff-2026-09-27.md`; no report for 09-25/09-26).

## Sources synthesised

Carried from prior runs, unchanged: the 06-26 through 09-14 corpus, `docs/audit-triage/`
(29 files), `docs/security-audits/` (11 files), `docs/honesty-check-2026-08-31.md`,
`docs/audit-gemini-sweep-2026-09-13.md`.

**New this run:**

- **`docs/audit-2026-09-28-weekly.md`** — the first full weekly internal audit since 09-14.
  Four specialist agents on RASP / WalletConnect / Hardware KEK / Auth gates, pinned to
  `e92d72db` (an ancestor of the 1.0.2 live build commits). **4 new HIGH, 5 carried HIGH
  (all STILL PRESENT), 7 new MEDIUM, 6 carried MEDIUM, 14 new LOW, 10 carried LOW.** One of
  the new HIGHs is a regression from last week's own audit-remediation commit (#2731).
- **`docs/security-diffs/diff-2026-09-21.md` … `diff-2026-09-24.md`, `diff-2026-09-27.md`**
  — 5 daily scans. One regression found and fixed within the window (dormancy-reminder
  panic residue); one regression found and **not yet fixed or filed** (iOS SceneDelegate
  NSLog of the WalletConnect pairing key — independently re-confirmed by the weekly audit
  as M-7). No report for 09-25/09-26 — the scan's own "missed-run gap" note proposes
  computing the window from the last `diff-*.md` on `main` rather than a fixed 24h; not
  applied yet.
- **Issues filed in-window**: #2739/#2741 (WC calldata scoring gaps — both fixed same day),
  #2713 (chaff-provisioning wipe race — fixed in code by #2725, **issue still open on
  GitHub**), #2714/#2715 (iOS CI test-validity gaps), #2749/#2750 (Play/R8 build hygiene,
  non-security), #2639 (referral pending-code overwrite, carried, still open). **No issue
  was filed for anything in the 09-28 weekly audit** (checked: no issue after #2750 as of
  this pin) — the fourth consecutive audit whose findings entered only as a doc.
- No new files in `docs/audit-triage/`, `docs/security-audits/`, or
  `docs/dependency-audits/` this window. (A same-day dependency-audit scheduled-task run
  is recorded in session context as flagging an untracked `stream-json` CVE, but nothing
  under `docs/dependency-audits/` reflects it at this pin — not counted below.)

## Summary

- Total findings catalogued: **~390** (dedup across the corpus; MEDIUM/LOW grouped — the
  count is approximate by construction and the delta matters more than the absolute)
- Fixed (code-confirmed): **~308** — **11 closed this run**: 2 carried opens from the 09-14
  weekly (M-2, M-3) plus 9 found *and* fixed inside this single window (dormancy-notification
  panic residue, two WC calldata-scoring gaps, session-revocation lock-on-self-revoke,
  two panic-residue sweeps, printed-seed DOM residue, a long-carried decoy-read leak
  (`GEM-0913-NEWS`), and the `process.version` regression that has sat unfiled since 09-11)
- Still open / accepted-residual: **~85** — up sharply. **25 new findings** from the 09-28
  weekly audit (4 HIGH, 7 MEDIUM, 14 LOW) against 3 closures from the standing corpus
- **Regressed: 2** — unchanged count, but the *composition* changed: the `process.version`
  regression closed (see Fixed); a **new** regression opened in its place — last week's own
  audit-remediation commit (#2731) broke the unlock-timing equalizer for a whole vault
  cohort (09-28 H-3). The WC refused-request-stays-queued regression is now in its **third**
  week unfiled (09-14 H-3 → 09-28 H-5)
- Needs on-device / on-chain / live-backend verification: **~34** (three new: the KEK-stamp
  regression's timing magnitude, the RASP primary/decoy tier-diff's device prevalence, and
  the dashboard-attestation heartbeat's Android egress volume — all explicitly [AGENT] in
  the source audit)

**The headline is a new audit surfaced four new HIGHs in code this tracker had never seen,
and one of them exists because last week's audit-remediation commit introduced it.** #2731
(2026-09-21, "remediate all findings") fixed a real vault-bricking bug in the KEK
profile-fallback walk, but the stamp-on-success logic it added only fires when a legacy
fallback actually ran — so every vault enrolled at the *current* profile during a four-week
window is silently never stamped, and every unlock on it now pays (or dodges) an extra
Argon2id cost that a stamped vault does not. That is the same real/decoy timing-oracle shape
the 09-14 audit already flagged (then as H-1), reopened by the commit that was supposed to
be fixing other things. Two structurally similar stories repeat from prior weeks: a
fail-closed-looking `blockedActions` change (`'sign'` appended on RASP degrade) that no
signing chokepoint actually reads, so the "fix" changes nothing on the path it names; and a
debug `NSLog` block marked "remove before commit" that shipped anyway and writes the
WalletConnect pairing symmetric key to the iOS unified log — found by the daily scan on
09-24, still unfiled four days later, and independently re-found by the weekly audit as M-7.

---

## What changed this run

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

All re-verified at `b3a8c58c` this run (grep), no drift found beyond what the last three
runs already corrected:

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
| `H10: pinning.js placeholders` | Still **16** `PLACEHOLDER_*_REPLACE_ON_DEVICE` entries — **open**, unchanged count (grep) |
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
the rest). Three new items from the 09-28 weekly audit:

| ID | Finding | Why verification is needed |
|---|---|---|
| **09-28 H-3 timing magnitude** | **New.** The extra unlock cost for an unstamped current-profile vault is "likely seconds on a mid-range phone" per the audit — not benchmarked. Needs an actual timed unlock on a real device with a vault enrolled in the affected window (2026-08-24 → 2026-09-21) |
| **09-28 H-4 prevalence** | **New.** The primary/decoy RASP-tier distinguisher exists only where a primary device actually reaches ALLOW. On devices where #2276's pin posture already yields WARN for everyone, both sets look alike — device population data would settle how exposed this really is |
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
