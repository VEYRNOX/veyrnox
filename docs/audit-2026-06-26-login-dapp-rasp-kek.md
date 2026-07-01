# Internal Security Audit — 2026-06-26
## Scope: Login Activity · dApp Connectors · RASP · Hardware KEK / Secure Enclave

> **Internal static-analysis pass.** This audit was conducted by internal Claude specialist
> agents (not a third-party auditor). It consists of static code review only — no dynamic
> testing, no on-device verification, and no independent sign-off. An independent third-party
> audit remains RECOMMENDED for the strongest assurance (see CLAUDE.md §Hard rules).

Conducted: 2026-06-26  
Method: Static code analysis via parallel specialist agents (secskills:mobile-pentester × 4)  
Branch audited: `wc-2fa-test-tmp` (current HEAD at time of audit)  
Status: **Findings only — nothing fixed. Do not mark anything verified without on-chain txid or on-device evidence.**

---

## CRITICAL (5)

### C1 — PIN wipe counter bypassable by storage imaging
**Area:** Login Activity  
**File:** `src/lib/pinAttemptGuard.js`, `src/components/WalletEntry.jsx:528`

The 10-attempt auto-wipe counter (`veyrnox-pin-attempts`) and backoff deadline (`veyrnox-pin-backoff-until`) live in `localStorage`. An attacker who images the device storage before the first guess can restore the snapshot after every 9 attempts, resetting the counter indefinitely. Combined with C2, the 8-digit PIN space is exhaustible offline with no attempt accounting.

**Honest status:** Accepted software limit. Hardware-sealed attempt counting (StrongBox) is the planned mitigation — not yet built.

---

### C2 — 8-digit PIN space offline-exhaustible on non-KEK-enrolled vaults
**Area:** Login Activity  
**File:** `src/wallet-core/vault.js:51`, `src/wallet-core/keystore/native.js`

For vaults without Hardware KEK enrollment (the current default for all users), the vault blob is protected solely by Argon2id at 192 MiB / t=3 / p=1. *(note: KDF reverted to 64 MiB post-audit; see commit 1226085e)* At ~440 ms/attempt on desktop, the full 10^8 space takes ~12,800 CPU-hours — feasible on a GPU cluster. The hardware KEK layer that would bind decryption to the secure element is UNAUDITED-PROVISIONAL and not enrolled by default. Until KEK is audited and enabled by default, a seized device allows offline exhaustion of all 8-digit PINs.

---

### C3 — RASP / presignGate entirely absent from WalletConnect signing path
**Area:** dApp Connectors  
**File:** `src/lib/WalletConnectProvider.jsx:116-179`

`handlePersonalSign`, `handleSignTypedData`, and `handleSendTransaction` call `withPrivateKey` directly. Neither `presignGate` nor `composeGate` is imported or invoked. The RASP chokepoint that guards `SendCrypto.jsx` and `ColdSign.jsx` is completely bypassed for every WalletConnect signing operation. An attacker who achieves RASP-BLOCK-level conditions (emulator, rooted device, Frida hook) is blocked from the in-app Send flow but can still exfiltrate signatures via a connected dApp. Violates I4 (fail honest, fail closed).

---

### C4 — Request-time phishing check always suppressed (reads non-existent `proposer` field)
**Area:** dApp Connectors  
**File:** `src/components/walletconnect/RequestApprovalModal.jsx:139`

`session_request` events carry no `proposer` field (only `session_proposal` does). The code reads `request.params?.proposer?.metadata`, which always evaluates to `undefined`. `checkDappDomain(undefined)` returns `flagged: false`, silently suppressing the phishing banner for every signing request. The domain check at proposal time fires correctly but cannot protect against a dApp that passes an innocuous URL at connect time and sends malicious requests later.

---

### C5 — Native RaspIntegrityPlugin does not exist
**Area:** RASP  
**File:** `src/rasp/raspIntegrityPlugin.js`, `android/app/src/main/java/com/veyrnox/app/`

The Capacitor plugin `RaspIntegrity` is registered in JS but no corresponding `RaspIntegrityPlugin.kt` exists. On invocation the bridge rejects; `nativeProbeSource()` returns `{ available: false }`; `detect()` maps this to `CONDITION.INTEGRITY_UNAVAILABLE → TIER.WARN` (proceed-allowed). Root, emulator, Frida hook, and APK tamper detection are all entirely absent. An attacker on a rooted device with Frida attached transacts freely.

---

## HIGH (16)

### H1 — Biometric gate is app-layer only, not OS Keychain/Keystore ACL
**Area:** Login Activity  
**File:** `src/wallet-core/keystore/native.js:43`, `src/lib/biometricUnlock.js:18`

Neither `kSecAccessControlBiometryCurrentSet` (iOS) nor `setUserAuthenticationRequired` (Android Keystore) is used. The Keychain item requires only `whenPasscodeSetThisDeviceOnly`. On a jailbroken device, the item is readable without biometrics. The cached vault password in the biometric-unlock module (`veyrnox_bio_unlock_secret`) has identical protection.

---

### H2 — Biometric cache has no auto-invalidation on enrollment changes
**Area:** Login Activity  
**File:** `src/lib/biometricUnlock.js:40`

No `.biometryCurrentSet` is used, so adding a new fingerprint does not invalidate the cached credential. A coercer who enrolls their own fingerprint retains access to the cached vault password. Documented known limitation; flagged for independent audit.

---

### H3 — Timing equalizer calibrated to old KDF params (300ms vs ~1.7s current)
**Area:** Login Activity  
**File:** `src/lib/WalletProvider.jsx:168`

`PRIMARY_UNLOCK_EQUALIZER_MS = 300` was calibrated to the old 64 MiB Argon2id cost. KDF params were raised to 192 MiB (~440ms desktop / ~1.7s mobile). *(note: equalizer raised to 1500ms and KDF reverted to 64 MiB post-audit; see commit 1226085e)* The equalizer now undershoots the deniability-path cost, reopening a timing side-channel between correct-primary and all other outcomes.

---

### H4 — Two-factor gate leaks which factor was wrong
**Area:** Login Activity  
**File:** `src/lib/twoFactorGate.js:64`

Returns distinct codes `PIN_WRONG`, `PASSWORD_WRONG`, `BOTH_WRONG` with distinct user-facing messages. Allows interactive adversary to brute-force PIN and Action Password sequentially rather than simultaneously.

---

### H5 — `captureVerifierSafe` OOM null silently bricks send-gate for session
**Area:** Login Activity  
**File:** `src/wallet-core/credentialVerifier.js:64`, `src/lib/WalletProvider.jsx:1418`

If `captureVerifierSafe` returns `null` (Argon2id OOM), step-up re-auth becomes permanently unsatisfiable for the session with no user-visible explanation. Recovery requires re-lock/re-unlock.

---

### H6 — `eth_signTypedData` (v1) and v3 routed identically to v4
**Area:** dApp Connectors  
**File:** `src/wallet-core/evm/walletconnect/router.js:17`

V1 uses different encoding (array of `{type,name,value}`, no domain separator); v3 uses different `encodeData` for certain type references. Signing these with v4 semantics produces a different hash. A malicious dApp can exploit the encoding divergence to produce a digest different from what the user sees described.

---

### H7 — EIP-712 domain `chainId` never validated against WC session chain
**Area:** dApp Connectors  
**File:** `src/lib/WalletConnectProvider.jsx:125`

A dApp on Sepolia (chainId 11155111) can submit typed-data with `domain.chainId = 1`. The resulting signature is valid as a Permit or order on Ethereum mainnet. Cross-chain replay vector for Permit/Permit2 drain attacks.

---

### H8 — `personal_sign` address param not validated
**Area:** dApp Connectors  
**File:** `src/lib/WalletConnectProvider.jsx:114`

`params[0]` used as the hex message without checking that `params[1]` matches the wallet's own address. Reversed-order payloads (legacy MetaMask convention) sign the address bytes as the message.

---

### H9 — `_pendingProposals` map unbounded and never TTL-evicted
**Area:** dApp Connectors  
**File:** `src/wallet-core/evm/walletconnect/session.js:13`

Proposals are inserted on `session_proposal` and only removed on approve/reject. A dApp that dismisses the modal without pressing Reject leaks entries indefinitely. Repeated spamming fills the map; stale proposal IDs could trigger a later `approveSession` race.

---

### H10 — Certificate pinning: all SPKI pins are placeholder strings
**Area:** RASP  
**File:** `src/wallet-core/rpc/pinning.js:47`

All 16 entries use `sha256/PLACEHOLDER_*_REPLACE_ON_DEVICE=`. No OkHttp `CertificatePinner` or `network_security_config.xml` pin block exists. Mainnet is live; all RPC traffic to EVM/BTC/SOL endpoints is MITM-able with any CA-trusted certificate.

---

### H11 — `ColdSign.jsx` presignGate hardcoded ALLOW
**Area:** RASP  
**File:** `src/pages/ColdSign.jsx:152`

`presignGate(TIER.ALLOW, "allow", riskAck)` always passes. The broadcast path has zero RASP enforcement regardless of environment state.

---

### H12 — WARN-tier biometric re-confirm unbuilt — rooted device proceeds
**Area:** RASP  
**File:** `src/rasp/degrade.js:55`

`requiresBiometric: true` is returned for `CONDITION.ROOTED` and `CONDITION.INTEGRITY_UNAVAILABLE` but the field is consumed by nothing. `presignGate(TIER.WARN)` returns `proceedAllowed: true` immediately. A detected rooted device signs freely.

---

### H13 — `CryptoSigning.jsx`: no RASP gate + private key copied with no wipe timer
**Area:** RASP  
**File:** `src/pages/CryptoSigning.jsx:34, 170`

No `presignGate` call anywhere in this file. The local `copy()` helper copies `wallet.privateKey` via `navigator.clipboard.writeText()` with no wipe timer — key persists in clipboard history indefinitely. Also copies mnemonic without `copySecret()`.

---

### H14 — iOS KEK plugin stores key in Keychain, not Secure Enclave — naming is misleading
**Area:** Hardware KEK  
**File:** `ios/App/App/HardwareKekPlugin.swift:46`

Uses `kSecClassGenericPassword` Keychain item, not `kSecAttrTokenIDSecureEnclave`. The class name implies SE; the implementation is standard Keychain. On a jailbroken device, Keychain items are more extractable than non-migratable SE private keys. Violates I4 — the claim of "Secure Enclave" is materially incorrect.

---

### H15 — Android KEK key generated without `setIsStrongBoxBacked(true)`
**Area:** Hardware KEK  
**File:** `android/app/src/main/java/com/veyrnox/app/HardwareKekPlugin.kt:53`

Key silently lands in TEE or software depending on device. Architecture docs specify StrongBox-with-TEE-fallback but the implementation does neither. The security level of the hardware factor is unknown at runtime.

---

### H16 — `DEVICE_CREDENTIAL` permitted as KEK authenticator
**Area:** Hardware KEK  
**File:** `android/app/src/main/java/com/veyrnox/app/HardwareKekPlugin.kt:60`

`AUTH_BIOMETRIC_STRONG or AUTH_DEVICE_CREDENTIAL` means the device PIN can always authorize the HMAC operation. A coercer who knows the device PIN bypasses the biometric second factor entirely, even after biometric re-enrollment invalidates the key.

---

## MEDIUM (20)

| # | Area | Finding | File |
|---|---|---|---|
| M1 | Login | PIN attempt limiting in UI only — vault layer has no rate limit | `WalletEntry.jsx:543` |
| M2 | Login | Session UUID in localStorage + backend call from LoginActivity — I2/I3 in decoy session | `SecurityCenter.jsx:65`, `LoginActivity.jsx:79` |
| M3 | Login | Passkey UNAVAILABLE silently downgrades 2FA→1FA if call-site ignores return | `WalletProvider.jsx:1209` |
| M4 | Login | PIN backoff timer in localStorage — clearable to reset lockout | `WalletEntry.jsx:529` |
| M5 | Login | Native duress vault in IndexedDB, not hardware-backed Keychain | `duress.js:53` |
| M6 | Login | `revealWalletMnemonic` requires no re-auth — any in-session context caller extracts all seeds | `WalletProvider.jsx:997` |
| M7 | Login | `LoginActivity.jsx` makes backend call in decoy session — I3 violation | `LoginActivity.jsx:79` |
| M8 | dApp | `wc:` URI only `.trim()`'d before SDK — no structural validation | `walletconnect/session.js:61` |
| M9 | dApp | 1M gas cap bypassed when dApp omits `gas` field — ethers auto-estimates with no cap | `WalletConnectProvider.jsx:168` |
| M10 | dApp | Phishing blocklist (4 entries) shown without honesty caveat — silence reads as safe | `knownBadDapps.js`, `SessionProposalModal.jsx:64` |
| M11 | dApp | WC session expiry displayed but not enforced client-side | `ActiveSessions.jsx:24` |
| M12 | dApp | Optional namespace chains merged into approval but hidden from user in proposal UI | `WalletConnectProvider.jsx:99` |
| M13 | RASP | FLAG_SECURE on Capacitor WebView — unverified on real device | `MainActivity.java:19` |
| M14 | RASP | WebView CDP disable unverified on real release build | `MainActivity.java:30` |
| M15 | RASP | Clipboard wipe bypassed in `CryptoSigning.jsx` and `HDWalletManager.jsx` | `CryptoSigning.jsx:34`, `HDWalletManager.jsx:139` |
| M16 | RASP | `minifyEnabled false` — wallet logic, RPC URLs, RASP policy readable in APK | `android/app/build.gradle:25` |
| M17 | KEK | `isEnrolled()` returns `true` for permanently-invalidated key | `HardwareKekPlugin.kt:86` |
| M18 | KEK | `clearCredential()` requires no auth — Frida can delete KEK, rendering vault unrecoverable | `HardwareKekPlugin.kt:99` |
| M19 | KEK | iOS `errSecAuthFailed` misclassified as enrollment-change — biometric lockout triggers key deletion | `HardwareKekPlugin.swift:137` |
| M20 | KEK | H and C Uint8Arrays not zeroed after `combineKek` — highest-sensitivity intermediates linger in JS heap | `kek.js:107` |

---

## LOW (selected)

| # | Area | Finding |
|---|---|---|
| L1 | Login | `REAUTH_WINDOW_MS` (2 min) not configurable — 2-min physical-access window before step-up fires |
| L2 | Login | Duress vault at known IndexedDB key `'secondary'` — two-blob presence is a forensic tell |
| L3 | Login | Wipe marker `veyrnox-wiped` persists on seized device — announces wipe occurred, deniability concern |
| L4 | dApp | `destroyWalletConnect` on lock sends no `USER_DISCONNECTED` — dApp keeps sessions open |
| L5 | dApp | `normalizeDomain` strips `www.` only — `subdomain.phishingsite.xyz` bypasses blocklist |
| L6 | RASP | Browser automation detection trivially bypassable by Frida patching `navigator.webdriver` |
| L7 | RASP | No `filterTouchesWhenObscured` — overlay/tapjacking unmitigated on PIN pad and Send |
| L8 | KEK | `kekWrap`/`kekSalt` cleartext in vault blob — reveals KEK enrollment to blob reader (coercion oracle) |
| L9 | KEK | `isSecureHardwareAvailable()` returns passcode-present, not hardware-backed — callers may misrepresent level |
| L10 | KEK | `deriveKekC` uses current global `KDF_PARAMS` — raising params in future will lock out existing KEK vaults |

---

## INFO / PASS

| Finding |
|---|
| ✅ `eth_sign` and `wallet_addEthereumChain` correctly blocked in WC |
| ✅ RASP UI (`RaspSecurity.jsx`) is honest — no I4 / fake-security violation found |
| ✅ Hardware KEK is genuinely built and operative (not a stub) — `HardwareKekPlugin.kt` and `.swift` are real implementations |
| ✅ `degrade()` fail-closed default and `presignGate()` BLOCK path are structurally sound |
| ✅ Browser automation detection (`navigator.webdriver`) genuinely wired to send gate |
| ✅ Data backup exclusion rules (`data_extraction_rules.xml`) correctly implemented |
| ✅ Chain ID verified against live RPC at WC transaction broadcast time |
| ⚠️ No key attestation — Android Key Attestation not implemented; hardware-backing of KEK cannot be cryptographically verified |
| ⚠️ H value (HMAC output) is deterministic and replay-capable — static secret semantics, not per-session challenge |

---

## Critical chain (highest combined risk)

**C3 + H7 + C5:**
1. dApp on Sepolia submits EIP-712 payload with `domain.chainId = 1` (mainnet)
2. ChainId not validated against WC session chain (H7)
3. RASP presignGate not wired to WC path (C3)
4. Native RASP plugin absent so environment is WARN/proceed regardless (C5)
5. → Valid mainnet Permit/Permit2 drain signature produced from any environment including rooted/emulated device

**Recommended fix order:** C3 (presignGate wiring) → C4 (phishing fix) → H7 (chainId validation) → H13 (CryptoSigning clipboard) → H14/H15/H16 (KEK hardening, audit-gated)

---

*This report was produced by static code analysis. Controls marked TARGET/PLANNED/UNAUDITED-PROVISIONAL require real-device verification and independent audit sign-off before being treated as enforced. Per project policy (CLAUDE.md §I4): "never mock a security control to look real."*
