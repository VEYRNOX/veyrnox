# Audit Findings Tracker
Last updated: 2026-07-21
Analysed against: origin/main @ `b86a39ac3be80b02483edb5f3a6fc503d028344d`
(clean throwaway worktree cut from `origin/main`, per Step 0 — not the live checkout,
not a fallback `git show`).

> Automated weekly synthesis of every finding across `docs/audit-*.md`, checked against a
> **pinned snapshot of `origin/main`** (throwaway worktree, not the live checkout).
> **Static analysis only.** "FIXED" means the code change is present on `main` — it does
> **not** mean the control is verified working on-device or on-chain. Rows tagged `(grep)`
> were re-verified against source this run; rows tagged `(doc)` carry the status recorded in
> an audit doc or PR history and were not independently re-checked.

## Sources synthesised
- `audit-2026-06-26-login-dapp-rasp-kek.md` — C1–C5, H1–H16, M1–M20, L1–L10
- `audit-2026-06-27-rasp-wc-kek-auth.md` — C6, H-NEW-1…H-NEW-6, M-NEW-1…M-NEW-12
- `audit-2026-06-28-internal-static-analysis.md` — H-NEW-A…H-NEW-D, M-A/B/F/G/H/I/J/K
- `audit-2026-07-01-kek-internal.md` — C-1, F-01…F-08, H-1…H-4, iOS-F3/F5/F6/F9/F11
- `audit-2026-07-04-internal.md` — F-04 (CRIT), F-01…F-10, RASP-3, I3-WC, I3-1
- `audit-2026-07-05-deniability-internal.md` — D-02/04/05/06, SW-01/02, PW-01/02/04/05, AL-02/06, BIO-01…07, RASP-A1…A4
- `audit-2026-07-14-weekly.md` — C-1, H-1, M-1…M-8, L-1…L-8
- `audit-2026-07-15-rasp-multi-tool-cycle.md` — 2×P1, 10×P2, 5×P3 + 4-audit chain
- `audit-2026-07-20-weekly.md` — H-1, H-2, H-3, M-1…M-8, L-1…L-3 *(own H-1/H-2/H-3/C-1
  labels are DISTINCT from the identically-named rows from earlier docs; always qualified
  below as "2026-07-20 weekly …")*
- **PR #1262** ("branch-review", `claude/fix-c1-k2-deniability`) — C-1 (CRITICAL) and K-2,
  its own labels, not from a numbered `audit-*.md` doc (qualified below as "2026-07-20
  branch-review …")
- Also scanned: `docs/audit-triage/` (28 files) and `docs/security-audits/` (11 files) —
  no finding IDs beyond those already catalogued above.

## Summary
- Total findings catalogued: **~126** (dedup across the docs above; MEDIUM/LOW grouped)
- Fixed (code-confirmed): **~81** (H-1 WC session-approval gate closed this run — see below)
- Still open / accepted-residual: **~33**
- Regressed: **0**
- Needs on-device / on-chain verification: **19**

### Movement since last run (2026-07-20 → 2026-07-21)

`main` moved `0e55c514` → **`b86a39ac`** (~30 commits). **One tracked finding closed; no
finding regressed; no new audit doc landed** (latest weekly is still `audit-2026-07-20-weekly.md`).

| Finding | Was | Now | Evidence |
|---|---|---|---|
| **2026-07-20 weekly H-1** (HIGH, I4) — WalletConnect session-approval RASP gate was dead code: `handleApproveSession` read `gate.blocked`/`gate.sentence`, which `presignGateOrReject()` never returns — every WC session **approval** proceeded regardless of RASP tier, including a hard `TIER.BLOCK` | ⚠️ **OPEN** last run (fix was in PR #1276, unmerged) | ✅ **FIXED** (PR #1276, `e907d648`, merged) | **grep-confirmed** on `main`: `WalletConnectProvider.jsx:778` now reads `if (!gate.proceedAllowed) throw …` — the same fail-closed shape the three signing chokepoints use; inline comment cites "H-1 (audit 2026-07-20)"; regression test `WalletConnectProvider.sessionApprovalRaspGate.test.jsx` exercises the branch |

**Also landed (not audit-finding rows):**
- PR #1291 (`e2828171`) — pinned `tar>=7.5.20` to clear CRITICAL advisory
  GHSA-23hp-3jrh-7fpw (dependency hygiene, not a tracked wallet finding).
- PR #1277 (`06089fa0`) — doc-sync of status docs for the 2026-07-20 landings.
- PRs #1283/#1284/#1288/#1289 — WalletConnect dApp-grid curation + the Trust Wallet tile
  add/revert (product/UX, no security-finding impact; the revert restored prior state).

**Honesty note:** the H-1 closure is BUILT / unit-tested / merged, INTERNAL. It is
**not** device-verified — that a real `TIER.BLOCK` on a rooted/hooked device actually
refuses a WC session approval is still unmeasured on-device (covered by the general "RASP
hostile-device" row under Needs On-Device). Do not upgrade past BUILT.

### Movement recorded last run (2026-07-19 → 2026-07-20), preserved
| Finding | Result | Fixed in |
|---|---|---|
| 2026-07-20 weekly **H-3** — duress PIN setup didn't clear a pre-existing real-PIN biometric cache | ✅ FIXED | PR #1261 (`f3358c2c`) |
| 2026-07-20 branch-review **C-1** (CRITICAL) — More-drawer "Recent" tiles named duress/stealth/panic routes, survived decoy/lock/panic-wipe | ✅ FIXED | PR #1262 (`d7f00751`) |
| 2026-07-20 branch-review **K-2** — referral `syncCount` failure-as-success + pre-gate real-state read/write | ✅ FIXED | PR #1262 (`d7f00751`) |
| **S-1** — PR #1243 stripped user-facing security caveats from `Documentation.jsx` | ✅ FIXED | PR #1268 (`e8cf2775`) |
| 2026-07-20 weekly **H-2** — ColdSign WARN-tier biometric step-up gap | ➖ No new row — `ColdSign.jsx` is unreachable dead code; already covered by weekly M-5 |

---

## ⚠️ Checklist drift — two standing Step-2 checks remain OBSOLETE

Unchanged from last run. Left unamended they produce **false STILL-OPEN readings**:

| Check | Why it breaks | Correct check going forward |
|---|---|---|
| `H3: is PRIMARY_UNLOCK_EQUALIZER_MS ≥ 1500?` | The constant was **deleted** (grep returns nothing → reads as "missing/open"). Replaced by real KDF-count equalisation. | Assert `spendPrimaryUnlockEqualizerKdfs` is imported in `WalletProvider.jsx` (`:91`) **and** called on the primary-success path (`:1534`). Both present this run (grep). |
| `C6/H13: does CryptoSigning.jsx use useRef / call copySecret()?` | `CryptoSigning.jsx` was **rewritten**; signing is scoped inside `withPrivateKey(index, fn)`, public values copied via `copyPlain`. No `useRef`, no `copySecret`. | Assert the file holds **no** `privateKey`/`mnemonic` state and copies via `copyPlain`. Confirmed this run (grep: `:8` imports `copyPlain`, `:80` `withPrivateKey(0, …)`). |

Both are **improvements**, not regressions — the checklist must follow the code.

---

## Fixed ✅

### Re-verified against pinned `main` this run (grep-confirmed)

| ID | Severity | Finding | Confirmed by |
|---|---|---|---|
| **2026-07-20 weekly H-1** | HIGH | WC session-approval RASP gate was a no-op (`gate.blocked`/`gate.sentence` never returned) | **NEW this run** — `WalletConnectProvider.jsx:778` `if (!gate.proceedAllowed) throw` (fail-closed); comment cites "H-1 (audit 2026-07-20)"; test `sessionApprovalRaspGate.test.jsx` (grep) |
| C3 | CRITICAL | RASP/presignGate absent from WC signing path | `WalletConnectProvider.jsx:44` imports `presignGate`; `presignGateOrReject()` at `:331`, gate checks at `:390/:436/:511/:778` (grep) |
| C4 | CRITICAL | Phishing check read non-existent `proposer` | `RequestApprovalModal.jsx:174-175` reads `liveSession?.peer?.metadata`; `:176` fails closed on `sessionUnresolved` (grep) |
| weekly C-1 (07-14) | CRITICAL | C-01 fail-open not propagated beyond SendCrypto | all 4 signing chokepoints native-aware: SendCrypto ✔ ColdSign ✔ CryptoSigning ✔ WalletConnectProvider ✔ (grep) |
| weekly H-1 (07-14) | HIGH | Primary-unlock timing oracle (3-KDF deficit) | equaliser constant removed; `spendPrimaryUnlockEqualizerKdfs` called `WalletProvider.jsx:1534` — all outcomes equalised (grep) |
| C6 / H13 | CRITICAL/HIGH | Private keys in React state; key copied w/o wipe | superseded — `CryptoSigning.jsx` never holds key material; public-only `copyPlain` (grep) |
| H4 | HIGH | twoFactorGate leaked which factor was wrong | `twoFactorGate.js:77` single opaque `WRONG` ("Incorrect PIN or Action Password.") (grep) |
| H6 | HIGH | `eth_signTypedData` v1/v3 routed as v4 | both in `BLOCKED_METHODS` (`router.js:41-42`); `:52` `isBlocked` (grep) |
| H7 | HIGH | EIP-712 `domain.chainId` not bound to session chain | `WalletConnectProvider.jsx:476-481` binds `domain.chainId`; pre-modal mirror at `:727` (grep) |
| H15 | HIGH | Android KEK not StrongBox-backed | `HardwareKekPlugin.kt:213` `setIsStrongBoxBacked(true)` — caveat: best-effort, not enforced (grep + inline comment `:14`) |
| H16 | HIGH | `AUTH_DEVICE_CREDENTIAL` collapsed biometric to PIN | `:210` `AUTH_BIOMETRIC_STRONG` only; `:23/:209` comments confirm DEVICE_CREDENTIAL removed (grep) |
| H-NEW-1 | HIGH | APK tamper check placeholder cert | `RaspIntegrityPlugin.kt:765` reads `BuildConfig.RELEASE_CERT_SHA256`; blank → `:769-770` fail-closed (grep) |
| H-NEW-4 | HIGH | KEK `H`/`C`/`dek` not zeroed at call site | `keystore/web.js:354-355` `H.fill(0)`/`C.fill(0)` post-`combineKek`; `:368-371` finally-block wipes H/C/kek/dek (grep) |
| M20 | MEDIUM | `combineKek` internal `ikm` not zeroed | `kek.js:241` `zero(ikm)` (F-06 CryptoKey caveat documented `:240`) (grep) |
| RASP-A2 | HIGH | `raspTier ?? TIER.ALLOW` fail-open | `SendCrypto.jsx:761` **and** `:828` (fresh re-probe) both `?? TIER.BLOCK` (grep) |

### Doc / PR-confirmed (not re-grepped this run)

| ID | Severity | Finding | Fixed in |
|---|---|---|---|
| C5 | CRITICAL | Native `RaspIntegrityPlugin` did not exist | built; F-09 device-verified 2026-07-12 (mainnet `0x4556e2e6…`) |
| C-1 (KEK) | CRITICAL | Android KEK HMAC global fixed salt | v3 salt binding, PR #568, device-verified (Sepolia `0xecd68494…`) |
| C-01 | CRITICAL | RASP pre-sign gate fail-OPEN on native | PR #825 + propagation PRs #954/#960/#966 |
| P1-1 | CRITICAL | Play Integrity verdict not nonce-bound (replay) | PR #1009 — *only Codex-caught finding; both Claude reviewers missed it* |
| P1-2 | HIGH | `sensitiveGate` fail-OPEN on null artifact | PR #1010 |
| Audit-1 H-2 | HIGH | ES256 JWS raw R‖S vs DER — every real token failed | PR #955 |
| SEND H-1 | HIGH | Trezor EVM bypassed audited `hw-send.js` helpers | PR #963 (+ I3 hotfix cascade PR #978) |
| H8 / H-NEW-2 | HIGH | personal_sign address binding; WC topic binding | PRs #443/#757; weekly re-confirmed PASS |
| H-NEW-A/B/C/D | HIGH | KEK zeroing; WC step-up; sign parity; iOS SE | PRs #433/#443; SE confirmed `HardwareKekPlugin.m:78` |
| H-2 / iOS-F11 | HIGH | Biometric not bound to enrollment set | Android PR #516/#518; iOS 2026-07-08 — both RESOLVED |
| iOS-F5 / iOS-F3 / iOS-F9 | HIGH/MED | NSData zeroing; deprecated prompt; SE trace | device-verified 2026-07-07 |
| F-01…F-08, H-1, H-4, M-3, iOS-F6 | H/M/L | KEK stack hardening | PRs #520–#522, #527, #723 |
| M-A/B/F/G/H/I/J | MEDIUM | WebView nav, tamper fail-open, re-auth, KDF bounds | PRs #440–#442 |
| 9×P2 + 5×P3 | MED/LOW | TOCTOU re-probe, attestation defer, shape validation, doc-lag | PRs #1010/#1012/#1013/#1014 |
| weekly M-7 (07-14) | MEDIUM | RaspSecurity browser-only readout | PR #953 |
| M-6/M-7 (07-08) | MEDIUM | Hidden-balance I3 guard; live-prices panic residue | PR #757 |
| I2-LIVEPRICE | MEDIUM | Live-price opt-OUT default violated I2 | now opt-in (`=== '1'`) |
| 2026-07-20 weekly H-3 | HIGH | Duress PIN setup didn't clear pre-existing real-PIN biometric cache (I3+I4) | PR #1261 (`f3358c2c`) — `WalletProvider.jsx setDuressPin()` clears cache; `src/lib/duressBiometricGuard.js` guard at lock-screen mount |
| 2026-07-20 branch-review C-1 | CRITICAL | More-drawer "Recent" tiles named duress/stealth/panic routes; survived decoy/lock/panic-wipe (I3) | PR #1262 (`d7f00751`) — `useRecentPages.js` gated on `isDeniabilityOrDemoActive()`; `panic.js` sessionStorage sweep |
| 2026-07-20 branch-review K-2 | MEDIUM-HIGH | Referral `syncCount` failure-as-success + pre-gate real-state read/write (I4+I3) | PR #1262 (`d7f00751`) — `ReferralTracker.jsx` branches on `isDeniabilityOrDemoActive()`; neutral empty state in decoy/demo |
| S-1 | MEDIUM | PR #1243 deleted user-facing security caveats from `Documentation.jsx` (I4) | PR #1268 (`e8cf2775`) — caveats + status legend restored; regression test pins them |

**Honesty note:** all 2026-07-20/07-21 landings are BUILT / unit-tested / merged, INTERNAL.
None is device-verified, none has an on-chain txid, none is independently audited — do not
upgrade past BUILT.

---

## Still Open ⚠️

| ID | Severity | Finding | File:Line | First reported |
|---|---|---|---|---|
| C1 / weekly M-8 | CRITICAL | PIN attempt counter in clearable `localStorage` — wipe defeatable (disclosed; hardware-KEK is tracked fix) | `pinAttemptGuard.js:11-17` | 2026-06-26 |
| C2 | CRITICAL | 8-digit PIN offline-exhaustible on non-KEK vaults | `vault.js`, `keystore/native.js` | 2026-06-26 |
| H10 | HIGH | Cert pinning — **16** SPKI entries still `PLACEHOLDER_*_REPLACE_ON_DEVICE` (grep) | `rpc/pinning.js` | 2026-06-26 |
| weekly M-1 (07-14) | MEDIUM | Android `hmacResult` (plaintext H) never `.fill(0)` before `call.resolve` (grep: `:373-375`) | `HardwareKekPlugin.kt:373` | 2026-07-14 |
| weekly M-2 (07-14) | MEDIUM | iOS **enroll** path uses immutable `NSData dataWithBytes` — unzeroable; fix exists only on decrypt path (`:333/:349`) (doc) | `HardwareKekPlugin.m:174` | 2026-07-14 |
| weekly M-3 (07-14) | MEDIUM | `approveBlocked` excludes `dapp.flagged`/`sessionUnresolved` — known-bad dApp banner display-only at signing (doc) | `RequestApprovalModal.jsx:162` | 2026-07-14 |
| weekly M-4 (07-14) | MEDIUM | RASP-blocked WC request fails silently in UI (fail-closed on wire, not fail-*honest*) | `WalletConnectProvider.jsx` | 2026-07-14 |
| weekly M-5 (07-14) | MEDIUM | WARN-tier `requiresBiometric` still acknowledge-only on WC/ColdSign/CryptoSigning paths. Re-confirmed by `audit-2026-07-20-weekly.md` (its own "H-2" is this gap surfacing via unreachable `ColdSign.jsx` dead code — no new row). `ColdSign.jsx:162-163` uses `presignGate` but the WARN acknowledge-only path is the same architectural gap. | `degrade.js`, `presign.js` | 2026-07-14 |
| weekly M-6 (07-14) | MEDIUM | RaspSecurity/catalogue *under-claim* RASP status (stale "pending") | `RaspSecurity.jsx:45` | 2026-07-14 |
| H1 / H2 / BIO-01 / H-NEW-5 | HIGH | Biometric unlock cache not OS-ACL bound to enrollment set | `biometricUnlock.js:84-104` | 2026-06-26 |
| BIO-02 | HIGH | App-layer biometric gate Frida-bypassable (fundamental; disclosed) | `biometricUnlock.js:18-36` | 2026-07-05 |
| H5 | HIGH | `captureVerifierSafe` OOM bricks send-gate for session | `credentialVerifier.js:64` | 2026-06-26 |
| H-3 (07-01) | HIGH | Android biometric lockout → device-credential fallback (accepted deviation) | `BiometricService` | 2026-07-01 |
| G2-ROOTCERT-PIN | HIGH | Play Integrity root pin is issuer-string heuristic, not SPKI fingerprint | `PlayIntegrityPlugin.kt` | 2026-07-15 |
| P2-2 | MEDIUM | WC signing timing side-channel (real awaits attestation, decoy skips) — **accepted residual** | `WalletConnectProvider.jsx` | 2026-07-15 |
| M-K | MEDIUM | Passkey `signCount` not persisted (no-backend architecture) | `passkey.js` | 2026-06-28 |
| M-6 / iOS-F5 residual | MEDIUM | iOS `NSString hB64` bridge copy of H (architectural) | `HardwareKekPlugin.m` | 2026-07-08 |
| M-1 (07-08) | MEDIUM | EVM private key as JS string — unzeroable (ethers v6); ACCEPTED RESIDUAL | EVM signing path | 2026-07-08 |
| PW-01 | MEDIUM | In-app guarded wipe requires no re-auth (types "WIPE" only) | `PanicWipe.jsx:148` | 2026-07-05 |
| RASP-A1 | HIGH | RASP browser probe module-load snapshot (partly addressed by P2-1 fresh re-probe) | `browserProbe.js:76` | 2026-07-05 |
| D-04 | HIGH | I3 egress race: `isDecoy` React state lags module flag (PLAUSIBLE) | `WalletProvider.jsx:316-321` | 2026-07-05 |
| weekly L-1…L-8 (07-14) | LOW | `checkSystemWritable` weak; negative `txGas` unclamped; duplicated chainId helper; stale modal identity; iOS cancel misclassified; Android salt unzeroed; async prompt try/catch; `copySecret` no read-back sentinel | various | 2026-07-14 |

**Accepted-residual / by-design:** M1–M19, L1–L10 (06-26); M-NEW-1…12 (06-27); F-05/F-11/CS-1/SC-1/RASP-2/RASP-4/RASP-5 (07-04); D-01/D-02/D-05/D-06/SW-01/SW-02/PW-02/PW-04/PW-05/AL-01/AL-02/AL-06/BIO-03/BIO-05/BIO-06/BIO-07/RASP-A4 (07-05). Consult the source audit for per-item rationale.

**Refuted on verification** (recorded so a future pass doesn't re-file): ROOTED→WARN biometric ladder (deliberate design); "Play Integrity uses JWE not JWS" (codebase uses Classic API → JWS); "heuristic root checks fail open per-check" (intentional OR-chain tradeoff); JS↔native bridge integrity (architectural, already disclosed); `HARDWARE_FACTOR_DEGENERATE` wipe-counter miscount (finding read the wrong enum — it *is* exempted at `WalletEntry.jsx:784`).

---

## Needs On-Device / On-Chain Verification 📱

| ID | Finding | Why on-device / on-chain needed |
|---|---|---|
| H-NEW-1 | APK tamper detection | Real release cert must be CI-injected (`-PRELEASE_CERT_SHA256`) and exercised on a repackaged APK |
| H10 | Cert pinning | 16 placeholder pins need real device-observed SPKI values + MITM-proxy validation |
| G2-ROOTCERT-PIN | Play Integrity root pin | Needs a captured real token from a registered Play Console app |
| iOS App Attest | Entitlement wiring | `DCAppAttestService.isSupported` no-ops; needs Apple account + `App.entitlements` + DeviceCheck link |
| C-1 v2→v3 migration | Android KEK salt migration | BLOCKED on-device (PIN-cohort divergence APK-OLD/APK-NEW); unit-tested only |
| iOS-F5 residual | Heap-dump zeroing | Source+build verified; heap dump outstanding |
| weekly M-1 / M-2 | Native H residue | Heap-dump on compromised device to demonstrate extractability |
| H1 / H2 / BIO-01 | Biometric OS-ACL binding (M2c/M2d) | Native plugin + real device |
| weekly H-1 (07-14) | Timing equalisation | Redesign is code-correct; **on-device wall-clock across success/duress/miss still unmeasured** |
| 2026-07-20 weekly H-1 | WC session-approval BLOCK | **Fix is code-correct/merged (this run)**; that `TIER.BLOCK` actually refuses a WC session approval on a rooted/hooked device is still unmeasured on-device |
| M13 / M14 | FLAG_SECURE + WebView CDP disable | Unverified on real release build |
| RASP hostile-device | All "BUILT / INTERNAL" RASP tags | Rooted/jailbroken/Frida device session with on-chain txid |
| M-2 (07-08) | `hw-send.js` Ledger/Trezor | Stub-level tests only; physical device required |
| Independent audit | Entire KEK + vault-cipher + S1–S4 surface | **Still outstanding** — no internal or Codex pass substitutes |

---

## Regressed 🔴

*No finding is currently in a regressed state.*

Historical regression on record (re-fixed; preserved, not swept away):

| ID | Finding | What broke → resolution |
|---|---|---|
| C-1 (KEK) | Android per-enrollment salt binding | v2 fix (PR #529) recorded RESOLVED 2026-07-02, found **cryptographically inert on-device 2026-07-05** (facade arg-drop + bridge `JSON.stringify` reverted to fixed v1 salt). Re-FIXED same day via v3 (PR #568), device-verified. Salt-tamper (T2) + distinctness (T3) CLOSED 2026-07-07; v2→v3 migration device-exercise still BLOCKED. |
| C-01 | RASP pre-sign gate fail-open | Fixed on SendCrypto (PR #825) but **scope-regressed** — 3 other chokepoints left fail-open, caught by the 2026-07-14 weekly. Now fully propagated (verified). |

---

*Automated weekly tracker. Static analysis only — does not substitute for on-device or on-chain verification. "FIXED" = the code change is present on `origin/main`; it is not a claim the control is verified working. The independent third-party audit remains outstanding and is not substituted by any internal or second-model (Codex) pass.*
