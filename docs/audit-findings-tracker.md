# Audit Findings Tracker
Last updated: 2026-07-19
Analysed against: origin/main @ `0e55c514310d13af76067c0c42e2c9442d070c52`

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
- **`audit-2026-07-14-weekly.md`** — C-1, H-1, M-1…M-8, L-1…L-8 *(new this run)*
- **`audit-2026-07-15-rasp-multi-tool-cycle.md`** — 2×P1, 10×P2, 5×P3 + 4-audit chain *(new this run)*

## Summary
- Total findings catalogued: **~126** (dedup across 8 docs; MEDIUM/LOW grouped below)
- Fixed (code-confirmed): **~80** (24 re-verified by grep this run)
- Still open / accepted-residual: **~34**
- Regressed: **0**
- Needs on-device / on-chain verification: **19**

### Movement since last run (2026-07-14)
| Finding | Was | Now | Evidence |
|---|---|---|---|
| weekly **C-1** (CRITICAL) — C-01 fail-open never propagated to 3 chokepoints | OPEN | ✅ **FIXED** | all 4 signing chokepoints native-aware (grep) |
| weekly **H-1** (HIGH) — primary-unlock timing oracle (~2.3 s gap) | OPEN | ✅ **FIXED by redesign** | `PRIMARY_UNLOCK_EQUALIZER_MS` **removed**; `spendPrimaryUnlockEqualizerKdfs` equalises all outcomes to 5 KDFs (grep) |
| weekly M-7 — RaspSecurity browser-only readout | OPEN | ✅ FIXED (PR #953) (doc) |
| multi-tool P1-1/P1-2, 9×P2, 5×P3 | new | ✅ FIXED (PRs #1009–#1014) (doc) |

**No finding regressed.** `main` moved from `280b9f43` → `0e55c514` since the weekly audit's own reconciliation, and both of that audit's headline findings (its only CRITICAL and only HIGH) closed in that window.

---

## ⚠️ Checklist drift — two standing checks are now OBSOLETE

Two Step-2 structural checks silently stopped matching on `main`. Left unamended they would produce **false STILL-OPEN readings** next run:

| Check | Why it broke | Correct check going forward |
|---|---|---|
| `H3: is PRIMARY_UNLOCK_EQUALIZER_MS ≥ 1500?` | The constant was **deleted**. The magic-sleep approach was replaced with real KDF-count equalisation (`spendPrimaryUnlockEqualizerKdfs`) — a strictly better fix. Grepping the old constant returns nothing → reads as "missing/open". | Assert `spendPrimaryUnlockEqualizerKdfs` is imported in `WalletProvider.jsx` **and** called on the primary-success path (`:1532`). |
| `C6/H13: does CryptoSigning.jsx use useRef / call copySecret()?` | `CryptoSigning.jsx` was **rewritten** (9.6 KB). It no longer generates mnemonics or derives HD keys at all — signing is scoped inside `withPrivateKey(index, fn)` and only public values (address, signature) are copied via `copyPlain`. No `useRef`, no `copySecret`, no key material in the component. | Assert the file contains **no** `privateKey`/`mnemonic` state and that copies use `copyPlain` — the stronger post-rewrite invariant. |

Both are **improvements**, not regressions — but the checklist must follow the code. Recommend updating the task prompt before next Tuesday.

---

## Fixed ✅

### Re-verified against pinned `main` this run (grep-confirmed)

| ID | Severity | Finding | Confirmed by |
|---|---|---|---|
| C3 | CRITICAL | RASP/presignGate absent from WC signing path | `WalletConnectProvider.jsx:44` imports `presignGate`; `presignGateOrReject()` at `:331`, gate at `:374` |
| C4 | CRITICAL | Phishing check read non-existent `proposer` | `RequestApprovalModal.jsx:175` reads `liveSession?.peer?.metadata` |
| weekly C-1 | CRITICAL | C-01 fail-open not propagated beyond SendCrypto | **all 4 chokepoints native-aware**: SendCrypto ✔ ColdSign ✔ CryptoSigning ✔ WalletConnectProvider ✔ |
| weekly H-1 | HIGH | Primary-unlock timing oracle (3-KDF deficit) | equaliser constant removed; `spendPrimaryUnlockEqualizerKdfs` called `WalletProvider.jsx:1532` — all outcomes 5 KDFs |
| C6 / H13 | CRITICAL/HIGH | Private keys in React state; key copied w/o wipe | superseded — `CryptoSigning.jsx` never holds key material; public-only `copyPlain` |
| H4 | HIGH | twoFactorGate leaked which factor was wrong | `twoFactorGate.js:32` single opaque `WRONG` |
| H6 | HIGH | `eth_signTypedData` v1/v3 routed as v4 | both in `BLOCKED_METHODS` (`router.js:41-42`) |
| H15 | HIGH | Android KEK not StrongBox-backed | `HardwareKekPlugin.kt:213` `setIsStrongBoxBacked(true)` — caveat: best-effort, not enforced |
| H16 | HIGH | `AUTH_DEVICE_CREDENTIAL` collapsed biometric to PIN | `:76` removed; `AUTH_BIOMETRIC_STRONG` only |
| H-NEW-1 | HIGH | APK tamper check placeholder cert | `RaspIntegrityPlugin.kt:765` reads `BuildConfig.RELEASE_CERT_SHA256`; blank → fail-closed |
| M20 | MEDIUM | `combineKek` internal `ikm` not zeroed | `kek.js:241` `zero(ikm)` (F-06 CryptoKey caveat documented) |
| RASP-A2 | HIGH | `raspTier ?? TIER.ALLOW` fail-open | `SendCrypto.jsx:761` **and** `:828` (fresh re-probe) both `?? TIER.BLOCK` |

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
| H7 / H8 / H-NEW-2 | HIGH | EIP-712 chain binding; personal_sign address; topic binding | PRs #443/#757; weekly re-confirmed PASS |
| H-NEW-A/B/C/D | HIGH | KEK zeroing; WC step-up; sign parity; iOS SE | PRs #433/#443; SE confirmed `HardwareKekPlugin.m:78` |
| H-2 / iOS-F11 | HIGH | Biometric not bound to enrollment set | Android PR #516/#518; iOS 2026-07-08 — both RESOLVED |
| iOS-F5 / iOS-F3 / iOS-F9 | HIGH/MED | NSData zeroing; deprecated prompt; SE trace | device-verified 2026-07-07 |
| F-01…F-08, H-1, H-4, M-3, iOS-F6 | H/M/L | KEK stack hardening | PRs #520–#522, #527, #723 |
| M-A/B/F/G/H/I/J | MEDIUM | WebView nav, tamper fail-open, re-auth, KDF bounds | PRs #440–#442 |
| 9×P2 + 5×P3 | MED/LOW | TOCTOU re-probe, attestation defer, shape validation, doc-lag | PRs #1010/#1012/#1013/#1014 |
| weekly M-7 | MEDIUM | RaspSecurity browser-only readout | PR #953 |
| M-6/M-7 (07-08) | MEDIUM | Hidden-balance I3 guard; live-prices panic residue | PR #757 |
| I2-LIVEPRICE | MEDIUM | Live-price opt-OUT default violated I2 | now opt-in (`=== '1'`) |

---

## Still Open ⚠️

| ID | Severity | Finding | File:Line | First reported |
|---|---|---|---|---|
| C1 / weekly M-8 | CRITICAL | PIN attempt counter in clearable `localStorage` — wipe defeatable (disclosed; hardware-KEK is tracked fix) | `pinAttemptGuard.js:11-17` | 2026-06-26 |
| C2 | CRITICAL | 8-digit PIN offline-exhaustible on non-KEK vaults | `vault.js`, `keystore/native.js` | 2026-06-26 |
| H10 | HIGH | Cert pinning — **16** SPKI entries still `PLACEHOLDER_*_REPLACE_ON_DEVICE` (grep) | `rpc/pinning.js` | 2026-06-26 |
| weekly M-1 | MEDIUM | Android `hmacResult` (plaintext H) never `.fill(0)` before `call.resolve` (grep: `:373-375`) | `HardwareKekPlugin.kt:373` | 2026-07-14 |
| weekly M-2 | MEDIUM | iOS **enroll** path uses immutable `NSData dataWithBytes` — unzeroable; fix exists only on decrypt path (`:333/:349`) (grep) | `HardwareKekPlugin.m:174` | 2026-07-14 |
| weekly M-3 | MEDIUM | `approveBlocked` excludes `dapp.flagged`/`sessionUnresolved` — known-bad dApp banner is display-only at signing (grep: `:162-167`) | `RequestApprovalModal.jsx:162` | 2026-07-14 |
| weekly M-4 | MEDIUM | RASP-blocked WC request fails silently in UI (fail-closed on wire, not fail-*honest*) | `WalletConnectProvider.jsx:324-328` | 2026-07-14 |
| weekly M-5 | MEDIUM | WARN-tier `requiresBiometric` still acknowledge-only on WC/ColdSign/CryptoSigning paths | `degrade.js`, `presign.js` | 2026-07-14 |
| weekly M-6 | MEDIUM | RaspSecurity/catalogue *under-claim* RASP status (stale "pending") | `RaspSecurity.jsx:45` | 2026-07-14 |
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
| weekly L-1…L-8 | LOW | `checkSystemWritable` weak; negative `txGas` unclamped; duplicated chainId helper; stale modal identity; iOS cancel misclassified; Android salt unzeroed; async prompt try/catch; `copySecret` no read-back sentinel | various | 2026-07-14 |

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
| weekly H-1 | Timing equalisation | Redesign is code-correct; **on-device wall-clock across success/duress/miss still unmeasured** |
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
| C-01 | RASP pre-sign gate fail-open | Fixed on SendCrypto (PR #825) but **scope-regressed** — 3 other chokepoints left fail-open, caught by the 2026-07-14 weekly. Now fully propagated (verified this run). |

---

*Automated weekly tracker. Static analysis only — does not substitute for on-device or on-chain verification. "FIXED" = the code change is present on `origin/main`; it is not a claim the control is verified working. The independent third-party audit remains outstanding and is not substituted by any internal or second-model (Codex) pass.*
