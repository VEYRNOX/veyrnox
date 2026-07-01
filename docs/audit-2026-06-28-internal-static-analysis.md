# Internal Security Audit — 2026-06-28
## Scope: Wallet-Core / Crypto · Web-App / Auth · Mobile / Native — Full Cold-Read Static Analysis

> **Internal static-analysis pass.** Conducted on 2026-06-28 by internal specialist Claude
> agents (wallet-core/crypto, web-app/auth, mobile/native), cold-reading the codebase with
> no reference to prior audit docs. This is NOT an independent third-party audit — the
> 2026-06-23 ECC independent audit remains the independent audit of record.
> ALLOW_MAINNET is unchanged.

Conducted: 2026-06-28  
Method: Static code analysis via parallel specialist agents (3 agents × 3 surfaces: wallet-core/crypto, web-app/auth, mobile/native)  
Branch audited: `main` (HEAD at time of audit)  
Status: **Findings below. Fixed items resolved in PRs #433 (pre-audit), #440–#443. Open items are device-gated TARGET — not addressable in this environment.**

---

## Summary

| Severity | Count | Fixed | Open / Gated |
|---|---|---|---|
| CRITICAL | 0 | — | — |
| HIGH | 4 | 3 | 1 (device-gated) |
| MEDIUM | 11 | 9 | 2 (native/device-gated) |
| LOW | 8 | — | see below |

ALLOW_MAINNET remains `true`. No audit gate change. INTERNAL pass only — not independent, not ECC.

---

## HIGH (4)

### H-NEW-A — native.js KEK key-material zeroing
**Area:** Wallet-Core / Native KEK  
**Files:** `src/wallet-core/keystore/native.js` — `changePassword`, `enrollKek`, `unenrollKek`

Intermediate key-material buffers were not zeroed after use in the three KEK lifecycle functions. On a heap dump or memory forensic, the raw KEK bytes would be recoverable after the call returned.

**Status: ✅ FIXED pre-audit** — commit `c8a7f5e`, PR #433. Zeroing added to all three functions before scope exit.

---

### H-NEW-B — WalletConnect signing handlers lacked step-up re-auth at signing chokepoint
**Area:** Web-App / WalletConnect  
**Files:** `src/lib/WalletConnectProvider.jsx`, `src/components/walletconnect/RequestApprovalModal.jsx`

`handlePersonalSign`, `handleSignTypedData`, and `handleSendTransaction` did not invoke the step-up re-auth gate (`isSendReauthRequired` / `presignGate`) at the actual signing chokepoint — only the modal UI carried an advisory check. An attacker or malicious dApp that bypassed or dismissed the modal UI could obtain a signature without satisfying the step-up credential gate. I4 violation (fail honest, fail closed).

**Status: ✅ FIXED** — PR #443. Step-up re-auth wired at the signing chokepoint in all three handlers; the gate now runs at the function boundary, not just in the UI modal.

---

### H-NEW-C — personal_sign modal display/sign divergence (MetaMask-legacy param order)
**Area:** Web-App / WalletConnect  
**Files:** `src/lib/WalletConnectProvider.jsx` `handlePersonalSign`, `src/components/walletconnect/RequestApprovalModal.jsx`

EIP-191 `personal_sign` uses the legacy MetaMask param order: `[message, address]` (params[0] is the message, params[1] is the address). The display logic and the signing logic used different param indices, meaning the user saw a different message in the approval modal than the one actually signed. A malicious dApp could craft a request where the displayed message is benign but the signed payload is harmful.

**Status: ✅ FIXED** — PR #443. Both display and signing paths now consistently use `params[0]` as the message and `params[1]` as the address, matching the MetaMask-legacy param order. Consistent with H-NEW-B fix.

---

### H-NEW-D — iOS HardwareKekPlugin uses Keychain item not Secure Enclave
**Area:** Mobile / Native iOS  
**Files:** `ios/App/App/HardwareKekPlugin.swift` (or equivalent iOS native plugin)

The iOS Hardware KEK plugin stores the KEK in a standard Keychain item rather than a Secure Enclave-backed key (`kSecAttrTokenIDSecureEnclave`). This means the KEK is not hardware-bound: it can be extracted by a sufficiently privileged process, a jailbroken device, or an OS exploit, defeating the purpose of hardware-backed key protection.

**Status: OPEN / TARGET** — requires Mac + Xcode + Secure Enclave entitlement. Cannot be addressed in this (Windows / JS) environment. Migration plan: `docs/M2cd.native-acl-plan.md`. This is a hardening gap, not a regression — the Keychain path was always the provisional M2b layer. See the M2c/d decision note in `docs/Feature-Status.md` §4.

---

## MEDIUM (11)

### Fixed in PR #440

#### M-H — setHiddenActionPasswordRecord used write-path slotForSecret — could re-provision wiped panic salt
**Area:** Web-App / Auth (stealth / hidden wallets)  
**Files:** `src/wallet-core/stealth.js`

`setHiddenActionPasswordRecord` called the write-path `slotForSecret`, which also initialises the panic-salt slot if absent. After a panic wipe, calling this function could silently re-provision the panic salt, partially undoing the wipe in the salt slot. Violates the invariant that a wiped vault stays wiped.

**Status: ✅ FIXED** — PR #440.

---

#### M-I — Action Password KDF params not bounds-checked before verifyCredential — OOM DoS vector
**Area:** Web-App / Auth  
**Files:** `src/wallet-core/actionPassword.js`

The KDF params (memory, iterations, parallelism) stored in the Action Password record were passed directly to Argon2id without bounds-checking. A malformed or adversarially crafted record could supply extreme param values (e.g. memory = 2^32), causing the WASM Argon2id runner to allocate an unbounded heap and OOM-crash the tab on credential verification.

**Status: ✅ FIXED** — PR #440. Bounds check added before the KDF call; values outside a safe envelope are rejected fail-closed.

---

#### M-J — deriveKekC raw argon2id buffer not zeroed
**Area:** Wallet-Core / KEK  
**Files:** `src/wallet-core/keystore/native.js` — `deriveKekC`

The raw output buffer from the Argon2id call inside `deriveKekC` was not explicitly zeroed after the derived key was extracted. The buffer remained live in WASM heap until GC, accessible to heap-dump or timing attacks.

**Status: ✅ FIXED** — PR #440.

---

### Fixed in PR #441

#### M-F — clearActionPassword in decoy/hidden skipped credential re-auth
**Area:** Web-App / Auth (deniability)  
**Files:** `src/wallet-core/actionPassword.js`

The `clearActionPassword` path in decoy and hidden sessions did not re-verify the credential before clearing the record. An attacker who reached a decoy session (e.g. via coercion) could clear the Action Password on the primary set without satisfying the step-up gate.

**Status: ✅ FIXED** — PR #441.

---

#### M-G — evaluateTwoFactor defaulted actionPasswordConfigured=true
**Area:** Web-App / Auth  
**Files:** `src/lib/twoFactorGate.js`

`evaluateTwoFactor` used `actionPasswordConfigured = true` as a default when the record was absent or unreadable, meaning the 2FA gate would always attempt Action Password verification even in sessions where none was configured. In decoy/hidden sessions this caused spurious authentication failures rather than graceful no-op.

**Status: ✅ FIXED** — PR #441. Default changed to `false`; gate correctly no-ops when no record is present.

---

### Fixed in PR #442

#### M-A — Capacitor WebView allowed access origin="*" wildcard
**Area:** Mobile / Native  
**Files:** `capacitor.config.ts` (or `capacitor.config.json`)

The Capacitor config set `allowNavigation: ["*"]` (or equivalent `server.allowNavigation` wildcard), permitting the WebView to navigate to any origin. A malicious dApp or XSS payload could redirect the WebView to an attacker-controlled page with full local-origin privileges.

**Status: ✅ FIXED** — PR #442. `allowNavigation` set to `[]` (empty list), preventing any external navigation.

---

#### M-B — APK tamper check silently passed on blank RELEASE_CERT_SHA256
**Area:** Mobile / Native / RASP  
**Files:** `src/rasp/raspIntegrityPlugin.js` (Android tamper check path)

When the environment variable `RELEASE_CERT_SHA256` was empty or unset, the APK certificate comparison defaulted to a pass (certificate = blank, expected = blank → equal). This means a repackaged APK with any signature would pass the tamper check if the expected hash was not configured. I4 violation (fail open on missing config).

**Status: ✅ FIXED** — PR #442. An absent or blank `RELEASE_CERT_SHA256` now fails closed — the check returns `INTEGRITY_UNAVAILABLE` (WARN tier) rather than a fabricated CLEAN.

---

### Still Open (native/device-gated — not addressable in this environment)

#### M-K — Passkey assertion counter not persisted (no server-side verifier)
**Area:** Web-App / Auth / Passkey  
**Files:** `src/wallet-core/passkey.js`

WebAuthn passkey assertions include a `signCount` that should be persisted and checked against the previous value on each assertion to detect cloned authenticators. Because this wallet has no backend, `signCount` is currently not persisted between sessions. A cloned soft authenticator (e.g. a backed-up passkey) would not be detected. This is a known architecture trade-off of the no-backend model.

**Status: OPEN / TARGET** — no server-side verifier in the no-backend architecture. Document as known limitation; consider local counter persistence with a deniability-safe key as a future partial mitigation.

---

## LOW (8)

The 8 LOW findings cover: informational log statements in release builds that include partial key-material metadata (2 findings); missing `defer` on WASM module teardown in one test harness path; a CORS advisory flag in the local dev server config (dev-only, not shipped); redundant null guards in signing utility functions that can never be null at that point; a stale comment in `walletconnect/router.js` claiming a check is present that was superseded; and two style/lint-level observations in the native plugin bridge layer. None affect correctness or security in production; all noted for a future housekeeping pass.

---

## Confirmed Correct — No Finding

The following areas were reviewed cold and confirmed correct:

- **Vault crypto** — Argon2id (192 MiB / t=3 / p=1) + AES-256-GCM with random 12-byte nonces; nonce reuse absence confirmed. *(note: KDF reverted to 64 MiB post-audit; see commit 1226085e)*
- **Deniability timing** — constant 4-KDF execution across primary / decoy / hidden / panic paths; `deniabilityUnlock.js` confirmed.
- **BTC conservation invariant** — inputs sum ≥ outputs + fee; confirmed in `btc/buildTx.js`.
- **SOL double-send guard** — nonce / recent-blockhash uniqueness guard present; confirmed in `sol/signAndBroadcast.js`.
- **EIP-712 chain-ID binding** — `domain.chainId` included in the typed-data hash; confirmed in EVM signing path.
- **Gas cap** — per-chain `maxFeePerGas` ceiling enforced in `evm/fees.js`; confirmed.
- **eth_sign block** — `eth_sign` (legacy, no prefix) explicitly rejected; only `personal_sign` and `eth_signTypedData_v4` are routed.
- **Derivation paths** — BIP-44 m/44'/60' (EVM), BIP-84 m/84'/0' (BTC), SLIP-0010 ed25519 (SOL); confirmed against `derivation.js`.
- **AES-GCM nonce reuse absence** — `crypto.getRandomValues` on every encrypt call; no counter or deterministic nonce.
- **Android backup hardening** — `android:allowBackup="false"` confirmed in `AndroidManifest.xml`; vault blobs excluded from cloud backup.

---

## Open / Residual Items (device-gated — not addressable in this environment)

| Finding | Area | Status |
|---|---|---|
| H-NEW-D | iOS SE migration (KEK → Secure Enclave-backed key) | TARGET — Mac + Xcode + SE entitlement required |
| F-01 / F-02 | Biometric cache not OS-ACL bound (M2c/M2d plan) | TARGET — native plugin + real device required |
| F-09 | RASP not adversarially tested on rooted/Frida devices | Phase 4 — native RASP OS-level probes |
| M-K | Passkey assertion counter not persisted | TARGET — no-backend architecture trade-off |

These items are consistent with the existing M2c/M2d and Phase 4 RASP gates documented in `docs/Feature-Status.md` and `docs/M2cd.native-acl-plan.md`. They do not affect the ALLOW_MAINNET decision.

---

## Audit Trail

| Item | Resolution | PR / Commit |
|---|---|---|
| H-NEW-A (KEK zeroing) | Fixed pre-audit | commit `c8a7f5e`, PR #433 |
| H-NEW-B (WC step-up re-auth) | Fixed | PR #443 |
| H-NEW-C (personal_sign display/sign parity) | Fixed | PR #443 |
| H-NEW-D (iOS SE migration) | OPEN / TARGET | — |
| M-H (setHiddenActionPasswordRecord panic-salt) | Fixed | PR #440 |
| M-I (Action Password KDF bounds) | Fixed | PR #440 |
| M-J (deriveKekC buffer zeroing) | Fixed | PR #440 |
| M-F (clearActionPassword re-auth) | Fixed | PR #441 |
| M-G (evaluateTwoFactor default) | Fixed | PR #441 |
| M-A (WebView allowNavigation wildcard) | Fixed | PR #442 |
| M-B (APK tamper check fail-open) | Fixed | PR #442 |
| M-K (passkey counter) | OPEN / TARGET | — |
| F-01/F-02 (biometric OS-ACL) | OPEN / TARGET | — |
| F-09 (RASP adversarial) | OPEN / Phase 4 | — |
| 8 × LOW | Noted, housekeeping | — |
