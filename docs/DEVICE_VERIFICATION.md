# Android Device Verification Guide

**Target Device:** Pixel 10 Pro XL (Android 16, API 36)  
**Test Framework:** Appium 3.5.2 + WebdriverIO + Mocha  
**Test Count:** 49 tests across 7 suites  
**Estimated Duration:** 30-45 minutes (all suites)  

---

## Pre-Flight Checklist

### Hardware Requirements
- [ ] Pixel 10 Pro XL connected via USB
- [ ] Developer options enabled
- [ ] USB debugging enabled
- [ ] Secure boot enabled (security check)

### Software Requirements
- [ ] Android SDK installed
- [ ] Appium Server 3.5.2 installed globally
- [ ] UiAutomator2 driver installed
- [ ] Node.js 18+ installed
- [ ] npm dependencies installed (`npm install`)

### Device Preparation
- [ ] Device fully charged (or plugged in)
- [ ] Recent APK built (`npm run android:sync`)
- [ ] Test wallet created with known password
- [ ] Testnet funds available (for send tests)
  - [ ] ETH on Sepolia (0.1+ ETH)
  - [ ] BTC on testnet (0.01+ tBTC)
  - [ ] SOL on devnet (1+ SOL)
  - [ ] USDC on Sepolia (if available)

### Network Requirements
- [ ] Device on reliable WiFi (for testnet RPC calls)
- [ ] Device can reach Sepolia RPC (infura.io, alchemy.com)
- [ ] Device can reach Bitcoin testnet explorer
- [ ] Device can reach Solana devnet explorer

---

## Setup Instructions

### 1. Verify Device Connection

```bash
# Check ADB connection
adb devices

# Expected output:
# List of devices attached
# 57051FDCQ008UD         device
```

If device not showing:
- Check USB cable (try different ports)
- Restart ADB: `adb kill-server && adb devices`
- Check Developer Options on device

### 2. Install Test APK

```bash
# Build and sync to device
npm run android:sync

# Verify installation
adb shell pm list packages | grep veyrnox

# Expected output:
# package:com.veyrnox.app.debug
```

### 3. Start Appium Server

```bash
# Terminal 1: Start Appium server
appium --port 4723

# Expected output:
# [Appium] Welcome to Appium v3.5.2
# [Appium] Appium REST http interface listening on 0.0.0.0:4723
```

Do NOT close this terminal during tests.

### 4. Verify Appium Connection

```bash
# Terminal 2: Test Appium connectivity
curl http://localhost:4723/wd/hub/status

# Expected output:
# {"value":{"ready":true,"message":"Appium is ready to accept new sessions",...}}
```

If connection fails:
- Verify Appium is running (check Terminal 1)
- Check port 4723 is not in use: `lsof -i :4723`
- Kill any hung process: `kill -9 $(lsof -t -i :4723)`

---

## Test Execution

### Run All Tests

```bash
# Terminal 2: Run entire test suite
npm run android:test

# Alternatively, run specific suites:
npm run android:test:vault              # 8/8 baseline (fastest, ~2 min)
npm run android:test:send               # 2/2 form validation (~1 min)
npm run android:test:send-scenarios     # 10 multi-asset sends (~8 min)
npm run android:test:hardware-kek       # 5 StrongBox tests (~5 min)
npm run android:test:biometric-unlock   # 8 Face ID tests (~6 min)
npm run android:test:hidden-wallet      # 8 stealth pool tests (~6 min)
npm run android:test:panic-pin          # 8 panic wipe tests (~5 min)
```

**Recommended execution order** (from fastest to slowest):
1. Vault (2 min) — confidence builder
2. Send (1 min) — basic form
3. Hardware KEK (5 min) — StrongBox
4. Panic PIN (5 min) — destructive wipe
5. Hidden Wallet (6 min) — stealth pool
6. Biometric Unlock (6 min) — Face ID
7. Send Scenarios (8 min) — multi-asset

**Total estimated time:** 33 minutes all suites

### Real-Time Monitoring

While tests run, monitor:

**Terminal 1:** Appium logs
- Look for: `Starting session` / `[HTTP] POST /wd/hub/session`
- Watch for: timeout errors, device disconnects
- Normal pace: 1-2 seconds per test

**Terminal 2:** Mocha test output
- Output shows: current test, pass/fail, elapsed time
- Look for: ✓ (pass) or × (fail) symbols
- Summary at end: `X passing, Y failing`

**Device:** Watch the app
- Verify: app opens, screens render, actions execute
- Watch for: crashes, freezes, unexpected errors
- Note: app may be sluggish (emulation/USB bottleneck)

---

## On-Chain Verification (Send Scenarios Tests)

### Test 3: ETH Send on Sepolia

**Steps:**
1. App navigates to Send screen
2. Selects ETH, enters recipient `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045` (Vitalik address)
3. Amount: 0.001 ETH, Fee: Standard
4. Reviews TX details
5. Enters password to confirm
6. TX broadcasts to Sepolia

**On-Chain Verification:**
```bash
# After test completes, check Sepolia explorer
# TX should appear within 15 seconds

# URL format:
https://sepolia.etherscan.io/tx/{TXID_FROM_TEST_OUTPUT}

# Look for:
# - Status: Success (green checkmark)
# - From: your wallet address (m/44'/60'/0'/0/0)
# - To: 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
# - Value: 0.001 ETH
# - Block: confirmed (not in mempool)
```

**Record the TXID:**
```
Sepolia ETH Send: 0x[TXID_HERE]
Date verified: [DATE]
Explorer link: https://sepolia.etherscan.io/tx/0x[TXID]
```

### Test 4: USDC Send on Sepolia (ERC-20)

**Steps:**
1. Select USDC asset
2. Enter recipient (same address or different)
3. Amount: 10 USDC
4. Fee: Standard (higher gas overhead than ETH)
5. Confirm with password

**On-Chain Verification:**
```bash
# Check Sepolia explorer for ERC-20 transfer
# URL format:
https://sepolia.etherscan.io/tx/{TXID_FROM_TEST_OUTPUT}

# Look for:
# - Transaction Type: ERC-20 Transfer
# - From: your address
# - To: recipient
# - Token: USDC (0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238)
# - Value: 10 USDC
```

### Test 5: BTC Send on Bitcoin Testnet

**Steps:**
1. Select BTC asset (note: different address format)
2. Enter testnet recipient (bc1q... address)
3. Amount: 0.001 tBTC
4. Fee rate: Standard (3-5 sats/vB)
5. Confirm with password

**On-Chain Verification:**
```bash
# Check Bitcoin testnet explorer
# URL format:
https://mempool.space/testnet/tx/{TXID_FROM_TEST_OUTPUT}

# Or:
https://blockstream.info/testnet/tx/{TXID_FROM_TEST_OUTPUT}

# Look for:
# - From: your testnet address (bc1q...)
# - To: recipient address
# - Value: 0.001 BTC
# - Status: in mempool or confirmed
# - Fee: ~50-200 sats (depends on network)
```

### Test 6: SOL Send on Solana Devnet

**Steps:**
1. Select SOL asset
2. Enter devnet recipient (base58 address, 44 chars)
3. Amount: 0.1 SOL
4. Fee: Standard (~0.00025 SOL rent minimum)
5. Confirm with password

**On-Chain Verification:**
```bash
# Check Solana devnet explorer
# URL format:
https://explorer.solana.com/tx/{SIGNATURE_FROM_TEST_OUTPUT}?cluster=devnet

# Look for:
# - Status: Success (green checkmark)
# - From: your devnet address
# - To: recipient
# - Amount: 0.1 SOL
# - Slot: confirmed
```

---

## Test-by-Test Verification Checklist

### ✅ Vault Tests (8/8)

| Test | Expected Behavior | Pass |
|------|-------------------|------|
| Load main screen | App renders, no crashes | [ ] |
| Display Send button | Send button visible in UI | [ ] |
| Display Receive button | Receive button visible | [ ] |
| Display balance | ETH balance shown (real from Sepolia) | [ ] |
| Navigate to Send | Send screen opens | [ ] |
| Navigate back | Returns to main screen | [ ] |
| Display wallet info | Wallet 1 name + metadata shown | [ ] |
| Display nav tabs | Bottom navigation tabs visible | [ ] |

**Pass Criteria:** All 8 tests pass, app doesn't crash

---

### ✅ Send Tests (2/2)

| Test | Expected Behavior | Pass |
|------|-------------------|------|
| Navigate to send screen | Form loads, no errors | [ ] |
| Verify send button exists | Button visible and clickable | [ ] |

**Pass Criteria:** Both tests pass

---

### ✅ Send Scenarios (10)

| Test | Expected Behavior | On-Chain Evidence | Pass |
|------|-------------------|-------------------|------|
| Navigate to send | Form ready | N/A | [ ] |
| ETH send (Sepolia) | TX broadcast | Sepolia TXID | [ ] |
| USDC send (ERC-20) | TX broadcast | Sepolia TXID | [ ] |
| BTC send (testnet) | TX broadcast | Bitcoin testnet TXID | [ ] |
| SOL send (devnet) | TX broadcast | Solana devnet signature | [ ] |
| Fee tier selection | Fees update on tier change | N/A | [ ] |
| Insufficient balance | Error shows, send disabled | N/A | [ ] |
| Invalid address | Error shows, send disabled | N/A | [ ] |
| Step-up re-auth | Password gate appears | N/A | [ ] |
| Network mismatch | Warning/error shown | N/A | [ ] |

**Pass Criteria:** 10/10 tests pass + 4 on-chain TXIDs verified on explorers

---

### ✅ Hardware KEK Tests (5)

| Test | Expected Behavior | Pass |
|------|-------------------|------|
| Navigate to settings | Settings menu opens | [ ] |
| Display KEK status | StrongBox Protected badge shown | [ ] |
| Verify vault wrap | Vault is KEK-wrapped | [ ] |
| Biometric gate | Face ID gate functional (if enrolled) | [ ] |
| KEK-gated unlock | Unlock works with StrongBox path | [ ] |

**Pass Criteria:** 5/5 tests pass, KEK status badge visible

---

### ✅ Biometric Unlock Tests (8)

| Test | Expected Behavior | Pass |
|------|-------------------|------|
| Navigate to settings | Biometric settings accessible | [ ] |
| Detect capability | Face ID detected on device | [ ] |
| Preference persisted | Setting saved across restarts | [ ] |
| Unlock gate | Face ID triggers unlock | [ ] |
| Password gate for send | Password required for send | [ ] |
| Duress PIN interaction | Face ID opens decoy (if duress set) | [ ] |
| No credential logging | No secrets in logcat | [ ] |
| Complete suite | All 8 tests pass | [ ] |

**Pass Criteria:** 8/8 tests pass, Face ID works

---

### ✅ Hidden Wallet Tests (8)

| Test | Expected Behavior | Pass |
|------|-------------------|------|
| Navigate to settings | Hidden wallet menu accessible | [ ] |
| Verify pool init | 256 slots seeded with chaff | [ ] |
| Create wallet | Idempotent, fresh mnemonic | [ ] |
| Reveal correct secret | Opens hidden wallet | [ ] |
| Reveal wrong secret | Error indistinguishable from password | [ ] |
| Move to hidden | Transition-tell warning shown | [ ] |
| Verify deniability | Count/presence hiding works | [ ] |
| Multi-chain addresses | EVM + BTC + SOL addresses correct | [ ] |

**Pass Criteria:** 8/8 tests pass, stealth pool functional

---

### ✅ Panic PIN Tests (8)

| Test | Expected Behavior | Pass |
|------|-------------------|------|
| Navigate to wipe settings | Panic wipe menu accessible | [ ] |
| Display warning | User education shown | [ ] |
| Verify secret ≠ others | Conflict detection works | [ ] |
| Min length enforcement | 6-char floor enforced | [ ] |
| Confirmation flow | Type-to-confirm + checkboxes | [ ] |
| Document artifact erasure | All tells erased on wipe | [ ] |
| Threat model documented | Attack surface documented | [ ] |
| Complete suite | All 8 tests pass | [ ] |

**Pass Criteria:** 8/8 tests pass (destructive tests documented, not executed)

---

## Result Documentation

### Success (All Green)

```markdown
# Device Verification Results — 2026-07-04

## Summary
✅ All 49 tests passing on Pixel 10 Pro XL (Android 16, API 36)
✅ 4 on-chain sends verified on Sepolia/testnet/devnet
✅ Hardware KEK functional (StrongBox badge visible)
✅ Biometric unlock working (Face ID tested)

## Test Results
- Vault: 8/8 ✅
- Send: 2/2 ✅
- Send Scenarios: 10/10 ✅ (on-chain verified)
- Hardware KEK: 5/5 ✅
- Biometric Unlock: 8/8 ✅
- Hidden Wallet: 8/8 ✅
- Panic PIN: 8/8 ✅

## On-Chain Evidence
- ETH Sepolia: https://sepolia.etherscan.io/tx/0x...
- USDC Sepolia: https://sepolia.etherscan.io/tx/0x...
- BTC testnet: https://mempool.space/testnet/tx/...
- SOL devnet: https://explorer.solana.com/tx/...?cluster=devnet

## Device Configuration
- Device: Pixel 10 Pro XL
- OS: Android 16 (API 36)
- App: com.veyrnox.app.debug (built 2026-07-04)
- Appium: 3.5.2
- Driver: UiAutomator2

## Issues Found
(None)

## Next Steps
- [ ] Merge PR #564 to main
- [ ] Set up real device CI/CD (BrowserStack/LambdaTest)
- [ ] Implement performance benchmarking
- [ ] Add flakiness tracking
```

### Partial Success (Some Failures)

```markdown
# Device Verification Results — 2026-07-04

## Summary
⚠️ 47/49 tests passing
⚠️ 1 critical issue found
⚠️ 1 device-specific issue

## Failed Tests
- Panic PIN: test 5 (confirmation flow) — FAILED
  - Error: Type-to-confirm field not found
  - Likely: UI element name mismatch or accessibility ID changed
  - Fix: Update test selector in panic-pin-e2e.spec.js line 123

- Biometric Unlock: test 6 (duress PIN interaction) — FAILED
  - Error: Face ID didn't open decoy wallet
  - Likely: Duress PIN not configured on device
  - Fix: Manually configure duress PIN before re-run

## On-Chain Evidence
- ETH Sepolia: https://sepolia.etherscan.io/tx/0x... ✅
- USDC Sepolia: https://sepolia.etherscan.io/tx/0x... ✅
- BTC testnet: (not sent — test failed before confirmation)
- SOL devnet: (not sent — test failed before confirmation)

## Device Configuration
- Device: Pixel 10 Pro XL
- OS: Android 16 (API 36)
- App: com.veyrnox.app.debug
- Appium: 3.5.2

## Issues Found
1. CRITICAL: Test selector mismatch in panic-pin-e2e.spec.js
   - Symptom: Line 123 `resourceId("panic-wipe-button")` not found
   - Fix: Inspect element, find actual accessibility ID, update selector

2. DEVICE-SPECIFIC: Duress PIN not configured
   - Symptom: Duress PIN tests skip without error
   - Fix: Manually configure duress PIN in Settings before re-run

## Next Steps
- [ ] Fix test selector in panic-pin-e2e.spec.js
- [ ] Re-run panic PIN tests
- [ ] Re-run biometric unlock tests (with duress PIN configured)
- [ ] Verify on-chain sends for BTC/SOL
```

---

## Troubleshooting

### Issue: "Unable to connect to http://localhost:4723"

**Cause:** Appium server not running  
**Fix:**
```bash
# Terminal 1: Kill any hung processes
pkill -f appium

# Terminal 1: Start fresh
appium --port 4723
```

### Issue: Device Offline

**Cause:** USB connection dropped  
**Fix:**
```bash
adb kill-server
adb devices
# Re-plug USB cable if needed
```

### Issue: "Element not found"

**Cause:** UI changed, selector outdated  
**Fix:**
```bash
# Dump page source to find correct selector
adb shell uiautomator dump /sdcard/dump.xml
adb pull /sdcard/dump.xml
cat dump.xml | grep -i "send"  # Search for element
```

### Issue: Timeout (test hangs)

**Cause:** Element slow to load, network issue  
**Fix:**
```bash
# Kill the test and check device
adb logcat | grep -i "veyrnox"  # Check app logs
adb shell pm clear com.veyrnox.app.debug  # Clear app cache if needed
```

### Issue: "Vault wrap status: UNKNOWN"

**Cause:** Hardware KEK not enrolled yet  
**Fix:** Hardware KEK tests will show status as unknown until enrolled. This is OK for baseline verification.

---

## Time Budget

| Suite | Duration | Pass Rate | Notes |
|-------|----------|-----------|-------|
| Vault | 2 min | 8/8 | Baseline, fastest |
| Send | 1 min | 2/2 | Form validation |
| Hardware KEK | 5 min | 5/5 | StrongBox, may be slow on device |
| Panic PIN | 5 min | 8/8 | No actual wipe executed |
| Hidden Wallet | 6 min | 8/8 | Stealth pool operations |
| Biometric Unlock | 6 min | 8/8 | Face ID unlock tests |
| Send Scenarios | 8 min | 10/10 | On-chain verification required |
| **TOTAL** | **33 min** | **49/49** | Run sequentially, monitor app |

---

## Sign-Off Checklist

- [ ] All 49 tests passing (or documented failures investigated)
- [ ] 4 on-chain TXIDs verified on explorers
- [ ] Hardware KEK status badge visible
- [ ] Biometric unlock working (Face ID)
- [ ] Hidden wallet reveal working
- [ ] App doesn't crash during any test
- [ ] Results documented (paste above section into PR comment)
- [ ] Ready for merge and real device CI/CD setup

---

**Questions?** Check Appium logs in Terminal 1 or device logcat:
```bash
adb logcat | tail -50  # Last 50 lines of device log
```

**Ready to start?** Begin with Vault tests (fastest confidence builder), then proceed in order of complexity.

Good luck! 🚀
