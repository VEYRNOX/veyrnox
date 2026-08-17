# Audit Findings Tracker
Last updated: 2026-08-17 (amended same day — see the C-3 amendment)
Analysed against: origin/main @ `470ff315d755e1d30d35a72b2bdbb5659be93927`
(clean branch worktree cut from `origin/main` per Step 0 — not the live checkout,
not a `git show` fallback.)

**Amended 2026-08-17 after publication**, at `c4bf73a6`. Two changes, both confined to
C-3: the 2026-08-17 weekly (`ba27d76a`) landed *after* the pin above and re-raises C-3 as
**L-10**, making it the fifth consecutive audit rather than the fourth; and PR #1891
partially closed it. The analysis body is otherwise left as the point-in-time record it
was — amendments are marked, not silently reworded.

> Automated weekly synthesis of every finding across the audit corpus, checked against a
> **pinned snapshot of `origin/main`**. **Static analysis only.** "FIXED" means the code
> change is present on `main` — it does **not** mean the control is verified working
> on-device, on-chain, or against a live backend. Rows tagged `(grep)` were re-verified
> against source this run; rows tagged `(doc)` carry the status recorded in an audit doc or
> PR history and were not independently re-checked.

## Window since last run

Previous run analysed `f1389c91` (2026-07-28). `main` has moved **427 commits** in 20 days
— the largest window this tracker has ever covered, and the first with a multi-day gap in
its own coverage. Three new source classes landed in it.

## Sources synthesised

Carried from prior runs (unchanged): `audit-2026-06-26`, `audit-2026-06-27` (×2),
`audit-2026-06-28`, `audit-2026-07-01-kek-internal`, `audit-2026-07-04-internal`,
`audit-2026-07-05-deniability-internal`, `audit-2026-07-14-weekly`,
`audit-2026-07-15-rasp-multi-tool-cycle`, `audit-2026-07-20-weekly`,
`audit-2026-07-23-branch-review`, PR #1262, the 2026-07-27 branch review, and
`docs/security-diffs/diff-2026-07-2*`.

**New this run:**

- **`docs/audit-2026-07-28-internal.md`** — the 28-finding ECC-methodology internal wave
  (1 critical, 5 high, 11 medium, 10 low, 1 info). **This file was never in the tracker's
  source list**, although its outcomes were partly reflected via `CLAUDE.md`. Folding it in
  is a scope correction, not new analysis. Plus `audit-2026-07-28-consolidations.md`.
- **`docs/audit-2026-08-03-weekly.md`** — H-1…H-7, M-1…M-7, L-1…L-5, plus C-1…C-7 carried
  forward from earlier weeklies under new labels. Two surfaces audited for the first time:
  **TIP threat-intelligence egress** and **Shamir 2-of-3 DEK sharding**.
- **`docs/security-diffs/`** — nine new reports: `07-30` (+run 2), `07-31`, `08-07`
  (+ run 2 + a backlog catch-up), `08-08`, `08-09`, `08-15`, `08-16`.
- `docs/dependency-audits/dep-audit-2026-08-15.md`.

- **`docs/audit-2026-08-17-weekly.md`** — **NOT read by this run.** It merged at
  `ba27d76a`, after the `470ff315` pin and before this tracker's PR merged, so it was
  invisible to the analysis. Folded in only for C-3, which it carries as **L-10**. Its
  other findings (including L-9 and the INFO items on `PlayIntegrityPlugin` comment drift
  and `credentialVerifier` KDF doc drift) are **not** reflected anywhere below and are
  owed a pass by the next run.

Also scanned: `docs/audit-triage/` (26 files) and `docs/security-audits/` (11 files) — no
finding IDs beyond those already catalogued.

## Summary

- Total findings catalogued: **~216** (dedup across the docs above; MEDIUM/LOW grouped —
  the count is approximate by construction and the delta matters more than the absolute)
- Fixed (code-confirmed): **~169** — **46 closed this run**, of which **19 were
  re-verified by grep against the pinned snapshot** rather than taken from a doc
- Still open / accepted-residual: **~40**
- **Regressed: 0** currently. Two regressions occurred and were closed inside the window
  (`simulate.js` revert prediction; the `/api/*` CORS allowlist) — both recorded below
  rather than swept away
- Needs on-device / on-chain / live-backend verification: **24**

---

## What changed this run

### The three-consecutive-audit cluster finally moved — by one

`C-1` (iOS `getHardwareFactor` had no native RASP gate while Android did) had been carried
verbatim through three weeklies. **It is closed.** `ios/App/App/HardwareKekPlugin.m` now
imports `RaspIntegrityPlugin.h` and calls `[RaspIntegrityPlugin earlyCheck]` on **both**
`enroll` (`:92`) and `getHardwareFactor` (`:279`), rejecting `RASP_BLOCK` (grep). PR #1765,
part of the 2026-08-15 Codex remediation wave.

**Its three siblings did not move and are now on their fourth consecutive audit** — C-3
(Android raw H never zeroed), C-4 (iOS enroll `NSData` immutable), C-5 (WC flagged-dApp
gate display-only). The 2026-08-03 audit's own recommendation stands and is repeated here:
**fix them or move them to a documented accepted-residual list**, because a finding that
recurs unchanged four times is no longer telling anyone anything.

> **Amendment, 2026-08-17 (post-publication) — two corrections to the paragraph above.**
>
> **1. It was the fifth audit, not the fourth.** This run pinned `470ff315`, and
> `docs/audit-2026-08-17-weekly.md` merged at `ba27d76a` — *after* that pin but *before*
> this tracker's own PR merged. So the weekly was invisible to the analysis and absent
> from the source list. It re-raises C-3 as **L-10** ("Android raw HMAC output (factor H)
> is still never zeroed — LIVE (carried, prior C-3)", `:403`). The pin is disclosed in the
> header and the count was honest given what was read; it was still wrong. **A same-day
> audit doc can land between the pin and the merge — check for one before publishing.**
>
> **2. C-3 / L-10 is now PARTIALLY closed** by **PR #1891** (`c4bf73a6`, merged
> 2026-08-17T16:50Z). Raw H is zeroed; the unzeroable `String` copy is not. Detail in the
> Still Open table below — the row is **kept**, not deleted, because the finding is not
> fully closed and deleting it would overstate the fix.
>
> C-4 and C-5 are untouched by that PR and remain on their fifth audit.

### Two REGRESSIONS opened and closed inside the window

Neither is live on `main`, and both are recorded because "it was fixed the same day" and
"it never happened" are different facts.

| Finding | What broke | Resolution |
|---|---|---|
| **`simulate.js` `willRevert` dead** (`21df6ad9` #1588) | An I4 honesty fix removed the `willRevert = true` assignment entirely, so the `high`-severity "predicted to FAIL" path became unreachable and `noKnownRisks` could read true for a transaction that was never simulated | `25fade75` (#1597) |
| **`/api/*` CORS allowlist wildcard** (`e99dd422` #1566) | `allowed.find(o => origin === o \|\| origin.endsWith('.pages.dev'))` — the second clause never references `o`, so **any** `*.pages.dev` origin was reflected. `*.pages.dev` is a free self-service namespace | `d1dc45bf` (#1598) |

**The `simulate.js` case produced the most useful methodological result in the window, and
it is against the scan, not for it.** The 08-07 report diagnosed the defect correctly and
then prescribed two remedies that were both wrong: gating on `code === 'CALL_EXCEPTION'`
(ethers v6 raises that for an unreachable RPC too, so it would have reinstated the original
bug) and requiring `result.simulated` for `noKnownRisks` (BTC and SOL are `simulated:
false` **by design**, so it would have suppressed the clean state on every BTC/SOL
preview). **A finding can be right about the defect and wrong about the remedy.**
Diagnosis and prescription deserve separate confidence levels — this tracker's own `(grep)`
tag covers the first and says nothing about the second.

### Closed this run

**2026-08-03 weekly — 19 of 19 own-labelled findings closed, plus C-1.**

| ID | Sev | Finding | Closed by | Confirmed by |
|---|---|---|---|---|
| H-1 / L-4 | HIGH | Send gate never awaited the TIP verdict; `s9TipThreat` returned OK for "not answered yet". BTC/SOL blocked forever with sim on | #1554 | **grep**: `src/lib/riskGateReady.js` present, states readiness once for every applicable contributor |
| H-2 | HIGH | Clipboard seed wipe tore down the TTL timer and both listeners **before** the async write resolved — and the `onHide` trigger fires exactly when `writeText` rejects. Seed stayed on the OS clipboard indefinitely | #1548 (`8b09570d`) | (doc) + **grep**: `copySecret.js` retains `visibilitychange` (5 refs) |
| H-3 | HIGH | `confirmWalletBackup` wrote a decoy wallet's UUID into shared `veyrnox-wallet-meta` — a forensic tell surviving lock/relock | #1549 (`e11e00a5`) | (doc) |
| H-4 | HIGH | TIP HMAC signing secret read from a `VITE_`-prefixed var → would ship in the client bundle | #1557 | **grep**: `supabase/functions/tip-screen/index.ts` holds the signing path |
| H-5 | HIGH | Opt-in copy understated egress (omitted `from`, `valueWei`, and up to 20 `recentCounterparties`) | #1555 | (doc) — owner additionally **dropped** `recentCounterparties` |
| H-6 | HIGH | Shamir envelope CRC32-authenticated only; one held share forced a silent wrong-key reconstruction | #1552 (`9d37f016`) | (doc) — v2 envelope, domain-separated SHA-256 commitment inside `combine()` |
| H-7 | HIGH | WC transaction fee never displayed; a dApp could bill up to the per-chain cap on a "0 value" tx | #1551 (`3fb12228`) | (doc) |
| **M-1** | MED | `verifyingContract` computed for display and never rendered — user saw an attacker-chosen `domain.name` and never the contract being authorised | — | **grep**: `RequestApprovalModal.jsx:288-294`, `data-testid="wc-verifying-contract"` |
| **M-2** | MED | `unenrollKek` missed by the L-2 zeroization fix on both platforms | — | **grep**: `native.js:1511-1524`, salt decode + `getHardwareFactor` inside `try/finally`, comment cites M-2 |
| **M-3** | MED | Decoy/hidden unlock silently destroyed the real user's pending referral state | — | **grep**: `WalletProvider.jsx:2011` `if (!isPrimary) return;` before `clearPendingReferral()` |
| M-4 | MED | TIP response schema unvalidated; valid-JSON-wrong-shape read as "no threat" | #1555 (`e98fd300`) | (doc) |
| M-5 | MED | SecurityAdvisor was a second, undisclosed egress path for free-text user input | #1556 | **grep**: `src/lib/advisorConsent.js` present, separate from the telemetry answer |
| M-6 | MED | `advisorKnowledge.js` sold free TIP screening as a Safety Plus exclusive | #1555 | (doc) |
| M-7 | MED | Shamir GF arithmetic not constant-time, against its own spec's MUST | #1553 (`97750cbb`) | (doc) — tables deleted, masked fixed-iteration loop |
| **L-1** | LOW | `changePassword` decoded/generated salt before entering its `try/finally` | — | **grep**: `native.js:936` salt decode inside `try` |
| **L-3** | LOW | Four wallet-metadata mutators relied solely on UI-level gating | — | **grep**: `WalletProvider.jsx:1433`, `:1460` — `if (isDecoy \|\| isHidden) return;` |
| **L-5** | LOW | `Feature-Status.md` claimed Shamir SSS had no code after `shamir.js` shipped | — | **grep**: `Feature-Status.md:826` carries the correction, marked as a correction |
| **C-1** | MED | iOS `getHardwareFactor` had no native RASP gate (3 consecutive audits) | #1765 | **grep**: `HardwareKekPlugin.m:92`, `:279` |

**Daily-scan findings — 24 closed.**

| ID | Sev | Finding | Closed by | Confirmed by |
|---|---|---|---|---|
| DIFF-0807-SIM | REGRESSION | `willRevert` unreachable; un-simulated tx could read clean | `25fade75` (#1597) | (doc) + **grep**: `simulate.js` revert path live |
| DIFF-0807-CORS | REGRESSION | `/api/*` allowlist reflected any `*.pages.dev` origin | `d1dc45bf` (#1598) | (doc) — anchored regex + 16 tests, 4 mutation-verified |
| DIFF-0807-LOCALHOST | NEEDS-REVIEW | `http://localhost` re-added to `tip-screen` CORS, re-opening 07-28 L-9 | `0a69a6f9` (#1596) | (doc) |
| DIFF-0807-BUY | NEEDS-REVIEW | `/api/buy/session` unthrottled + echoed 300 chars of upstream error | `3e7d2efb` (#1605) | (doc) — 10/IP/60s, correlation id |
| DIFF-0807-SHAMIRDOC | NEEDS-REVIEW | `combine()` JSDoc contradicted the code in 4 places, each pointing at **undoing** H-6 or M-7 | `2e1a73ee` (#1604) | (doc) |
| DIFF-0807-DEPLOY | NEEDS-REVIEW | `github.ref == 'main' && 'true' \|\| 'true'` tautology + dead build var | `841c6cfa` (#1595) | (doc) |
| DIFF-0808-1 | NEEDS-REVIEW | `tip-chat` relayed 500 chars of upstream body under a self-declared `// TEMP DEBUG` | `6461b8eb` (#1628) | (doc) |
| DIFF-0808-2 | NEEDS-REVIEW | `tip-chat` header asserted a wiring that never existed | `c8a24b41` (#1629) | (doc) — header now `BUILT, NOT WIRED, NOT DEPLOYED`, test-pinned |
| **DIFF-0808-3** | NEEDS-REVIEW | Advisor chat moved to a direct, **credential-free** fetch at the TIP Worker | re-architected | **grep**: `SecurityAdvisor.jsx:602-610` fetches `TIP_CHAT_URL` = `${SUPABASE_URL}/functions/v1/tip-chat` with `apikey` + bearer; HMAC is applied server-side in the proxy |
| **DIFF-0808-4** | NEEDS-REVIEW | `vault:` `device_id` prefix as a client-supplied paid-tier entitlement | `cb67afad` (#1761) | **grep**: prefix stripped at the proxy (`tip-chat/index.ts`). **Repo state only — see Needs Verification** |
| DIFF-0808-5 | NEEDS-REVIEW | Unsanitised `revertReason` rendered inside the highest-severity signing warning | `796a255d` (#1633) | (doc) — 140-char cap, control chars stripped, decoded sources only |
| DIFF-0808-6 | NEEDS-REVIEW | `VITE_EDGE_BASE` absent from `ci.yml`, so the shipped AAB's `/api/*` calls all threw | `f0c45770` (#1626) | (doc) |
| DIFF-0808-7 | NEEDS-REVIEW | RPC proxy relayed PostgREST internals verbatim, now under `service_role` | `b24fe6f3` (#1630) | (doc) — split on author-written SQLSTATEs |
| **DIFF-0809-1** | NEEDS-REVIEW | IOC-cache screening **created** an IndexedDB inside a decoy session (presence-as-tell) | #1624 follow-up | **grep**: `localIocCache.js:103-104`, `:370` — `openDb({ createIfMissing: false })` on read paths |
| **DIFF-0809-2** | NEEDS-REVIEW | Manifest refresh gated at the call site, with the weaker predicate (demo sessions uncovered), under a comment claiming the gate was in the module | — | **grep**: `localIocCache.js:238` `isDeniabilityOrDemoActive()` inside the egress function; `WalletProvider.jsx:660-666` comment corrected **and marked as a correction** |
| **DIFF-0809-3** | NEEDS-REVIEW | Signed IOC manifest had no rollback protection and no size cap | — | **grep**: `MAX_MANIFEST_BYTES` (`:59`, enforced `:250` before parse); `generated_at` monotonic check `:291-294`, refusing a manifest with no usable timestamp |
| **DIFF-0809-4** | NEEDS-REVIEW | `enrollKek` was the one DEK-rotating path not clearing the fast-path DEK cache — failure mode was a **permanent lockout with the correct PIN** | — | **grep**: `native.js:1472` `await clearDekCache()` inside `enrollKek` (`:1408`), with the lockout reasoning inline |
| **DIFF-0809-5** | NEEDS-REVIEW | RPC proxy logged 500 chars of raw PostgREST body (could carry a `device_id`) | — | **grep**: `functions/api/rpc/[fn].js:192` records the removal; no `slice(0, 500)` remains |
| DIFF-0815 F-1 | NEEDS-REVIEW | Firebase Crashlytics + Performance in both production binaries; production-clean claim untested; staging bypassed consent + I3 | #1782, #1784 | (doc) — Test Lab-only, artifact-level tripwires |
| DIFF-0815 F-2 | NEEDS-REVIEW | `decodeShareBundle` still accepted v:1 verified with the broken pre-#1753 hasher | `c647829f` (#1778) | (doc) — legacy path deleted; the "no v1 bundles exist" claim was **confirmed before acting**, not assumed |
| DIFF-0815 F-3 | NEEDS-REVIEW | `veyrnox-kek-insecure-tier` I3 guard at call sites rather than at the write | `45043457` (#1777) | (doc) |
| **DIFF-0816 F-1** | NEEDS-REVIEW | `assertSafeRpcUrl`'s new RPC-host allowlist was reused for explorer links, rejecting **every** default network's explorer URL — including the input's own placeholder | `20b245a3` + follow-up | **grep**: `safeExplorerUrl()` at `netUrl.js:151`, used at `NetworkManager.jsx:137,166` |
| **DIFF-0816 F-2** | NEEDS-REVIEW | CSP `connect-src` named only the production Supabase project (blocking the advisor on staging) and still allowed a deleted `openrouter.ai` egress | — | **grep**: `public/_headers:6` now lists **both** `jwstkrtslotnjyerzzsi` and `nszlbcmcysftwyudthjz`; no `openrouter` string remains |
| DIFF-0816 LOW ×2 | LOW | `IntegrityGate.checkDebugger()` failed **open** against its own header contract; Android `call.reject()` message/code swapped | `071f3e1c` (#1840), `bb724e91` (#1835) | (doc) |

**Also closed:** **DEP-PIN** (opened by this tracker last run) — the crypto-critical
dependencies now carry exact pins. **grep**: `package.json` — `@noble/curves 1.9.7`,
`@noble/hashes 1.8.0`, `@scure/bip32 2.2.0`, `@scure/bip39 1.6.0`, `@scure/btc-signer
2.2.0`, `ethers 6.17.0`. No `^` remains on that set.

**And the 28-finding 2026-07-28 internal wave** (C-1, H-1…H-5, M-1…M-10, L-1…L-10, I-1) —
all merged via PRs #1435–#1462. Counted here for the first time because the source file was
never in this tracker's list. `(doc)`, per `docs/audit-2026-07-28-internal.md` and
`CLAUDE.md`.

---

## ⚠️ Checklist drift — standing Step-2 checks that are now wrong

Left unamended these produce **false readings**. Two carried, one new.

| Check | Why it breaks | Correct check going forward |
|---|---|---|
| `H6: are eth_signTypedData and _v3 in BLOCKED_METHODS (router.js)?` | **NEW.** The file moved — `src/lib/walletconnect/router.js` does not exist. It is now `src/wallet-core/evm/walletconnect/router.js`. The old path greps empty, which reads as "open". | Assert against `src/wallet-core/evm/walletconnect/router.js`. Present (grep). |
| `H3: is PRIMARY_UNLOCK_EQUALIZER_MS ≥ 1500?` | Constant deleted; replaced by real KDF-count equalisation. | `spendPrimaryUnlockEqualizerKdfs` imported (`WalletProvider.jsx:107`) and called on the primary-success path (`:1712`). Both present (grep). |
| `C6/H13: does CryptoSigning.jsx use useRef / call copySecret()?` | File rewritten; signing scoped inside `withPrivateKey(index, fn)`. | Assert the file holds no `privateKey`/`mnemonic` state and copies via `copyPlain`. Confirmed (grep). |
| `H-NEW-3: copySecret non-empty wipe sentinel AND visibilitychange?` | One check, two answers. `visibilitychange` present (5 refs). Read-back sentinel **absent by design**. | Split it. `visibilitychange` → FIXED. Sentinel → open, tracked as weekly L-8. |

Re-verified unchanged and still correct this run (grep): **C3** (`presignGateOrReject` +
`proceedAllowed` at every WC chokepoint), **C4** (live session peer metadata, fail-closed
on `sessionUnresolved`), **H7** (`domain.chainId` bound, `WalletConnectProvider.jsx:445-466`),
**H4** (single opaque `WRONG`), **H15/H16** (`setIsStrongBoxBacked(true)` best-effort at
`:213`, `AUTH_BIOMETRIC_STRONG` only at `:210`), **H-NEW-1** (`RELEASE_CERT_SHA256` from
BuildConfig, blank → fail closed), **M20** (`zero(ikm)` at `kek.js:248` **and** `:280` —
the second site is new, from the exception-safe `finally` added by #1643), **RASP-A2**
(two `?? TIER.BLOCK` sites in `SendCrypto.jsx`).

---

## Still Open ⚠️

| ID | Severity | Finding | File:Line | First reported |
|---|---|---|---|---|
| **C-3 / L-10** (08-03, 08-17) | MEDIUM → LOW | **PARTIALLY CLOSED 2026-08-17 by PR #1891 (`c4bf73a6`).** The raw-H half is fixed: `hmacResult` is now scrubbed with `java.util.Arrays.fill(…, 0.toByte())` in a `finally`, so a throw from `encodeToString`/`resolve` cannot skip it. **What remains open is the `b64` copy** — H base64-encoded into a `java.lang.String` to cross the Capacitor bridge. Strings are immutable, so it is not zeroable and the fill does not reach it; closing it needs a bridge that carries bytes, not another `fill()`. Same kind as the accepted iOS `NSString hB64` residual (M-6 / iOS-F5-residual), which is why the severity drops rather than clearing. `macInput` is **deliberately** not scrubbed — it is the kekSalt (already plaintext in the vault blob) and on the v1 path it *is* the shared `PRF_EVAL_SALT` instance, so filling it would corrupt that constant for every later call and silently change H | `HardwareKekPlugin.kt` — scrub at the `doFinal` site; residual documented in the file header (grep) | 2026-07-14 — **5th consecutive audit**, now partial |
| **C-4** (08-03) | MEDIUM | iOS `enroll()` plaintext-H buffer is an immutable `NSData`; the decrypt path does it correctly (`NSMutableData` + `resetBytesInRange`, `:354/:370`) and the fix was never mirrored | `HardwareKekPlugin.m:184` (grep) | 2026-07-14 — **4th consecutive audit** |
| **C-5** (08-03) | MEDIUM | WC known-bad/unresolvable dApp flag is display-only at the per-request gate. `approveBlocked` is declared at `:180`, **before** `sessionUnresolved` and `dapp` exist at `:192-196`, so it structurally cannot reference them without a reorder | `RequestApprovalModal.jsx:180` (grep) | 2026-07-14 — **4th consecutive audit**, verbatim |
| **C-2** (08-03) | MEDIUM (I4) | The documented PIN-backoff rate limiter is still dead code. `pinBackoffMs` has **no consumer outside its own module and tests**; `PIN_BACKOFF_KEY` is only ever `removeItem`'d (`WalletEntry.jsx:843`), never written or read. The module comment still asserts the tiers are live ("unchanged from the prior VULN-8 rate-limit") — that comment is the honesty gap | `pinAttemptGuard.js:37`, `WalletEntry.jsx:837,843` (grep) | 2026-07-20 |
| C-6 / C1 / weekly M-8 | CRITICAL | PIN attempt counter in clearable `localStorage`; no non-clearable backstop. Honestly disclosed in-source as an "Accepted software limit", so no I4 violation | `pinAttemptGuard.js:11-17`, `WalletEntry.jsx:836` (grep) | 2026-06-26 |
| C-7 / **#1111** | MEDIUM | Vault AAD v:3 — **materially advanced**: `encryptVaultWithDekV3`, the v:3 reader, the unlock migration hook and both rotation reseals all landed (`47bdd073`, #1649). Ships **inert** — `AAD_V3_MIGRATION_ENABLED = false` | `vault.js:274` (grep) | 2026-07-20 |
| C2 | CRITICAL | 8-digit PIN offline-exhaustible on non-KEK vaults | `vault.js`, `keystore/native.js` | 2026-06-26 |
| H10 | HIGH | Cert pinning — **17** SPKI entries still `PLACEHOLDER_*_REPLACE_ON_DEVICE` (was 16; the count grew with a new host) | `src/wallet-core/rpc/pinning.js` (grep) | 2026-06-26 |
| **DIFF-0730-MT** | MEDIUM (I4) | `MACHINE_TRANSLATED` is keyed by **locale** and gates the whole "machine translated, not reviewed" banner, but the review that cleared it covered only `security.json` (~249 of ~860 strings). ~71% of each locale — including the biometric backup-exposure risk acknowledgement and the reset/wipe confirmation in `wallet.json` — is unreviewed MT with no disclaimer. The source comments say `security.json reviewer-approved` **on the locale-wide flag**, so the mismatch is visible in the code | `src/i18n/index.js:81-100` — es, es-419, pt-BR, fr, it all still `false` (grep) | 2026-07-30 |
| **DIFF-0816-REJECT** | LOW | `RaspIntegrityPlugin.kt` probe canary still has the `(code, message)` swap that #1835 fixed in its two siblings. The pinning test asserts only `toContain('RASP_BLOCK')`, so it could not have caught the original and cannot catch this one | `RaspIntegrityPlugin.kt:142` (grep) | 2026-08-16 |
| **DIFF-0816-MAINSYNC** | LOW | `checkScreenCapture()` calls `DispatchQueue.main.sync` when off-main; Capacitor dispatches plugin calls off the main thread, so this deadlocks if main is ever blocked on that queue | `IntegrityGate.swift:88` (grep) | 2026-08-16 |
| **DIFF-0809-GOV** | GOVERNANCE | A 533-line hand-rolled GF(2⁸) Shamir implementation sits on the path that will hold a DEK share, against `CLAUDE.md`'s "No custom crypto primitives" rule. Defensible, honestly documented, and flagged off pre-audit — but it should be an **explicit named item in the outstanding independent-audit scope**, not something the audit discovers, and the rule should either carve out the exception or be treated as violated | `src/wallet-core/shamir.js`, `docs/cloud-recovery-shard-spec.md:108` | 2026-08-09 |
| L-2 (08-03) | LOW | RASP detection-chain doc drift between the Kotlin plugin's comments and `nativeProbe.js`. Partly corrected (`:97` now describes `overlayActive` as a platform-symmetry field) but the header chain at `:35`/`:73` still lists it as live | `RaspIntegrityPlugin.kt:35,73` (grep) | 2026-08-03 |
| weekly M-4 (07-14) | MEDIUM | RASP-blocked WC request fails silently in the UI (fail-closed on the wire, not fail-*honest*) | `WalletConnectProvider.jsx` | 2026-07-14 |
| weekly M-5 (07-14) | MEDIUM | WARN-tier `requiresBiometric` acknowledge-only on WC. *Note: the 08-03 weekly **REFUTED** the Send half — `SendCrypto.jsx:909-916` and `:996-1008` do enforce it with a freshly sampled artifact* | `degrade.js`, `presign.js` | 2026-07-14 |
| weekly M-6 (07-14) | MEDIUM | RaspSecurity/catalogue *under-claim* RASP status (stale "pending") | `RaspSecurity.jsx:45` | 2026-07-14 |
| weekly L-8 (07-14) | LOW | `copySecret` has no read-back sentinel — the clipboard overwrite is never confirmed (deliberate, `copySecret.js:30`) | `src/lib/copySecret.js:30` | 2026-07-14 |
| H1 / H2 / BIO-01 / H-NEW-5 | HIGH | Biometric unlock cache not OS-ACL bound to the enrollment set | `biometricUnlock.js:84-104` | 2026-06-26 |
| BIO-02 | HIGH | App-layer biometric gate Frida-bypassable (fundamental; disclosed) | `biometricUnlock.js:18-36` | 2026-07-05 |
| H5 | HIGH | `captureVerifierSafe` OOM bricks the send gate for the session. *Partly mitigated* — `credentialVerifier.verifyCredential` now catches an Argon2id `RangeError` and fails closed (#1643) | `credentialVerifier.js:64` | 2026-06-26 |
| H-3 (07-01) | HIGH | Android biometric lockout → device-credential fallback (accepted deviation) | `BiometricService` | 2026-07-01 |
| G2-ROOTCERT-PIN | HIGH | Play Integrity root pin is an issuer-string heuristic, not an SPKI fingerprint | `PlayIntegrityPlugin.kt` | 2026-07-15 |
| RASP-A1 | HIGH | RASP browser probe is a module-load snapshot (partly addressed by P2-1) | `browserProbe.js:76` | 2026-07-05 |
| D-04 | HIGH | I3 egress race: `isDecoy` React state lags the module flag (PLAUSIBLE) | `WalletProvider.jsx:316-321` | 2026-07-05 |
| P2-2 | MEDIUM | WC signing timing side-channel (accepted residual) | `WalletConnectProvider.jsx` | 2026-07-15 |
| M-K | MEDIUM | Passkey `signCount` not persisted (no-backend architecture) | `passkey.js` | 2026-06-28 |
| M-1 (07-08) | MEDIUM | EVM private key as a JS string — unzeroable (ethers v6); ACCEPTED RESIDUAL. *Adjacent progress:* seed + HD master are now zeroed in `finally` for EVM and Cosmos (#1643) | EVM signing path | 2026-07-08 |
| PW-01 | MEDIUM | In-app guarded wipe requires no re-auth (types `"WIPE"` only) | `PanicWipe.jsx:57,106` | 2026-07-05 |
| weekly L-1…L-7 (07-14) | LOW | `checkSystemWritable` weak; negative `txGas` unclamped; duplicated chainId helper; stale modal identity; iOS cancel misclassified; Android salt unzeroed; async prompt try/catch | various | 2026-07-14 |

**Accepted-residual / by-design:** M1–M19, L1–L10 (06-26); M-NEW-1…12 (06-27);
F-05/F-11/CS-1/SC-1/RASP-2/RASP-4/RASP-5 (07-04);
D-01/D-02/D-05/D-06/SW-01/SW-02/PW-02/PW-04/PW-05/AL-01/AL-02/AL-06/BIO-03/BIO-05/BIO-06/BIO-07/RASP-A4
(07-05). Consult the source audit for per-item rationale.

**Refuted on verification** (recorded so a future pass does not re-file): ROOTED→WARN
biometric ladder; "Play Integrity uses JWE not JWS"; "heuristic root checks fail open
per-check"; JS↔native bridge integrity; `HARDWARE_FACTOR_DEGENERATE` wipe-counter
miscount. **New this run:** 2026-07-20 weekly **H-2** (ColdSign WARN-tier biometric gap) —
the 08-03 weekly rated it **REFUTED / NOT APPLICABLE**, because WARN-tier biometric
enforcement is real in the live path and `ColdSign.jsx` was unreachable dead code. It has
since been **deleted outright** (`e3f53c93`, 2026-08-16), with its storage keys checked
against `ALL_RESIDUE_KEYS` (it wrote none).

---

## Needs On-Device / On-Chain / Live-Backend Verification 📱

| ID | Finding | Why verification is needed |
|---|---|---|
| **H-3 PRODUCTION REVOKEs** | **The single most important row in this table.** The 08-07 run-2 addendum established that *the database every prior analysis queried was staging.* `nszlbcmcysftwyudthjz` is **named** `veyrnox-prod`, is what the CLI reports as `linked` — and is staging. Production is `jwstkrtslotnjyerzzsi`, verified three ways (the anon key's own JWT `ref`, the deployed bundle's host, a live probe). **"H-3's REVOKEs are applied" was TRUE on staging and FALSE in production**, where all nine RPCs still carried `PUBLIC EXECUTE`, `record_attribution` included. STAGE 1 of `sql/live-project-hardening-2026-08-07.sql` was then applied to the live project (`record_attribution` + `get_referral_leaderboard` REVOKEd, `waitlist` reduced to INSERT); **STAGE 2 remains commented out.** Static analysis cannot read the live catalogue — re-verify against the ref the shipped bundle connects to, never against a project name |
| **`register_referral_code` migration ordering** | `b9a9f7ec` (#1779) changed the return type `void` → `text` and `referralApi.js` now reads the returned code. **Nothing in-tree shows the SQL has been applied to either project.** The migration must run **before** a client build depending on the return value ships |
| **`tip-chat` `vault:` strip deploy state** | The prefix is stripped in repo state (#1761). There is no in-tree evidence `tip-chat` was redeployed, so the live function may still honour it. Also: real Safety Plus subscribers are now capped as free users with no client-side signal — confirm which behaviour is live before writing up either |
| **Firebase tripwires** | Both artifact-level guards (#1782) live in `workflow_dispatch`-gated release jobs and **have never executed**; no Android build has run against the Gap 3 `_deactivated` placeholder. Also carried forward: **Crashlytics has no `_deactivated` equivalent**, so the absent config file is the only real control there |
| **SQL-UNEXECUTED** (carried) | The 07-28 hardening set + the H-1 referral/RC-webhook chain. Chain is **deployed on both envs but logically inert** pending #1703 (P0 wrong-recipient) and #1704 (attribute-name mismatch). **Do not fix #1704 in isolation — that activates the wrong-recipient grant path** |
| **RASP on a Play-delivered install** | `detectTamper()` on a real internal-track install. Now more urgent: the 1.0.1 pre-submission hold requires a clean Pre-launch report and clean Android Vitals |
| **1.0.1 golden path on an untouched device** | Play rejected build 5 because Create Wallet failed on stock hardware — the KEK/RASP fail-closed path rejecting on a device the developer had never touched. Both stores now gated on this |
| **iOS webview payload freshness** | `ios/App/App/public` is gitignored and `xcodebuild archive` does **not** rebuild it. A resident bundle on this machine was verified 2026-08-15 as `MODE:"production"` with `VITE_BYPASS_RASP:"1"` inlined. Nothing shipped, but an archive taken without `npm run build && npx cap sync ios` would have submitted a RASP-bypassed build |
| H-NEW-1 | APK tamper detection | Real release cert CI-injected and exercised on a repackaged APK |
| H10 | Cert pinning | 17 placeholder pins need device-observed SPKI values + MITM-proxy validation |
| G2-ROOTCERT-PIN | Play Integrity root pin | Needs a captured real token from a registered Play Console app |
| iOS App Attest | Entitlement wiring | `DCAppAttestService.isSupported` no-ops |
| C-1 v2→v3 migration | Android KEK salt migration | BLOCKED on-device; unit-tested only |
| C-3 / C-4 | Native H residue, both platforms | Heap dump on a compromised device to demonstrate extractability. **Unchanged by PR #1891** — that PR is source-verified and CI-compiled (`android-unit-tests` green) but was never run on a device, so "raw H no longer reachable from a heap dump" is asserted, not demonstrated. The unzeroable `String` copy means a heap dump would still be expected to yield H |
| H1 / H2 / BIO-01 | Biometric OS-ACL binding (M2c/M2d) | Native plugin + real device |
| weekly H-1 (07-14) | Timing equalisation | Code-correct; on-device wall-clock across success/duress/miss unmeasured |
| 2026-07-20 weekly H-1 | WC session-approval BLOCK | Code-correct; that `TIER.BLOCK` refuses a session approval on a hooked device is unmeasured |
| iOS RASP gates (#1765) | New `earlyCheck` on `enroll`/`getHardwareFactor` | Source-verified only; never exercised on a jailbroken device |
| M13 / M14 | FLAG_SECURE + WebView CDP disable | Unverified on a real release build |
| RASP hostile-device | All "BUILT / INTERNAL" RASP tags | Rooted/jailbroken/Frida session with an on-chain txid |
| M-2 (07-08) | `hw-send.js` Ledger/Trezor | Stub-level tests only |
| Safety Plus IAP | Promotional offers, both stores | **No real purchase has ever completed on either platform** |
| `@scure/bip32` zeroization | Seed/master `.fill(0)` completeness | Whether the `privateKey` getter returns the internal buffer or a copy, and whether a bigint representation survives, was **not** verified — the package body is absent from the checkout. Applies equally to the shipped BTC/SOL pattern |
| Independent audit | Entire KEK + vault-cipher + Shamir + S1–S4 surface | **Still outstanding** — no internal, ECC-skill, or Codex pass substitutes |

---

## Regressed 🔴

*No finding is currently in a regressed state.*

Both regressions in this window (`simulate.js` `willRevert`, `/api/*` CORS wildcard) are
detailed under "What changed this run" and were closed on 2026-08-07.

Historical regressions on record (re-fixed; preserved, not swept away): the release/debug
cert guard (**four** regressions, survived ~15 merges because its test was gated to
`main`-only so no PR could fail on it); telemetry consent (enforced in a layer nothing
called, then a re-ask-forever defect); C-1 KEK salt binding (v2 recorded RESOLVED, found
cryptographically inert on-device three days later); C-01 RASP pre-sign gate (fixed on one
chokepoint, scope-regressed on three); ECC F-P3-3 (first-run tour deleted undocumented,
re-closed the same day).

---

## Patterns worth naming, from this window

**1. "Verified" against the wrong system.** The staging/production database mix-up is the
most instructive failure in 20 days of records — not because a secret leaked (none did),
but because a full session of database analysis was reported as production state on the
strength of *a project name and a CLI saying `linked`*. Confirming which database the
shipped client actually talks to cost one `curl` of the deployed bundle. **This tracker is
structurally exposed to the same error**: every `(grep)` tag asserts something about a
pinned ref, and nothing about what is deployed, enrolled, or granted.

**2. A control that exists but cannot fire — still the dominant shape.** The `willRevert`
assignment that was never made; the CORS clause that never read the variable it compared;
the explorer allowlist that rejected every real explorer; the pinning test that asserts
`toContain('RASP_BLOCK')` and therefore cannot detect an argument swap. In every case a
green pipeline was consistent with the defect.

**3. Documentation that points at undoing a fix.** The Shamir JSDoc contradicted its own
module in four places, each argument pointing a future integrator toward removing H-6 or
M-7. Same class as the `PlayIntegrityPlugin` KDoc (07-28 L-3) and the `WalletProvider`
comment claiming an I3 gate lived in a function that had none. A stale comment on a
security control is not cosmetic — it is an instruction.

**4. The scan now duplicates work faster than it reports it.** Two independent scans covered
the same 97 commits blind to each other (`diff-2026-08-07-run2` and `-backlog`) and
independently ranked the same CORS defect top — genuinely useful corroboration, arrived at
by accident. Separately, fixes for two findings were implemented twice in parallel and one
set had to be discarded (PR #1602, closed as a duplicate of #1598). Same hazard as PRs
#1414/#1415, from a new direction: it is no longer two scanners colliding, it is the scan
and the remediation colliding.

**5. A finding can be right about the defect and wrong about the remedy.** See the
`simulate.js` entry above. Worth applying to this document: rows here carry evidence for
*what is present*, never for *what should be done next*.

---

*Automated weekly tracker. Static analysis only — does not substitute for on-device,
on-chain, or live-backend verification. "FIXED" = the code change is present on
`origin/main`; it is not a claim the control is verified working. SQL migrations are
counted as unexecuted text until their own verification queries have been run against the
**live project confirmed from the shipped client bundle**, not from a project name. The
independent third-party audit remains outstanding and is not substituted by any internal,
ECC-skill, or second-model (Codex) pass.*
