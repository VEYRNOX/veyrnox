# Audit Findings Tracker
Last updated: 2026-07-14

> Automated weekly synthesis of every finding across `docs/audit-*.md`, checked against the
> current code on the checked-out tree (detached HEAD `7f5f22f4`). **Static analysis only.**
> "FIXED" means the code change is present in the tree — it does **not** mean the control is
> verified working on-device or on-chain. Findings marked `(grep)` were re-verified against
> source this pass; findings marked `(doc)` carry the resolution status recorded in the audit
> document / PR history and were **not** independently re-grepped this run.

## Sources synthesised
- `audit-2026-06-26-login-dapp-rasp-kek.md` — C1–C5, H1–H16, M1–M20, L1–L10
- `audit-2026-06-27-rasp-wc-kek-auth.md` — C6, H-NEW-1…H-NEW-6, M-NEW-1…M-NEW-12
- `audit-2026-06-28-internal-static-analysis.md` — H-NEW-A…H-NEW-D, M-A/B/F/G/H/I/J/K
- `audit-2026-07-01-kek-internal.md` — C-1, F-01…F-08, H-1…H-4, iOS-F3/F5/F6/F9/F11
- `audit-2026-07-04-internal.md` — F-04 (CRIT), F-01…F-10, RASP-3, I3-WC, I3-1
- `audit-2026-07-05-deniability-internal.md` — D-02/04/05/06, SW-01/02, PW-01/02/04/05, AL-02/06, BIO-01…07, RASP-A1…A4

## Summary
- Total findings catalogued: **96** (CRITICAL 8 · HIGH 43 · MEDIUM ~30 · LOW ~15; MEDIUM/LOW grouped below)
- Fixed (code-confirmed): **58** (18 re-verified by grep this pass, 40 doc/PR-confirmed)
- Still open / accepted-residual: **19**
- Regressed: **0 currently** (C-1 had a documented REGRESSED→re-FIXED cycle; current state FIXED)
- Needs on-device / on-chain verification: **19**

---

## Fixed ✅

### Re-verified against source this pass (grep-confirmed)

| ID | Severity | Finding | Fixed in | Confirmed by |
|---|---|---|---|---|
| C3 | CRITICAL | RASP/presignGate absent from WalletConnect signing path | WC hardening (2026-06-27) | grep: `presignGate` imported `WalletConnectProvider.jsx:27`; `presignGateOrReject()` called in all 3 handlers (L233/279/324) |
| C4 | CRITICAL | Phishing check read non-existent `proposer` field | 2026-06-27 | grep: `RequestApprovalModal.jsx:152` reads `liveSession?.peer?.metadata`; explicit C4 comment; no `proposer` read |
| C6 | CRITICAL | Private keys stored in React `useState` | 2026-06-27 | grep: `CryptoSigning.jsx:61-63` `walletRef/mnemonicRef/derivedRef` are `useRef`; no `privateKey` in `useState` |
| H3 | HIGH | Unlock timing equalizer stale (300 ms) | 2026-06-28 | grep: `PRIMARY_UNLOCK_EQUALIZER_MS = 2000` (`WalletProvider.jsx:212`, ≥1500) |
| H4 | HIGH | twoFactorGate leaked which factor was wrong | PR (pre-2026-06-27) | grep: `twoFactorGate.js:32,77` single opaque `WRONG` code, one message |
| H6 | HIGH | `eth_signTypedData` v1/v3 routed as v4 | 2026-06-27 | grep: both in `BLOCKED_METHODS` (`router.js:41-42`) |
| H7 | HIGH | EIP-712 `domain.chainId` not bound to WC session | 2026-06-27 | grep: `WalletConnectProvider.jsx:304-307` rejects `CHAIN_ID_MISMATCH`, incl. absent chainId (fail-closed) |
| H11 | HIGH | ColdSign presignGate hardcoded `TIER.ALLOW` | 2026-06-27 | grep: `ColdSign.jsx:160` uses real `degrade(detect(browserProbeSource))`, fails closed to `TIER.BLOCK` |
| H13 | HIGH | CryptoSigning copied private key w/ no wipe timer | 2026-06-26 | grep: `CryptoSigning.jsx:21,270` routes sensitive copies through `copySecret()` |
| H15 | HIGH | Android KEK key not StrongBox-backed | KEK hardening | grep: `HardwareKekPlugin.kt:205` calls `setIsStrongBoxBacked(true)` — see caveat (not *enforced*, best-effort) |
| H16 | HIGH | `AUTH_DEVICE_CREDENTIAL` collapsed biometric factor to PIN | KEK hardening | grep: `HardwareKekPlugin.kt:202` `AUTH_BIOMETRIC_STRONG` only; `DEVICE_CREDENTIAL` removed |
| H-NEW-1 | HIGH | APK tamper check placeholder cert (always false) | 2026-06-28 (PR #442) | grep: `RaspIntegrityPlugin.kt:218-222` reads `BuildConfig.RELEASE_CERT_SHA256`, blank → fail-closed (tampered). Real cert = CI/prod dependency |
| H-NEW-3 | HIGH | copySecret empty-string wipe defeatable | 2026-06-27 | grep: `copySecret.js:62` non-empty `WIPE_REPLACEMENT`; `visibilitychange` (L67/74) + `.catch()` + APP_LOCK trigger |
| H-NEW-4 / M20 | HIGH/MED | H/C/dek not zeroed after `combineKek` | 2026-06-27 | grep: `kek.js:237,258-259` `zero(ikm/H/C)`; `web.js` `.fill(0)` on H/C/kek/dek at all 4 call sites |
| M20 | MEDIUM | `combineKek` internal `ikm` not zeroed | — | grep: `kek.js:237` `zero(ikm)` present (F-06 CryptoKey caveat documented inline) |
| H10 (partial) | HIGH | — see Still Open — |
| I2-LIVEPRICE | MEDIUM | Live-price feed opt-OUT default violated I2 | 2026-07-04 | grep: `priceFeed.js:27` now `=== '1'` (opt-in, OFF by default) |
| RASP-A2 | HIGH | `raspTier ?? TIER.ALLOW` fail-open in SendCrypto | 2026-07-05 | grep: `SendCrypto.jsx:702` now `?? TIER.BLOCK` (fail-closed) |

### Doc / PR-confirmed (not re-grepped this pass)

| ID | Severity | Finding | Fixed in |
|---|---|---|---|
| C5 | CRITICAL | Native `RaspIntegrityPlugin` did not exist | Plugin built; F-09 device-verified 2026-07-12 (mainnet txid `0x4556e2e6…`) |
| C-1 | CRITICAL | Android KEK HMAC input a global fixed constant | v3 salt-binding, PR #568, device-verified 2026-07-05 (Sepolia `0xecd68494…`) — see Regressed note |
| F-04 | CRITICAL | kekSalt v2 binding — `changePassword` double `getHF` H leak | v3 path (PR #568) |
| H8 | HIGH | `personal_sign` address param not validated | PR #443 / #757 (H-1) |
| H14 / H-NEW-D | HIGH | iOS KEK Keychain, not Secure Enclave | `kSecAttrTokenIDSecureEnclave` confirmed `HardwareKekPlugin.m:78` (CLOSED) |
| H-NEW-2 | HIGH | No topic-to-active-session binding before signing | `resolveSessionCaip2` + `assertSessionLive` |
| H-NEW-A | HIGH | native.js KEK key-material zeroing | PR #433 |
| H-NEW-B | HIGH | WC handlers lacked step-up re-auth at chokepoint | PR #443 |
| H-NEW-C | HIGH | personal_sign display/sign param divergence | PR #443 |
| F-01 (07-01) | HIGH | web enrollKek PRF credential loss → lockout | PR #520 |
| F-02 (07-01) | HIGH | web enrollKek double-enroll destroys binding | PR #520 |
| H-4 (07-01) | HIGH | Zero-vector H check absent | PR #522 |
| iOS-F6 | HIGH | iOS JS-layer double-enroll guard missing | PR #521 |
| H-1 (07-01) | HIGH | StrongBox tier not surfaced to user | PR #527 |
| F-01/F-02/F-03 (07-04) | HIGH | web/native KEK error-path zeroing windows | PR #723 |
| iOS-F5 | HIGH | iOS NSData not zeroed post-decryption | device-verified (source+build) 2026-07-07 — heap-dump outstanding |
| iOS-F3 | MEDIUM | Deprecated `kSecUseOperationPrompt` | device-verified 2026-07-07 (PR #705 CI) |
| iOS-F9 | HIGH(gap) | SE-unlock log trace not captured | CLOSED 2026-07-07 (trace + Sepolia `0x8b8f70e7…`) |
| H-2 / iOS-F11 | HIGH | Biometric factor not bound to enrollment set | Android PR #516/#518; iOS 2026-07-08 (iPhone 8 Plus) — both RESOLVED |
| M-A | MEDIUM | Capacitor WebView `allowNavigation` wildcard | PR #442 |
| M-B | MEDIUM | APK tamper check fail-open on blank cert | PR #442 |
| M-F | MEDIUM | clearActionPassword skipped re-auth in decoy/hidden | PR #441 |
| M-G | MEDIUM | evaluateTwoFactor defaulted `actionPasswordConfigured=true` | PR #441 |
| M-H | MEDIUM | setHiddenActionPasswordRecord could re-provision panic salt | PR #440 |
| M-I | MEDIUM | Action Password KDF params unbounded (OOM DoS) | PR #440 |
| M-J | MEDIUM | deriveKekC raw argon2 buffer not zeroed | PR #440 |
| F-03/F-05/F-06/F-08 (07-01) | MED/LOW | web KEK zeroing / PRF-label / cred-ID sequencing | PR #520–#522 |
| M-3 (07-01) | MEDIUM | `detectTamper()` fail-open (`getOrDefault(false)`) | PR #522 (`getOrElse { true }`) |
| H7 no-chainId | HIGH | typed-data with absent `domain.chainId` accepted | fail-closed (07-04 positive confirmation) |
| M-6 (07-08) | MEDIUM | `resolveHiddenBalance` missing I3 guard | PR #757 |
| M-7 (07-08) | MEDIUM | `veyrnox-live-prices` survived panic wipe | PR #757 |
| H-1 (07-08) | HIGH | WC `personal_sign` null-address H8 bypass | PR #757 |
| H-1/M-1/M-2/L-1…L-7 (Codex #783) | H/M/L | Send-page I3 RPC leaks; WC chain/tip validation; zeroing | PR #783 |
| C-01 (07-11) | CRITICAL | RASP pre-sign gate fail-OPEN on native | PR #825 (`selectPresignProbeSource`) |
| PW-#832 / #834 | — | CAUTION ack flow + `riskReady` native send-block | PRs #832/#834 (2026-07-12) |

---

## Still Open ⚠️

| ID | Severity | Finding | File:Line | First reported |
|---|---|---|---|---|
| C1 | CRITICAL | PIN wipe counter in localStorage — resettable by storage imaging (accepted software limit; StrongBox-sealed counting not built) | `pinAttemptGuard.js`, `WalletEntry.jsx:528` | 2026-06-26 |
| C2 | CRITICAL | 8-digit PIN space offline-exhaustible on non-KEK vaults (KEK not enrolled by default) | `vault.js`, `keystore/native.js` | 2026-06-26 |
| H5 | HIGH | `captureVerifierSafe` OOM null permanently bricks send-gate for session (no fix recorded) | `credentialVerifier.js:64` | 2026-06-26 |
| H9 | HIGH | `_pendingProposals` map unbounded / never TTL-evicted (no fix recorded) | `walletconnect/session.js:13` | 2026-06-26 |
| H10 | HIGH | Cert pinning: all SPKI pins are `PLACEHOLDER…REPLACE_ON_DEVICE` — MITM-able; native pin config unbuilt | `rpc/pinning.js:47-62` (grep-confirmed still placeholder) | 2026-06-26 |
| H12 / RASP-3 / RASP-A3 | HIGH | WARN-tier proceeds with no enforced step-up; WC `presignGate` passes `acknowledged=true` unconditionally | `degrade.js`, `presign.js`, `WalletConnectProvider.jsx` | 2026-06-26 |
| H1 | HIGH | Biometric gate app-layer only, not OS Keychain/Keystore ACL (TARGET; M2c/M2d) | `keystore/native.js:43`, `biometricUnlock.js` | 2026-06-26 |
| H2 / H-NEW-5 / BIO-01 | HIGH | Biometric unlock cache not bound to enrollment set (new fingerprint → access, no PIN) | `biometricUnlock.js:84-104` | 2026-06-26 |
| BIO-02 | HIGH | App-layer biometric gate Frida-bypassable on rooted/jailbroken device (fundamental; disclosed) | `biometricUnlock.js:18-36` | 2026-07-05 |
| RASP-A1 | HIGH | RASP browser probe is a module-load snapshot; sign-time gate uses stale data | `browserProbe.js:76`, `SendCrypto.jsx` | 2026-07-05 |
| D-04 | HIGH | I3 egress race: `isDecoy` React state lags module-scope flag (PLAUSIBLE) | `WalletProvider.jsx:316-321` | 2026-07-05 |
| I3-WC | HIGH | WalletConnect relay WebSocket may open in deniability sessions | `WalletConnectProvider.jsx:278-298` | 2026-07-04 |
| H-3 (07-01) | HIGH | Android biometric lockout falls through to device-credential | `BiometricService` | 2026-07-01 |
| M-K | MEDIUM | Passkey assertion `signCount` not persisted (no-backend architecture) | `passkey.js` | 2026-06-28 |
| M-6 (07-07/08) | MEDIUM | iOS-F5 `NSString hB64` bridge copy of H (architectural) | `HardwareKekPlugin.m` | 2026-07-08 |
| M-8 (07-08) | MEDIUM | No AAD binding on base vault blob (folded into independent-audit scope) | `vault.js` | 2026-07-08 |
| M-1 (07-08) | MEDIUM | EVM private key as JS string — architecturally unzeroable (ethers v6) | EVM signing path | 2026-07-08 |
| PW-01 | MEDIUM | In-app guarded wipe requires no re-auth (typing "WIPE" only) | `PanicWipe.jsx:148` | 2026-07-05 |
| D-02 | MEDIUM | Primary-success timing oracle (VULN-17 accepted residual) | `deniabilityUnlock.js:72` | 2026-07-05 |

**Accepted-residual / by-design (open but consciously accepted; see audit docs):** M1–M19, L1–L10 (2026-06-26); M-NEW-1…M-NEW-12 (2026-06-27); F-05/F-11/CS-1/SC-1/RASP-2/RASP-4/RASP-5 (2026-07-04 accepted deviations); D-01/D-05/D-06/SW-01/SW-02/PW-02/PW-04/PW-05/AL-01/AL-02/AL-06/BIO-03/BIO-05/BIO-06/BIO-07/RASP-A4 (2026-07-05). Several are honest-disclosure or forensic-tell items rather than exploitable bypasses; consult the source audit for the per-item rationale and any partial mitigation shipped.

---

## Needs On-Device / On-Chain Verification 📱

| ID | Finding | Why on-device / on-chain needed |
|---|---|---|
| H-NEW-1 | APK tamper detection | Code fails-closed, but the real release-cert SHA-256 must be injected by CI (`-PRELEASE_CERT_SHA256`) and the tamper check exercised on a repackaged APK |
| H10 | Cert pinning | Placeholder SPKI pins must be replaced with real device-observed pins and validated against a MITM proxy on a real build |
| C5 / F-09 | Native RASP integrity | Device-verified 2026-07-12 (Magisk, probe-level); a Frida-hooked device test and iOS device test remain outstanding |
| C-1 v2→v3 migration | Android KEK salt migration | v2→v3 lazy migration BLOCKED on-device (T1 — PIN-cohort divergence between APK-OLD/APK-NEW); unit-tested only (11 tests) |
| iOS-F5 residual | iOS heap-dump zeroing | Source+build verified; heap-dump confirmation of NSData zeroing still outstanding |
| H1 / H2 / BIO-01 / H-NEW-5 | Biometric OS-ACL binding (M2c/M2d) | Requires a native plugin with `setInvalidatedByBiometricEnrollment` / `kSecAccessControlBiometryCurrentSet` on the biometric-unlock cache path + real device |
| M13 / M14 | FLAG_SECURE + WebView CDP disable | Unverified on real release build |
| RASP-A1 | Live vs stale RASP probe | Frida-attach-after-load scenario needs a rooted device to confirm the fix re-samples |
| KEK independent audit | Entire Hardware KEK surface (iOS SE + Android StrongBox) | INTERNAL passes only; independent third-party audit still outstanding |
| Web WebAuthn PRF KEK | Phase 1 browser UAT | e2e/CDP virtual-authenticator only; real platform-authenticator Sepolia txids PENDING |
| M-2 (07-08) | `hw-send.js` Ledger/Trezor | Stub-level unit tests only; physical hardware wallet required |

---

## Regressed 🔴

*No finding is currently in a regressed state.*

Historical regression on record (now re-fixed — documented, not swept away):

| ID | Finding | What broke → resolution |
|---|---|---|
| C-1 | Android KEK per-enrollment salt binding | v2 fix (PR #529) recorded RESOLVED 2026-07-02, then found **cryptographically inert on-device 2026-07-05** (facade arg-drop + Capacitor `JSON.stringify` reverted enroll+unlock to the fixed v1 salt). Re-FIXED same day via v3 (PR #568), device-verified (Sepolia `0xecd68494…`). Current state: FIXED. Salt-tamper (T2) + distinctness (T3) CLOSED 2026-07-07; v2→v3 migration device-exercise still BLOCKED. |

---

*Automated weekly tracker. Static analysis only — does not substitute for on-device or on-chain verification. "FIXED" = the code change is present in the tree; it is not a claim the control is verified working. Independent third-party audit of the vault-cipher path, Hardware KEK, and S1–S4 surfaces remains outstanding.*
