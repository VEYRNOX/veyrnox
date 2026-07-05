# Hardware KEK + Deniability + Network Internal Static-Analysis Audit — 2026-07-04

> ⚠️ INTERNAL STATIC-ANALYSIS PASS — NOT AN INDEPENDENT AUDIT.
> The internal security audit that opened the mainnet gate was completed 2026-06-17.
> The independent ECC third-party audit was completed 2026-06-23.
> This 2026-07-04 pass is an ADDITIONAL INTERNAL review covering key lifecycle,
> deniability stack, send/signing gates, auth/passkey/biometric, RASP, and
> network/egress surfaces. It does NOT satisfy the independent-audit gate condition.
> "Internal" is never presented as "independent" (I4 honesty, CLAUDE.md).

| | |
|---|---|
| **Date** | 2026-07-04 |
| **Pass type** | INTERNAL static-analysis (multi-agent workflow, 55 agents, 367 tool uses) |
| **Scope** | Key lifecycle (`web.js`, `native.js`, `kek.js`, `hardware.js`), deniability stack (`duress.js`, `stealth.js`, `deniabilitySession.js`), send/signing gates (`SendCrypto.jsx`, `WalletConnectProvider.jsx`, `twoFactorGate.js`), auth/passkey/biometric (`passkey.js`, `BiometricUnlockSettings.jsx`, `PasskeyUnlockSettings.jsx`), RASP (`degrade.js`, `compose.js`, `presign.js`, `RaspIntegrityPlugin.kt`), network/egress (`priceFeed.js`, `networks.js`, `WalletConnectProvider.jsx`) |
| **Result** | 1 CRITICAL / 5 HIGH / 10 MEDIUM / 8 LOW actionable findings + 13 accepted deviations + 8 false positives |
| **Remediable findings** | 24 actionable (CRITICAL 1, HIGH 5, MEDIUM 10, LOW 8) |
| **Gate status** | UNCHANGED — independent audit still required before Hardware KEK promotion |
| **ALLOW_MAINNET** | Unchanged (`true`) |

---

## Summary table

| Severity | Total | Actionable | Accepted deviation | False positive / informational |
|----------|-------|------------|-------------------|-------------------------------|
| CRITICAL | 1 | 1 (F-04) | 0 | 0 |
| HIGH | 5 | 5 | 0 | 0 |
| MEDIUM | 10 | 10 | 3 | 2 |
| LOW | 12 | 8 | 5 | 5 |

---

## Confirmed findings — actionable

### [F-04] CRITICAL — kekSalt v2 binding — native.js changePassword double getHF
**Area:** Android/iOS Hardware KEK — native.js
**File:line:** `src/wallet-core/keystore/native.js:506-508`

**Description:** `changePassword()` calls `getHF()` twice: once for the old kekSalt (H, line 506) and again for the new kekSalt (H2, line 508). H is assigned at line 506; the try/finally that would zero it begins at line 516. If the second `getHF()` call throws (user cancels biometric, lockout, etc.), execution unwinds from line 508 before entering the try block — the finally never runs and H (a live hardware-factor byte array) remains in memory. Separately: the double biometric prompt with no UX explanation will confuse users and may cause them to cancel the second prompt, leaving the password change in a partially-completed state.

**Recommendation:**
1. Move the H assignment inside the try block (line 516 onward), or wrap lines 504-515 in their own try/finally that zeroes H before re-throwing.
2. Add UI copy explaining two biometric prompts are required when changing password with hardware KEK enrolled.

---

### [F-01] HIGH — web.js enrollKek — H not zeroed on error path
**Area:** Key zeroing — WebAuthn PRF KEK
**File:line:** `src/wallet-core/keystore/web.js:425`

**Description:** H is assigned at line 425 (`const H = await getHF()`). The try/finally that would zero H begins at line 434. Between lines 425 and 434, three operations can throw: `crypto.getRandomValues` (line 426), `deriveKekC` (line 428, async), `randomDek()` (line 430). If any throw, H is on the heap but the finally at line 444 only zeroes `kek` and `dek` — not H. The prior H-NEW-4/6 zeroing fix covered the inner try/finally but did not close this outer window.

**Recommendation:** Move the try/finally to begin immediately after H is assigned (line 425), and add `H.fill(0)` to the finally clause alongside `kek` and `dek`.

---

### [F-02] HIGH — web.js unenrollKek — secret held on error path
**Area:** Key zeroing — WebAuthn PRF KEK
**File:line:** `src/wallet-core/keystore/web.js:465`

**Description:** `unenrollKek()` decrypts the vault at line 473 (inside a try/finally that correctly zeroes H/C/kek/dek). However, line 481 — `await saveVault(await encryptVault(secret, password))` — is OUTSIDE any try/finally. If `encryptVault()` or `saveVault()` throws (IndexedDB full, I/O error), `secret` (the mnemonic, a JS string) remains live in the local scope. JS strings are immutable and cannot be zeroed, but this is a structural deviation from the codebase's zeroing discipline.

**Recommendation:** Document as a known JS-string limitation. Consider restructuring so re-encryption is verified before `secret` is extracted — extract to a temp variable within the inner try, call `encryptVault` there, then release `secret` scope.

---

### [F-03] HIGH — native.js changePassword — inconsistent zeroing of newSaltBytes
**Area:** Key zeroing — Android/iOS Hardware KEK
**File:line:** `src/wallet-core/keystore/native.js:528`

**Description:** `newSaltBytes.fill(0)` is called inside the try body at line 528 (before `safeWriteVault` at line 529) AND again in the finally block at line 539. Not exploitable (salt is always cleared), but: if `safeWriteVault()` throws after the inline zero, the vault write fails while `newSaltBytes` is already gone — the finally re-zeroes an already-zero buffer. Inconsistent with every other buffer in the same function, which are zeroed exclusively in the finally block.

**Recommendation:** Remove the inline `newSaltBytes.fill(0)` at line 528. Rely solely on the finally block for consistency with the rest of the file.

---

### [RASP-3] HIGH — WARN tier allows signing with no enforced friction on a rooted device
**Area:** RASP / tamper detection
**File:line:** `src/rasp/degrade.js:57-74` and `src/sign-gate/compose.js:67-69`

**Description:** `degrade.js` marks `CONDITION.ROOTED` and `CONDITION.INTEGRITY_UNAVAILABLE` with `requiresBiometric: true`, acknowledged in the module header as TARGET only — "no enforced biometric re-confirm exists." `compose.js` maps `TIER.WARN` to `DECISION.WARN`. In `presign.js:44-45`: `proceedAllowed = gate.signerReachable && (gate.decision !== DECISION.CONFIRM || acknowledged)`. For WARN: `signerReachable=true`, decision ≠ CONFIRM → `proceedAllowed=true` unconditionally. A rooted device reaches the signer with only a displayed warning sentence.

**Recommendation:** Wire a step-up re-auth check when `gate.decision === DECISION.WARN` in `presign.js` before independent audit. Or at minimum, require `acknowledged === true` (user tap) on WARN tier, not just CONFIRM tier.

---

### [I3-WC] HIGH — WalletConnect relay WebSocket opens in deniability sessions (I3 violation)
**Area:** Deniability stack / WalletConnect
**File:line:** `src/lib/WalletConnectProvider.jsx:278-298`

**Description:** `WalletConnectProvider` destructures `{ accounts, isUnlocked, withPrivateKey, isSendReauthRequired }` from `useWallet()` — `isDecoy` and `isHidden` are not read. The `useEffect` at line 295 calls `initWalletConnect()` whenever `isUnlocked && isWalletConnectConfigured()`, with no deniability guard. Under a duress (decoy) unlock, a persistent WebSocket is opened to the WalletConnect relay server, violating I3 (deniability mode makes zero backend calls).

**Recommendation:** Destructure `isDecoy` and `isHidden` from `useWallet()`. Add `&& !isDecoy && !isHidden` to the `useEffect` guard. Call `destroyWalletConnect()` when the session transitions into a decoy/hidden mode.

---

### [F-06] MEDIUM — CryptoKey internal buffer persists after IKM zeroed (undocumented WebCrypto limitation)
**Area:** Key lifecycle — kek.js combineKek
**File:line:** `src/wallet-core/keystore/kek.js:206-207`

**Description:** `zero(ikm)` at line 207 wipes the JS-visible Uint8Array (H‖C concatenation), but `crypto.subtle.importKey('raw', ikm, ...)` at line 206 has already copied H‖C into an opaque internal CryptoKey buffer. That buffer relies on GC for cleanup — no explicit zeroing API exists for CryptoKey internals. Structural WebCrypto limitation, currently undocumented in the code.

**Recommendation:** Add a comment at this site documenting that zeroing `ikm` removes the JS-visible copy; the CryptoKey retains an opaque internal copy until GC. Satisfies the honesty principle (I4: fail honest).

---

### [F-08] MEDIUM — web.js unlock — missing MALFORMED_VAULT check for kdf='kek-dek' without kekWrap
**Area:** Key lifecycle — web.js unlock
**File:line:** `src/wallet-core/keystore/web.js:365-406`

**Description:** When `blob.kekWrap` is absent, the code falls through to bare `decryptVault()` with no check that `blob.kdf !== 'kek-dek'`. A blob with `kdf='kek-dek'` but no `kekWrap` (e.g. storage corruption or partial migration) produces a misleading "wrong password" error rather than a clear `MALFORMED_VAULT` signal. Not an exploitable bypass but can cause user confusion and missed error detection.

**Recommendation:** Add before line 398: `if (blob.kdf === 'kek-dek' && !blob.kekWrap) throw new Error(KEK_ERR.MALFORMED_VAULT)`.

---

### [F-09] MEDIUM — native.js enrollKek — secret (mnemonic string) not zeroed on error path
**Area:** Key zeroing — native.js
**File:line:** `src/wallet-core/keystore/native.js:563`

**Description:** `secret` (the seed mnemonic, a JS string) is assigned at line 563. The inner finally (lines 604-610) zeros H/C/kek/dek/saltBytes (all TypedArrays) but never touches `secret`. On any error path between lines 563 and 603, `secret` remains in the JS heap until GC. Undocumented asymmetry with the TypedArray zeroing pattern.

**Recommendation:** Document as a known JS-string limitation alongside the other TypedArray zeroing comments. Consider a Uint8Array seed representation as a long-term refactor.

---

### [I3-1] MEDIUM — I3 guard missing from wallet-core network-calling modules
**Area:** Deniability — I3 egress
**File:line:** `src/wallet-core/hw/trezor.js:50`, `src/wallet-core/hw/trezorAddress.js:61`

**Description:** `isDeniabilitySessionActive()` is imported only by the two Trezor files. All other I3 gates (CoinGecko price feed, price alert notifier, security centre session registration) are React-level `useWallet()` checks. `fetchLivePricesUsd()` is a named export callable without React context — calling it directly bypasses I3. Future non-React callers (service workers, native plugin callbacks) have no fallback module-level gate.

**Recommendation:** Add `isDeniabilitySessionActive()` guard to any wallet-core function that makes network calls (`fetchLivePricesUsd`, `fetchHistoricalPrices`, etc.), not just the Trezor path.

---

### [F-STORAGE-SCOPE] MEDIUM — Passkey and PRF credential IDs in device-global localStorage (deniability concern)
**Area:** Auth / deniability
**File:line:** `src/lib/passkey.js:74-75`, `src/wallet-core/keystore/web.js:140`

**Description:** `PASSKEY_CRED_KEY` (`veyrnox-passkey-cred-id`) and `PRF_CRED_KEY` (`veyrnox-prf-cred-id`) are written to `window.localStorage` unconditionally with no deniability-mode gate. A seized device reveals that a real wallet is PRF/hardware-KEK enrolled without entering any PIN. Panic wipe does clear both keys — the gap only affects the non-panicked coerced scenario.

**Recommendation:** Document as a known deniability gap in `docs/vault-auth-architecture-brief.md §6b`. Consider tagging `HONEST-DISABLED` if full deniability is not achievable at the storage layer.

---

### [F-PASSKEY-2FA-GLOBAL] MEDIUM — PasskeyUnlockSettings lacks device-global scope disclosure
**Area:** Auth / passkey
**File:line:** `src/components/security/PasskeyUnlockSettings.jsx:107-228`

**Description:** The registered passkey applies device-wide across all wallet sets (primary, decoy, hidden). `TwoFactorSettings.jsx:258` correctly includes "Device-global" in its passkey toggle description — confirming the project knows disclosure is needed — but `PasskeyUnlockSettings.jsx` contains no equivalent disclosure.

**Recommendation:** Add a brief disclosure sentence in `PasskeyUnlockSettings.jsx` that the passkey is device-level, not per wallet set. Consider a different UI state or tooltip when the active set is decoy/hidden.

---

### [F-01-REAUTH] MEDIUM — Step-up re-auth window resets on any credential verify
**Area:** WalletConnect security
**File:line:** `src/lib/WalletConnectProvider.jsx:397-436`, `src/lib/sendReauth.js:8`

**Description:** `REAUTH_WINDOW_MS = 2 min`. `lastAuthAtRef.current = Date.now()` is set at unlock, `createWallet`, `verifyActiveCredential`, and `verifyActiveCredentialDetailed`. Any successful step-up for any general app operation resets the window — a WC signing request within the next 2 minutes skips re-auth. A malicious dApp that triggers a benign auth (e.g. "view seed" prompt) can harvest a clean re-auth window for an immediate subsequent signing request.

**Recommendation:** Use a WC-specific auth timestamp that only resets during WC signing flow auth, or force re-auth unconditionally on every WC signing request.

---

### [F-02-GASCAP] MEDIUM — WalletConnect gas cap (M9) does not clamp maxFeePerGas
**Area:** WalletConnect security
**File:line:** `src/lib/WalletConnectProvider.jsx:250-265`

**Description:** The M9 gas cap clamps `gasLimit` to 1,000,000 but `tx.maxFeePerGas = BigInt(txParams.maxFeePerGas)` and `tx.gasPrice = BigInt(...)` are set directly from dApp-supplied params with no ceiling. A malicious dApp can set `maxFeePerGas` to an arbitrarily large value. The per-chain `MAX_BASE_FEE_GWEI` ceiling (C-4) from `fees.js` is not imported or applied in this handler.

**Recommendation:** Import `MAX_BASE_FEE_GWEI` (or the `buildEvmTiers` cap) and apply it to `maxFeePerGas` in `_handleSendTransaction`.

---

### [I2-LIVEPRICE-DEFAULT-ON] MEDIUM — Live price feed opt-OUT default violates I2 on fresh install
**Area:** Network / egress
**File:line:** `src/lib/priceFeed.js:23-25`

**Description:** `isLivePricesEnabled()` returns `localStorage.getItem(LIVE_PRICE_PREF_KEY) !== '0'`. When the key is absent (fresh install), `null !== '0'` = `true`. The storage-unavailable fallback also returns `true`. The file header comment reads "OPT-IN live USD prices (OFF by default)" and an inline comment reads "ABSENT = off is deliberate" — both directly contradict the code. A new user immediately sends a request to `api.coingecko.com` on first unlock without any consent — a genuine I2 violation.

**Recommendation:** Change default to OFF: `return localStorage.getItem(LIVE_PRICE_PREF_KEY) === '1'`. Change the storage-unavailable fallback from `return true` to `return false`.

---

### [I2-RPC-ADDRESS-EXPOSURE] MEDIUM — EVM address sent to public third-party RPC nodes without user awareness
**Area:** Network / egress
**File:line:** `src/wallet-core/evm/networks.js:41-184`

**Description:** Six hardcoded mainnet RPC endpoints: `eth.llamarpc.com`, and five `*.publicnode.com` chains (Polygon, Arbitrum, Optimism, Avalanche, BSC). The single secp256k1 address is shared across all 6 chains — `publicnode.com` controls 5 of 6 endpoints and can correlate balance reads across all chains to one IP. Only override is `VITE_EVM_RPC_URL_*` (developer-only, no UI exposure). No user-facing disclosure before first balance read.

**Recommendation:** Add a one-time onboarding disclosure about third-party RPC nodes. Provide an in-app RPC override setting. Document as a known privacy gap in `docs/vault-auth-architecture-brief.md`.

---

### [PW-1] LOW — panicWipeLocal does not clear sdw_session_token
**Area:** Deniability / panic wipe
**File:line:** `src/wallet-core/panic.js:520-531`

**Description:** `sdw_session_token` (written by `SecurityCenter.jsx:74-76`, exported as `SESSION_TOKEN_KEY` in `sessionRevocation.js:37`) is absent from `LOCAL_RESIDUE_KEYS`, `DENIABILITY_RESIDUE_KEYS`, and `METADATA_RESIDUE_KEYS`. After a panic wipe it survives — a stable device identifier correlatable against backend UserSession records confirming an active Veyrnox session.

**Recommendation:** Add `'sdw_session_token'` to `DENIABILITY_RESIDUE_KEYS` in `panic.js`. Add a test asserting its absence after a wipe.

---

### [F-03-WC] LOW — WalletConnect signing handlers bypass Action Password / passkey 2FA
**Area:** Send/signing gates
**File:line:** `src/lib/WalletConnectProvider.jsx:392-436`

**Description:** All three WC signing handlers enforce step-up re-auth (`isSendReauthRequired`) and session liveness (`assertSessionLive`), but none call `evaluateTwoFactor`, `resolveSend2faMethod`, or check `twoFactorVerified`. By contrast, `SendCrypto.jsx:675` enforces both. A user with a configured Action Password has it enforced on native sends but not WC signs.

**Recommendation:** Expose `send2faMethod` and `twoFactorVerified` state to the WC signing handlers and enforce the same second-factor gate as `SendCrypto`.

---

### [F-07-WC] LOW — H7 chain binding — sessionCaip2 fallback to caller-supplied value
**Area:** WalletConnect security
**File:line:** `src/lib/WalletConnectProvider.jsx:416-418`

**Description:** `sessionCaip2` resolution: `pendingRequests.find(...)?.params?.chainId ?? caip2ChainId`. In the fallback path, the H7 chain binding check uses a value passed through React component props, not re-read from the live session store (`getActiveSessions()`). A compromised modal component could supply a different `caip2ChainId`. Practical exploitability is low but the trust root should not be a prop.

**Recommendation:** Remove the fallback. Read CAIP-2 chain exclusively from `getActiveSessions()`.

---

### [F-08-TREZOR] LOW — Trezor EVM send path has no maxFeePerGas ceiling
**Area:** Send/signing gates
**File:line:** `src/pages/SendCrypto.jsx:791-815`

**Description:** The Trezor EVM branch constructs `maxFeePerGas` from `provider.getFeeData()` with no per-chain ceiling. `MAX_BASE_FEE_GWEI` is not imported in `SendCrypto.jsx`. An implausibly high RPC-returned fee flows unclamped into the Trezor signing call. Lower severity because the user still approves on the Trezor hardware device.

**Recommendation:** Apply the same `MAX_BASE_FEE_GWEI` ceiling in the Trezor branch, or reuse `buildEvmTiers` for consistency.

---

### [F-10] LOW — web.js changePassword (bare path) — secret not zeroed between decrypt and re-encrypt
**Area:** Key zeroing — web.js
**File:line:** `src/wallet-core/keystore/web.js:560-561`

**Description:** The bare (non-KEK) `changePassword` path: `const secret = await decryptVault(blob, currentPassword); await saveVault(await encryptVault(secret, newPassword));` — no try/finally, no zeroing, no error handling. If `encryptVault` throws, `secret` remains live. Direct structural contrast with the KEK path (lines 504-557) which has extensive zeroing. JS-string limitation applies.

**Recommendation:** Document as a structural JS-string limitation. Wrap in a try/finally that surfaces the error, even if the secret cannot be zeroed.

---

### [FE-1] LOW — isDecoy / isHidden flags exposed in plain WalletContext
**Area:** Deniability
**File:line:** `src/lib/WalletProvider.jsx:1982, 2042`

**Description:** `isDecoy` and `isHidden` are published in the plain WalletContext value object. Any component calling `useWallet()`, any browser extension with page-context access, or a compromised React component can read them. Protection is inline comments only.

**Recommendation:** Move to a separate access-controlled context, or add a lint rule flagging use of these flags in UI-rendering paths outside the deniability stack.

---

### [I2-WC-RELAY-BEFORE-APPROVE] LOW — WalletConnect relay WebSocket opens at unlock, not at pairing
**Area:** Network / egress
**File:line:** `src/wallet-core/evm/walletconnect/session.js:84-103`

**Description:** `initWalletConnect()` opens a persistent WebSocket to the WalletConnect relay at wallet unlock time, not when the user initiates a WC pairing. The relay operator learns a WalletConnect-enabled wallet is online at the user's IP at every unlock. No lazy-init logic, no documentation accepting this as a known design choice.

**Recommendation:** Lazy initialization — only call `initWalletConnect()` when the user explicitly opens the WalletConnect pairing UI.

---

## Accepted deviations

| ID | Severity | Area | Rationale |
|----|----------|------|-----------|
| F-05 | MEDIUM | native.js hfOptsForBlob v1 fallback is fail-open | True v1 blobs fail-closed earlier via `decodeKekSalt` (MALFORMED_VAULT); downgrade attack also fails closed (DEK unwrap fails). Explicitly documented backward-compat intent. |
| F-11 | LOW | web.js enrollKek — no hardwareKekVersion:2 stamp | Architecturally correct: web PRF H is not per-kekSalt-bound; stamping version:2 would misrepresent the protection. Web and native vaults are intentionally structurally distinct. |
| CS-1 | LOW | Container shape tells ('secondary'/'tertiary' keys) | Documented design limitation in code comments at both sites. Neutral key naming is the available mitigation. |
| SC-1 | LOW | Stealth slot collision — POOL_SIZE=256 residual | Birthday-bound residual documented with exact probability math (lines 82-109). Strict collision refusal and count-hiding are mutually exclusive; count-hiding chosen by design. |
| F-PIN-FLOOR | MEDIUM | 8-digit PIN not enforced at PinPad submit gate | Intentional deniability design: a length-gated submit button would reveal whether a shorter decoy PIN is configured. All creation call sites enforce `checkPinStrength()`. |
| RASP-2 | MEDIUM | `navigator.webdriver` trivially bypassable | Probe explicitly documents its scope as browser-observable only (lines 17-24). Never claims to catch OS-level hooks or stealth-mode automation. |
| RASP-4 | LOW | Native RASP plugin — BUILT-UNVALIDATED | Explicitly labeled BUILT-UNVALIDATED. `nativeProbeSource.js` fails closed when unavailable. Phase 4/5 advancement path defined. |
| RASP-5 | LOW | WC presignGate `acknowledged=true` shortcut | User confirmed in WC approval modal before handler fires — the modal IS the acknowledgment. |
| F-04-networks | LOW | ALLOW_MAINNET compile-time DCE | Build-time constant in `networks.js`, not from `import.meta.env`. No runtime bypass path post-build. |
| F-06-WC | LOW | eth_sign blocked at router before signing handler | eth_sign is unconditionally prohibited at the outermost router layer before any handler is reached. Complete coverage. |
| F-05-PASS | LOW | Credential ID persisted only after confirmed PRF output | Sequencing correct and commented. No orphan credential ID on PRF-incapable browsers. |
| F-HA-PASSWORD | LOW | H-A 12-char minimum enforced at createVault and saveVaultContents | Present and correctly gated on ALLOW_MAINNET. Deliberately absent from native.js where hardware KEK is the second factor. |
| I2-CRYPTOCOMPARE | LOW | CryptoCompare API key as per-build correlator | Opt-in only. Inline VULN-14 comment fully acknowledges the I2 trade-off. No per-user tracking. |

---

## Open items from prior passes (not re-verified here — device-gated)

| ID | Severity | Area | Status |
|----|----------|------|--------|
| iOS-F5 | HIGH | iOS — NSData not zeroed post-decryption | OPEN — requires NSMutableData patch + Mac/Xcode build |
| iOS-F3 | MEDIUM | iOS — deprecated kSecUseOperationPrompt | OPEN — requires LAContext + Mac/Xcode build |
| iOS-F9 | HIGH (evidence gap) | iOS — SE unlock log trace not captured for existing Sepolia sends | OPEN — iOS device-verified status remains PARTIAL |
| H-2 / iOS-F11 (iOS half) | HIGH | iOS — biometric re-enrollment invalidation test device-blocked | OPEN — requires unrestricted iPhone (Face ID enrollment restricted on test device) |

All four unchanged since the 2026-07-01 internal audit. None remediated or closed.

---

## Positive confirmations (selected)

- **C-1 (Android HMAC fixed input):** RESOLVED / device-verified 2026-07-02. PR #529 merged (commit 732f9676), Sepolia txid `0xeb71a5d31a8794682cf681d8ebb2916967c1097e951519dcf1b53327d2d8e580`.
- **F-02 (double-enroll guard):** `if (blob.kekWrap) throw KEK_ALREADY_ENROLLED` confirmed present at `web.js:422` — fail-closed.
- **F-03 (PRF salt label):** "Veyrnox-prf-kek-v1-fixed-salt!!!" confirmed. Dev artefact "prf-spike" removed.
- **ALLOW_MAINNET gate:** Build-time constant, DCE confirmed, no runtime bypass.
- **M-3 detectTamper() fail-closed:** `getOrElse { true }` confirmed in `RaspIntegrityPlugin.kt:252-257`.
- **H7 chain binding (no absent chainId):** eth_signTypedData_v4 rejects absent `domain.chainId` — fail-closed.
- **deniabilityUnlock.js constant-timing:** `PRIMARY_UNLOCK_EQUALIZER_MS = 1500` applied unconditionally at WalletProvider.jsx:1451.
- **I3 price alert notifier:** Correctly gates on `!isDecoy && !isHidden` with proper React dep arrays and cleanup.

---

> ⚠️ INTERNAL STATIC-ANALYSIS PASS — NOT AN INDEPENDENT AUDIT.
> Date: 2026-07-04. 55 agents, 367 tool uses, 6 domain scans + adversarial verify.
> "Internal" is never presented as "independent" (I4 honesty, CLAUDE.md).
> Gate status UNCHANGED — independent audit required for Hardware KEK mainnet promotion.
