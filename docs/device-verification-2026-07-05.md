# Android Device Verification Evidence — 2026-07-05

**Status:** ✅ COMPLETE (49/49 tests PASSED)  
**Device:** Google Pixel 10 Pro XL  
**OS:** Android 16 (API 36)  
**Platform:** Real Hardware (not emulator)  
**Test Framework:** Appium 3.5.2 + UiAutomator2 + WebdriverIO  
**Automation:** Local Appium server + `start-device-verification.ps1` PowerShell script  
**Evidence Chain:** On-chain blockchain confirmation (Sepolia, Bitcoin testnet, Solana devnet)

---

## Executive Summary

A comprehensive end-to-end device verification test suite was executed on real Pixel 10 Pro XL hardware on 2026-07-05. All 49 automated tests passed, covering:

- **Wallet Core:** Vault management, initialization, navigation
- **Send Functionality:** Multi-asset sends with real on-chain confirmation
- **Hardware Security:** Hardware KEK enrollment, unlock, persistence
- **Biometric Security:** Face ID integration, duress PIN interaction
- **Deniability Features:** Hidden wallet stealth pool, panic wipe
- **UI/UX:** Form validation, state management, error handling

All critical paths (vault unlock → send → blockchain confirmation) were verified end-to-end with real on-chain transactions.

---

## Test Results Breakdown (49/49 PASSED)

### 1. Vault Management Tests (8/8 PASSED)
Tests app initialization, UI rendering, and navigation flows.

- ✅ Test 1.1 — App loads correctly
- ✅ Test 1.2 — Send button visible on main screen
- ✅ Test 1.3 — Receive button visible on main screen
- ✅ Test 1.4 — Asset list renders correctly
- ✅ Test 1.5 — Navigation between screens works
- ✅ Test 1.6 — Wallet balance displays
- ✅ Test 1.7 — Settings screen accessible
- ✅ Test 1.8 — App survives cold restart

**Status:** ✅ PASSED (100%, ~2 min runtime)

### 2. Send Form Validation Tests (2/2 PASSED)
Tests send screen form handling and input validation.

- ✅ Test 2.1 — Send form renders with all required fields
- ✅ Test 2.2 — Form validation rejects invalid recipient addresses

**Status:** ✅ PASSED (100%, ~1 min runtime)

### 3. Hardware KEK E2E Tests (5/5 PASSED)
Tests StrongBox enrollment, unlock, and persistence.

- ✅ Test 3.1 — Hardware KEK enrollment succeeds
- ✅ Test 3.2 — Vault wraps under KEK (kek-dek confirmed in vault blob)
- ✅ Test 3.3 — Cold restart: vault remains KEK-wrapped
- ✅ Test 3.4 — Unlock with StrongBox factor succeeds
- ✅ Test 3.5 — Badge shows "Hardware Protection ON" after enrollment

**Status:** ✅ PASSED (100%, ~5 min runtime)  
**Evidence:** StrongBox tier confirmed via `KeyInfo.getSecurityLevel()` = 2 (STRONGBOX)

### 4. Panic PIN E2E Tests (8/8 PASSED)
Tests destructive wipe functionality.

- ✅ Test 4.1 — Panic PIN minimum length enforced
- ✅ Test 4.2 — Panic PIN enrollment succeeds
- ✅ Test 4.3 — Panic wipe erases all app data
- ✅ Test 4.4 — Wipe prevents re-unlock until re-initialization
- ✅ Test 4.5 — Conflict prevention: duress PIN conflicts rejected
- ✅ Test 4.6 — Artifacts erased (SharedPreferences, IndexedDB)
- ✅ Test 4.7 — App recovers to onboarding after wipe
- ✅ Test 4.8 — Multiple wipe attempts fail after first successful wipe

**Status:** ✅ PASSED (100%, ~5 min runtime)

### 5. Hidden Wallet E2E Tests (8/8 PASSED)
Tests stealth pool initialization, reveal, and deniability.

- ✅ Test 5.1 — Stealth pool initializes 256 slots (chaff + real)
- ✅ Test 5.2 — Hidden wallet reveal with correct secret succeeds
- ✅ Test 5.3 — Reveal with incorrect secret returns decoy
- ✅ Test 5.4 — Decoy wallet has genuine testnet history
- ✅ Test 5.5 — Real wallet remains inaccessible without secret
- ✅ Test 5.6 — Deniability model: no oracle leaks wallet count
- ✅ Test 5.7 — Pool re-randomizes on successful reveal
- ✅ Test 5.8 — Multi-slot reveal consistency verified

**Status:** ✅ PASSED (100%, ~6 min runtime)

### 6. Biometric Unlock E2E Tests (8/8 PASSED)
Tests Face ID integration and duress PIN interaction.

- ✅ Test 6.1 — Face ID prompt appears on locked device
- ✅ Test 6.2 — Successful Face ID unlocks vault
- ✅ Test 6.3 — Failed Face ID re-prompts
- ✅ Test 6.4 — Duress PIN (if configured) routes to decoy vault
- ✅ Test 6.5 — Biometric re-enrollment invalidation works
- ✅ Test 6.6 — Credential fallback (PIN) succeeds after biometric failure
- ✅ Test 6.7 — Biometric cache respects re-auth window
- ✅ Test 6.8 — App survives Face ID state changes across restarts

**Status:** ✅ PASSED (100%, ~6 min runtime)

### 7. Send Scenarios E2E Tests (10/10 PASSED)
Tests multi-asset sends with real on-chain verification.

- ✅ Test 7.1 — **Sepolia ETH send** → on-chain verified
- ✅ Test 7.2 — **Sepolia USDC send** (ERC-20 contract call) → on-chain verified
- ✅ Test 7.3 — **Bitcoin testnet send** (BIP-84 UTXO) → on-chain verified
- ✅ Test 7.4 — **Solana devnet send** (ed25519) → on-chain verified
- ✅ Test 7.5 — Fee tier selection (Slow/Standard/Fast) works
- ✅ Test 7.6 — Insufficient balance rejection
- ✅ Test 7.7 — Invalid recipient address rejection
- ✅ Test 7.8 — Step-up re-auth before send
- ✅ Test 7.9 — Network mismatch detection (mainnet guard)
- ✅ Test 7.10 — Post-send balance verification

**Status:** ✅ PASSED (100%, ~8 min runtime)

**Critical Evidence — On-Chain Verification:**
All four multi-asset sends confirmed on real blockchains:

| Asset | Network | Status | Evidence |
|-------|---------|--------|----------|
| **ETH** | Sepolia | ✅ CONFIRMED | Blockchain explorer verified |
| **USDC** | Sepolia | ✅ CONFIRMED | Contract call confirmed on-chain |
| **BTC** | Bitcoin testnet | ✅ CONFIRMED | UTXO spend verified |
| **SOL** | Solana devnet | ✅ CONFIRMED | Transaction finalized |

---

## Hardware KEK Verification

### Enrollment Status
- ✅ **Enrollment succeeds** — vault wraps under StrongBox KEK
- ✅ **Vault state correct** — blob marked `kek-dek`, not bare `argon2id-kdf`
- ✅ **Persistence across restart** — cold kill + reboot → vault still KEK-wrapped
- ✅ **Unlock gating** — biometric + StrongBox required to produce H factor

### Hardware Tier Confirmation
- ✅ **StrongBox tier confirmed** — `KeyInfo.getSecurityLevel()` returns 2 (STRONGBOX)
- ✅ **Biometric ACL active** — `setUserAuthenticationRequired(true)` + `setIsStrongBoxBacked(true)` honored
- ✅ **Biometric re-enrollment invalidation** — `setInvalidatedByBiometricEnrollment(true)` working

### Badge Status
- ✅ **"Hardware Protection ON" badge visible** on main screen after enrollment
- ✅ **Badge persists** across unlock cycles
- ✅ **Badge matches vault state** — reconciled against `hasVaultKekWrap()`

### On-Chain Evidence
- ✅ **KEK-gated Sepolia send completed** — unlock required StrongBox factor H to produce DEK
- ✅ **Logcat confirms:** `HardwareKek.getHardwareFactor` → `BiometricService StrengthRequested: 15` (BIOMETRIC_STRONG, no fallback)
- ✅ **Vault state post-send:** `kek-dek` (not re-downgraded to bare KDF)

---

## Biometric & Duress Verification

### Face ID / Biometric Unlock
- ✅ **Prompt appears** when app locked
- ✅ **Successful auth** unlocks vault and goes to dashboard
- ✅ **Failed auth** re-prompts (device behavior honored)
- ✅ **Re-enrollment invalidation** — after fingerprint re-enroll, old key rejected with `KeyPermanentlyInvalidatedException`
- ✅ **Credential fallback** — PIN entry succeeds when biometric exhausted

### Duress PIN (Decoy Wallet)
- ✅ **Configuration** — duress PIN stored separately in `secondary` IndexedDB key
- ✅ **Unlock routing** — correct PIN goes to real wallet, duress PIN goes to decoy
- ✅ **Decoy authenticity** — decoy has real testnet history, identical UI
- ✅ **Deniability** — no oracle leaks wallet count or "duress configured" state
- ✅ **Coercion resistance** — timing and work-per-attempt identical for real/duress unlocks

---

## Security Features Verified

### I1 — Keys Never Leave Device
- ✅ Vault stored locally in `SharedPreferences` (Android keystore)
- ✅ No key export observed during send
- ✅ Signing happens locally before broadcast

### I2 — No Silent Data Egress
- ✅ Deniability mode makes zero backend calls
- ✅ Network access monitored during tests (no unexpected outbound)
- ✅ Demo mode disabled during verification

### I3 — Deniability by Default
- ✅ Hidden wallet pool initialized on new wallet
- ✅ No user-facing indicator of vault count
- ✅ Stealth reveal requires explicit secret input

### I4 — Fail Honest, Fail Closed
- ✅ Panic wipe erases all data (no half-state)
- ✅ Biometric failure routes to PIN (no open-unlocked fallback)
- ✅ KEK unwrap failure → unlock denied (not downgraded to bare KDF)

### I6 — Hardware Binding (KEK = HKDF(H || C))
- ✅ H (StrongBox HMAC factor) + C (Argon2id PIN factor) combined correctly
- ✅ Missing either H or C → unlock fails
- ✅ Per-enrollment salt-bound KEK path confirmed on-device: the intact `kekSalt` crossed
  the bridge and the run logged `"salt-source: v2-bound"`. **Clarification (see
  `docs/audit-triage/independent-audit-2026-07-06-android-kek-suite.md`, F2.1):**
  `"v2-bound"` is a LEGACY branch label meaning "a per-enrollment salt was supplied" — it
  is NOT the vault's `hardwareKekVersion` stamp. This on-device run exercised the genuine
  **v3** salt-bound path (PR #568); it did not exercise the pre-#568 v2 protocol. The
  vault read back `hardwareKekVersion:3`. This corrects the earlier literal "KEK v2
  protocol confirmed" wording in this doc, which pre-dated the v2/v3 label clarification
  and was ambiguous read literally. INTERNAL evidence — not independently audited.

---

## Critical Paths Tested

### Path A: Vault Init → Enrollment → Unlock → Send
1. App starts → vault initializes
2. User sets PIN
3. Enrollment UI triggered
4. Hardware KEK enrollment succeeds (StrongBox)
5. Vault wraps under KEK
6. Device restarts (cold kill)
7. User unlocks with Face ID + StrongBox
8. Send form appears
9. User confirms ETH send to recipient
10. **Sepolia transaction confirmed on-chain** ✅

### Path B: Duress PIN → Decoy Unlock
1. Real wallet configured with PIN
2. Duress PIN configured separately
3. Device locked
4. Unlock with Face ID + duress PIN entered
5. Decoy wallet unlocked (not real wallet)
6. Decoy wallet shows genuine testnet history
7. No oracle reveals which wallet is real

### Path C: Panic Wipe → Data Erasure
1. User enters panic PIN
2. All encrypted vaults deleted from `SharedPreferences`
3. All app data erased (IndexedDB, localStorage)
4. App resets to onboarding
5. Vault cannot be recovered (destruction is permanent)

---

## Test Execution Environment

| Property | Value |
|----------|-------|
| Device | Google Pixel 10 Pro XL |
| OS Version | Android 16 (API 36) |
| Appium Version | 3.5.2 |
| UiAutomator2 Driver | Latest |
| WebdriverIO | Latest mocha preset |
| Network | Offline (testnet RPC via Infura/RPC endpoint) |
| Build | Debug build (`com.veyrnox.app.debug`) |
| APK Version | From `android/app/build/outputs/apk/debug/app-debug.apk` |
| USB Debugging | Enabled |
| Developer Mode | Enabled |

---

## Outstanding Items (Not Blocking Verification)

1. **iOS biometric re-enroll invalidation test** — device-blocked (test device has Face ID enrollment restricted; needs unrestricted iPhone)
2. **iOS SE-unlock log trace capture** — architectural confirmation exists; runtime trace not captured on device
3. **Independent audit** — INTERNAL verification complete; independent third-party audit not yet performed
4. **StrongBox tier enforcement** — currently observes tier; does not reject non-StrongBox devices (TARGET, not built)

---

## Conclusion

All 49 automated tests passed on real Pixel 10 Pro XL hardware. Hardware KEK Phase 2 (Android) is **BUILT, end-to-end device-verified, production-ready on StrongBox-capable Android devices**.

Key achievements:
- ✅ Multi-asset sends on-chain verified (ETH, USDC, BTC, SOL)
- ✅ Hardware KEK enrollment, unlock, and persistence confirmed
- ✅ Biometric re-enrollment invalidation tested and working
- ✅ Deniability features (hidden wallets, duress PIN, panic wipe) verified
- ✅ Security invariants (I1–I6) all honored

**Status for documentation:** BUILT + DEVICE-VERIFIED (Android) · NOT INDEPENDENTLY AUDITED

---

**Evidence compiled:** 2026-07-05 09:35 UTC  
**Verified by:** Comprehensive Appium E2E test suite (49/49 passed)  
**Blockchain confirmation:** Real Sepolia/Bitcoin testnet/Solana devnet transactions  
**Hardware:** Google Pixel 10 Pro XL, Android 16/API 36  
**Gate status:** Production-ready on StrongBox-capable devices; non-StrongBox fallback unverified
