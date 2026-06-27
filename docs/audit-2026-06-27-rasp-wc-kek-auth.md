# Internal Security Audit — 2026-06-27
## Scope: RASP (incl. RaspIntegrityPlugin.kt) · WalletConnect Signing Paths · Hardware KEK · Auth Gates

> **Internal static-analysis pass.** Conducted by internal Claude specialist agents
> (secskills:mobile-pentester, secskills:web3-auditor, secskills:pentester) in parallel.
> Static code review only — no dynamic testing, no on-device verification, no independent
> sign-off. An independent third-party audit remains RECOMMENDED (see CLAUDE.md §Hard rules).

Conducted: 2026-06-27  
Method: Static code analysis via parallel specialist agents (3 agents × 3 surfaces)  
Branch audited: `fix/rasp-integrity-plugin` (HEAD at time of audit)  
Status: **Findings only — nothing fixed. Do not mark anything verified without on-chain txid or on-device evidence.**

---

## CRITICAL (1 new)

### C6 — Private keys stored in React state in CryptoSigning.jsx
**Area:** Key Material Handling  
**File:** `src/pages/CryptoSigning.jsx:48, 68–69`

`derivedWallets` state holds `{ privateKey: dw.privateKey }` for four HD paths. React state is snapshotted by DevTools, readable from the console by any script or extension with devtools access, and retained in the component's closure for the full page lifetime. The `mnemonic` is also in `useState` (line 19). On a mainnet-live wallet, this is a direct key exfiltration vector for any rogue extension or XSS payload.

**Recommended fix:** Private keys must never enter React state. Use refs. Zero key material on unmount.

---

## HIGH (confirmed still present from prior audit)

### C3 — RASP / presignGate absent from WalletConnect signing path *(confirmed)*
**File:** `src/lib/WalletConnectProvider.jsx:114, 125, 141`

`handlePersonalSign`, `handleSignTypedData`, `handleSendTransaction` call `withPrivateKey()` directly. The `isSendReauthRequired` check at `RequestApprovalModal.jsx:44` is UI-only; the context exposes raw signing functions with no enforcement. **I4 violation:** comment at line 30 claims the gate is present — the handler has none.

---

### C4 — Phishing check always suppressed *(confirmed)*
**File:** `src/components/walletconnect/RequestApprovalModal.jsx:139`

`request.params?.proposer?.metadata` always evaluates to `undefined` on `session_request` events. Fix: look up `getActiveSessions()[request.topic]?.peer?.metadata`.

---

### H7 — EIP-712 domain.chainId never validated against WC session chain *(confirmed)*
**File:** `src/lib/WalletConnectProvider.jsx:125–136`

Cross-chain replay vector for Permit/Permit2 drain. A testnet dApp can produce a valid mainnet signature.

---

### H8 — personal_sign address param not validated *(confirmed)*
**File:** `src/lib/WalletConnectProvider.jsx:114–122`

`params[1]` (the expected signer address) is never checked against `evmAddress`.

---

### H6 — eth_signTypedData v1/v3 routed identically to v4 handler *(confirmed)*
**File:** `src/wallet-core/evm/walletconnect/router.js:17–19`

Encoding divergence is exploitable: a dApp sends a v1 payload, user approves a misleading display, wallet signs different bytes.

---

### H3 — Timing equalizer stale (300 ms vs. ~1.7 s mobile KDF cost) *(confirmed)*
**File:** `src/lib/WalletProvider.jsx:169`

`PRIMARY_UNLOCK_EQUALIZER_MS = 300` was calibrated to the old 64 MiB params. KDF is now 192 MiB (~1.5–2 s on mobile). The deniability-path cost (3 KDFs) far exceeds primary-success (1 KDF + 300 ms). An on-device timing observer can distinguish correct password from incorrect in fewer attempts than the KDF work factor implies.

---

### H11 — ColdSign.jsx presignGate hardcoded ALLOW *(confirmed)*
**File:** `src/pages/ColdSign.jsx:152 (approx.)`

`presignGate(TIER.ALLOW, "allow", riskAck)` always passes. No RASP evaluation at broadcast.

---

### H12 — WARN tier biometric re-confirm unimplemented *(confirmed)*
**File:** `src/rasp/degrade.js:56–73`

`requiresBiometric: true` is set in the degrade artifact for ROOTED and INTEGRITY_UNAVAILABLE but consumed by nothing in presign.js or compose.js. A detected rooted device signs freely.

---

### H13 — CryptoSigning.jsx clipboard fix not merged *(confirmed absent here)*
**File:** `src/pages/CryptoSigning.jsx:34`

The fix is staged on `fix/cryptosigning-clipboard-2026-06-26` but not on this branch.

---

### H14 — iOS KEK not Secure Enclave — name misleads *(confirmed)*
**File:** `ios/App/App/HardwareKekPlugin.swift:67–73`

`kSecClassGenericPassword` Keychain item, not SE-backed. Weaker extraction resistance on jailbroken device. **I4: "hardware-backed" language is materially incorrect for the iOS implementation.**

---

### H15 — Android KEK not StrongBox-backed *(confirmed)*
**File:** `android/app/src/main/java/com/veyrnox/app/HardwareKekPlugin.kt:53–67`

No `setIsStrongBoxBacked(true)`. Key may land in TEE or software. Security level unknown at runtime.

---

### H16 — DEVICE_CREDENTIAL collapses biometric KEK factor to PIN *(confirmed)*
**File:** `android/app/src/main/java/com/veyrnox/app/HardwareKekPlugin.kt:64`

`AUTH_BIOMETRIC_STRONG or AUTH_DEVICE_CREDENTIAL` — device PIN bypasses the biometric factor entirely.

---

## HIGH (new findings)

### H-NEW-1 — APK tamper detection always returns false (placeholder cert)
**Area:** RASP — RaspIntegrityPlugin.kt  
**File:** `android/app/src/main/java/com/veyrnox/app/RaspIntegrityPlugin.kt:214–220`

`EXPECTED_CERT_SHA256 = "VEYRNOX_RELEASE_CERT_SHA256_PLACEHOLDER"`. The guard short-circuits and returns `false` (not tampered) unconditionally. A repackaged APK with a Frida gadget will never trigger `CONDITION.TAMPERED`. C5 is partially fixed (detection logic written) but APK tamper detection is non-functional in every build.

**Fix:** CI/release pipeline must substitute the real release-key fingerprint via `BuildConfig.RELEASE_CERT_SHA256`. Add a lint rule that fails the release build if the sentinel string is still present.

---

### H-NEW-2 — No topic-to-active-session binding before signing
**Area:** WalletConnect  
**File:** `src/lib/WalletConnectProvider.jsx:114, 125, 141`

Signing handlers accept a `topic` without verifying it corresponds to an active, approved session. A stale or injected `session_request` event could be processed after the session is torn down.

**Fix:** Before `withPrivateKey` in each handler, assert the topic is in `getActiveSessions()` and the session includes the requested chain and method.

---

### H-NEW-3 — copySecret.js wipe defeatable; empty-string write persists in clipboard history
**Area:** Key Material Handling  
**File:** `src/lib/copySecret.js:9–11`

The 30-second wipe calls `clipboard.writeText('')`. On Frida: `setTimeout` can be patched before the call, making the wipe a no-op. On Samsung Clipboard / Gboard: empty-string write creates a new history entry rather than replacing the prior secret. After page navigation, `clipboard.writeText` may be denied (requires document focus) and the promise rejection is swallowed silently.

**Fix:** Replace with a non-empty dummy string of equal length. Add `.catch()` logging on wipe failure. Trigger early wipe on `visibilitychange`. Document Frida limitation honestly.

---

### H-NEW-4 — H and C inputs to combineKek not zeroed by callee
**Area:** Key Material Handling  
**File:** `src/wallet-core/keystore/kek.js:107–112`; `src/wallet-core/keystore/web.js:50–55, 82–86, 113–123`

`combineKek` zeroes its internal `ikm` concatenation but not the caller-supplied `H` and `C` Uint8Arrays. All three call sites (`unlock`, `enrollKek`, `changePassword`) leave hardware-factor and Argon2id-output bytes live in memory post-call. The newly introduced `H2` in `changePassword` is also not zeroed.

**Fix:** After each `combineKek` call in web.js: `H.fill(0); C.fill(0);`. Zero `H2` after the second call in `changePassword`. Zero recovered `dek` after `decryptVaultWithDek`.

---

### H-NEW-5 — Biometric cache not invalidated on new biometric enrollment
**Area:** Login Activity  
**File:** `src/lib/biometricUnlock.js:83–88`

The cached vault password uses `whenPasscodeSetThisDeviceOnly` (not `biometryCurrentSet`). Adding a new fingerprint/Face ID does NOT invalidate the cache. A coercer who enrolls their own biometric on a seized device gains access to the cached vault password. The Android `HardwareKekPlugin.kt` correctly uses `setInvalidatedByBiometricEnrollment(true)` for the KEK key — this gap is only in the biometric unlock cache. **Confirmed on both platforms.**

**Fix:** Store the biometric cache entry with `biometryCurrentSet` / `AUTH_BIOMETRIC_STRONG` (no `DEVICE_CREDENTIAL`) via a native shim.

---

### H-NEW-6 — CryptoSigning.jsx route may be accessible without unlock gate
**Area:** Auth Gate  
**File:** `src/pages/CryptoSigning.jsx` (route registration)

CryptoSigning exposes full BIP-39 mnemonic generation, HD private key derivation, and EIP-191/EIP-1559 signing. If its route is not behind a `<LandingGuard>` (or equivalent requiring `isUnlocked === true`), any XSS payload or browser extension can navigate to it without authentication and exfiltrate live private keys.

**Fix:** Confirm the route is behind an auth guard. If accessible unauthenticated, gate it immediately or strip it from the production bundle.

---

## MEDIUM (new findings)

| # | Area | Finding | File:Line |
|---|---|---|---|
| M-NEW-1 | RASP | Frida port check only probes 27042 (default) — `frida-server --listen :12345` bypasses it | `RaspIntegrityPlugin.kt:119–126` |
| M-NEW-2 | RASP | Root detection ineffective against Magisk DenyList/Zygisk (filesystem paths hidden per-process) | `RaspIntegrityPlugin.kt:83–91` |
| M-NEW-3 | RASP | nativeProbe.js comment says "native plugin not yet written" — stale after C5 commit | `src/rasp/nativeProbe.js:5,14–28` |
| M-NEW-4 | WC | 1M gas cap not applied when dApp omits `gas` field; comment claims unconditional cap (I4) | `WalletConnectProvider.jsx:168–171` |
| M-NEW-5 | WC | `maxFeePerGas` / `maxPriorityFeePerGas` taken verbatim; no upper bound; no fee display | `WalletConnectProvider.jsx:159–162` |
| M-NEW-6 | WC | `parseTypedData` silently accepts missing `domain` → domainless Permit is chain/contract-agnostic | `typed-data.js:21` |
| M-NEW-7 | WC | Unvalidated dApp icon URL renders as cross-origin `<img>` — IP leak + WebView SSRF potential | `SessionProposalModal.jsx:81` |
| M-NEW-8 | WC | Session expiry not enforced client-side — expired sessions can still receive approved requests | `session.js:133` |
| M-NEW-9 | WC | Optional namespace chains approved but hidden from user in SessionProposalModal | `WalletConnectProvider.jsx:98–102` |
| M-NEW-10 | Login | PIN attempt counter in localStorage — `adb shell` / console clears it, removing wipe protection | `pinAttemptGuard.js:13–17` |
| M-NEW-11 | KEK | Mnemonic overwrite uses space character, not zero bytes — JS limitation, but undocumented | `WalletProvider.jsx:411–413` |
| M-NEW-12 | KEK | M20 partially fixed (changePassword H2 bug fixed); H/C originals and H2 still not zeroed post-call | `kek.js:107–112`; `web.js` |

---

## FIXED (confirmed since prior audit)

| Finding | Fix |
|---|---|
| H4 — twoFactorGate factor leak | Now returns opaque `WRONG` code with single message — discriminator removed |
| web.js changePassword H2 double-zero bug | `H2 = H.slice()` before first `combineKek` — both derivations now correct |

---

## INFO / PASS

| Finding |
|---|
| ✅ `RaspIntegrityPlugin.kt` is genuinely written and wired — not a stub; detection logic is present but needs on-device validation and CI cert injection |
| ✅ `degrade.js` and `presignGate` fail closed when native plugin unavailable (INTEGRITY_UNAVAILABLE → TIER.WARN, not ALLOW) |
| ✅ `eth_sign` and `wallet_addEthereumChain` correctly blocked in WC router |
| ✅ `kek.js combineKek` correctly zeroes its internal `ikm` buffer |
| ✅ `twoFactorGate` fixed: opaque error code, no per-factor leak |
| ✅ `web.js changePassword` fixed: H2 copy prevents double-zero corruption of KEK on password change |
| ⚠️ RASP tamper detection is BUILT-NON-FUNCTIONAL until release CI injects the real cert fingerprint (H-NEW-1) |
| ⚠️ Root detection is best-effort only — Magisk DenyList bypasses all filesystem checks (M-NEW-2) |

---

## On-Device Verification Required

The following controls are BUILT but must be confirmed on a real device before status can advance:

1. **WalletConnect signing paths (C3/H7 fixes, when merged):** All three handlers (`handlePersonalSign`, `handleSignTypedData`, `handleSendTransaction`) need a real dApp session on testnet confirming the presignGate fires and blocks a RASP-BLOCK scenario.
2. **ColdSign broadcast path (H11 fix, when merged):** Real cold-sign flow on testnet must confirm RASP evaluation runs at `handleBroadcast()` entry, not just at the QR-scan step.
3. **RaspIntegrityPlugin.kt:** Needs hostile device testing — rooted device with Magisk DenyList, emulator, and Frida — to confirm detection fires correctly. Must also confirm CI cert injection produces a functional tamper check.
4. **FLAG_SECURE and WebView CDP disable (M13/M14):** Unverified on real release build per prior audit; still unverified.

None of these can be marked VERIFIED without a real-device test session and owner-supplied evidence.

---

## Critical Chain (highest combined risk on current branch)

**H-NEW-1 + C3 + H7 (still present) + H12 (still present):**
1. APK tamper detection always returns `false` → environment always WARN/proceed
2. presignGate absent from WC handlers → RASP bypass is irrelevant because there's no gate to bypass
3. domain.chainId not validated → testnet dApp produces mainnet-valid Permit signature
4. WARN tier biometric re-confirm unimplemented → no friction even on detected rooted device

**Recommended fix order (updated):**
1. C3 — wire presignGate into all three WC signing handlers
2. C4 — fix phishing metadata read
3. H7 — chainId validation in handleSignTypedData
4. H-NEW-1 — CI cert injection for tamper detection
5. H-NEW-6 / C6 — CryptoSigning route gate + remove private keys from React state
6. H13 — merge clipboard fix branch
7. H16 — remove DEVICE_CREDENTIAL from Android KEK auth
8. H-NEW-5 — biometric cache invalidation on enrollment change
9. H3 — recalibrate equalizer to ~1.7 s
10. H14/H15 — SE/StrongBox migration or honest naming (audit-gated)

---

*This report was produced by static code analysis. Controls marked BUILT-NON-FUNCTIONAL, TARGET, or PLANNED require real-device verification and independent audit sign-off before being treated as enforced. Per project policy (CLAUDE.md §I4): "never mock a security control to look real."*
