# WebAuthn PRF Hardware Factor (Phase 1) — Browser UAT

**Status:** Phase 1 READY FOR UAT (all unit tests pass, ready for browser matrix verification)

**Date Created:** 2026-07-01
**Test Environment:** Web wallet on localhost:5173 (Vite dev server)
**Scope:** Chrome, Firefox, Safari (desktop + iOS), testnet Sepolia

---

## Test Infrastructure

### Prerequisites
- Web wallet development build: `npm run dev` (starts on localhost:5173)
- Fresh browser profile or cleared localStorage (`localStorage.clear()` in console)
- Testnet Sepolia ETH available (public Sepolia faucet or existing balance)
- Test addresses:
  - Known recipient (for send verification): `0x82D0Fa1ec7a5c1B0B3B8B2B5B2B5B2B5B82D0Fa` (changeable)
  - Send amount: 0.001 Sepolia ETH (testnet safe)

### Browser Versions (Minimum Required for Phase 1)
- **Chrome:** ≥ 99 (WebAuthn PRF support, includes Windows Hello / macOS Touch ID)
- **Firefox:** ≥ 60 (WebAuthn support; PRF = v108+; graceful fallback if older)
- **Safari (Desktop):** ≥ 15 (WebAuthn support; PRF unavailable, password-only fallback)
- **Safari (iOS):** Latest (WebAuthn + PRF unavailable, password-only fallback)

---

## Test Execution Plan

### Phase 1A: Chrome (Desktop) — PRIMARY SUCCESS PATH

#### Setup
1. Open Chrome (verify version ≥ 99 in `chrome://version`)
2. Navigate to `http://localhost:5173`
3. Open DevTools Console (F12)
4. Run: `localStorage.clear()` (fresh session)

#### Flow 1: isHardwareKeystoreAvailable() Probe
```javascript
// In browser console:
const { keyStore } = await import('./src/wallet-core/keystore/index.js');
const available = await keyStore.isHardwareKeystoreAvailable();
console.log('PRF Available on Chrome:', available);
```
**Expected:** `true`
**Screenshot:** Capture console showing `PRF Available on Chrome: true`
**Status:** ✅ PASS / ❌ FAIL

#### Flow 2: enrollKek() — Hardware Factor Enrollment
1. Create new wallet (or navigate to existing unlock screen)
2. Navigate to Wallet Settings → Security → Hardware Encryption (or feature card)
3. Click "Enable Hardware Encryption" toggle
4. Expected: Browser shows "Your PIN will be encrypted with your device's secure hardware" prompt
5. Confirm → Browser shows platform authenticator prompt (Windows Hello / macOS Touch ID)
6. Complete biometric/PIN auth on platform authenticator
7. Expected success: "Hardware encryption enabled. Your PIN is now secured by your device."
8. Verify localStorage contains `veyrnox-prf-cred-id`

**Console verification:**
```javascript
console.log('PRF Credential ID stored:', localStorage.getItem('veyrnox-prf-cred-id'));
```

**Screenshot:** Capture success message + localStorage entry
**Status:** ✅ PASS / ❌ FAIL

#### Flow 3: unlock() — Hardware Factor Unlock
1. Lock wallet (close app or explicit lock)
2. Return to wallet unlock screen
3. Enter PIN
4. Click "Unlock" → Browser shows platform authenticator prompt
5. Complete biometric auth (same authenticator as enrollment)
6. Expected: Wallet unlocks, seed loads, balance displays
7. Verify: No password re-entry required (PRF factor auto-retrieved)

**Screenshot:** Capture unlock success + balance display
**Status:** ✅ PASS / ❌ FAIL

#### Flow 4: Biometric Re-enrollment Invalidation Test (Optional, Device-Specific)
1. Re-enroll platform authenticator in OS (enroll new face/fingerprint)
2. Attempt to unlock wallet with old PIN + platform authenticator
3. Expected: Platform authenticator call succeeds (OS level), PRF evaluation completes
4. Note: Full validation of "PRF factor invalidated on re-enrollment" requires Phase 2 device verification

**Screenshot:** Capture re-enrollment attempt behavior
**Status:** 🔍 OBSERVATION (not a hard fail, device-specific behavior)

#### Flow 5: testnet Send Verification (Sepolia ETH)
1. Unlock wallet with PRF-enrolled PIN (triggers platform authenticator)
2. Navigate to Send screen
3. Select Sepolia ETH
4. Enter recipient: `0x82D0Fa1ec7a5c1B0B3B8B2B5B2B5B2B5B82D0Fa`
5. Enter amount: `0.001 ETH`
6. Select "Standard" gas tier
7. Click "Review transaction"
8. Verify transaction preview displays correctly
9. Click "Confirm & Send"
10. Expected: PIN re-auth prompt (send step-up re-auth)
11. Enter PIN → Browser shows platform authenticator prompt (3rd time after unlock + re-auth)
12. Complete biometric auth
13. Expected: Transaction signs and broadcasts
14. Capture txid from "Transaction sent" screen
15. Open Sepolia Explorer in new tab: `https://sepolia.etherscan.io`
16. Search for txid
17. Wait for confirmation (usually < 1 minute on Sepolia)
18. Document: `[VERIFIED] Chrome PRF-enrolled PIN send: 0x<txid> on Sepolia`

**Screenshots:**
- Capture: Transaction review screen
- Capture: Pending txid + timestamp
- Capture: Explorer confirmation (block number, status SUCCESS)

**Status:** ✅ VERIFIED (on-chain txid) / 🟡 SENT (pending confirmation) / ❌ FAIL

---

### Phase 1B: Firefox (Desktop) — SECONDARY SUCCESS PATH

#### Setup
1. Open Firefox (verify version in `about:` page)
2. Navigate to `http://localhost:5173`
3. Open Developer Console (F12)
4. Run: `localStorage.clear()`

#### Flow 1: isHardwareKeystoreAvailable() Probe
```javascript
// In browser console:
const { keyStore } = await import('./src/wallet-core/keystore/index.js');
const available = await keyStore.isHardwareKeystoreAvailable();
console.log('PRF Available on Firefox:', available);
```
**Expected (Firefox ≥ 108):** `true`
**Expected (Firefox < 108):** `false` or `true` (graceful fallback)
**Screenshot:** Capture console output + Firefox version
**Status:** ✅ PASS (true or graceful false) / ❌ FAIL (exception thrown)

#### Flow 2: enrollKek() — Hardware Factor Enrollment
Same as Chrome Flow 2.
**Expected outcome:** Success (if Firefox ≥ 108 supports PRF) or graceful error message
**Screenshot:** Capture result (success or clear error)
**Status:** ✅ PASS / ⚠️ GRACEFUL-FAIL / ❌ FAIL

#### Flow 3: unlock() — Hardware Factor Unlock
Same as Chrome Flow 3 (if PRF supported), else password-only.
**Screenshot:** Capture unlock behavior
**Status:** ✅ PASS / ⚠️ PASSWORD-ONLY / ❌ FAIL

#### Flow 4: testnet Send (Sepolia ETH)
Same as Chrome Flow 5.
**Expected:** Transaction sends and confirms on Sepolia Explorer
**Document:** `[VERIFIED] Firefox PRF-enrolled PIN send: 0x<txid> on Sepolia` (or password-only if PRF unavailable)
**Status:** ✅ VERIFIED / 🟡 SENT / ❌ FAIL

---

### Phase 1C: Safari (Desktop) — GRACEFUL DEGRADATION PATH

#### Setup
1. Open Safari (verify version in Safari → About Safari)
2. Navigate to `http://localhost:5173`
3. Open Web Inspector (Develop menu → Show Web Inspector)
4. Run: `localStorage.clear()` in console

#### Flow 1: isHardwareKeystoreAvailable() Probe
```javascript
// In browser console:
const { keyStore } = await import('./src/wallet-core/keystore/index.js');
const available = await keyStore.isHardwareKeystoreAvailable();
console.log('PRF Available on Safari:', available);
```
**Expected:** `false` (Safari does not support WebAuthn PRF)
**Screenshot:** Capture console output
**Status:** ✅ PASS (correct false) / ❌ FAIL (unexpected true or error)

#### Flow 2: enrollKek() — Expected Failure (Graceful Degradation)
1. Navigate to Settings → Security → Hardware Encryption
2. Verify: UI shows "Hardware Encryption: Not supported on this browser" or similar message
3. Attempt to click "Enroll" (if button exists)
4. Expected: getHardwareFactor() throws clear message: "WebAuthn PRF (hmac-secret) not supported on this browser. Use a strong password (≥12 characters) instead."
5. Verify error message is user-friendly (not technical jargon)
6. UI should fall back to password-only unlock setup

**Screenshot:** Capture degradation message
**Status:** ✅ PASS (clear message + fallback) / ❌ FAIL (exception without message or no fallback)

#### Flow 3: Fallback to Password-Only Unlock
1. Create wallet with password-only (no hardware factor attempt)
2. Enter password ≥ 12 characters (web mainnet requirement)
3. Click "Create Wallet"
4. Expected: Wallet created with Argon2id KDF (no PRF)
5. Lock wallet (close or explicit lock)
6. Return to unlock screen
7. Enter password
8. Click "Unlock"
9. Expected: Wallet unlocks, no platform authenticator prompt
10. Verify: Seed loads, balances display

**Screenshot:** Capture password-only unlock success
**Status:** ✅ PASS / ❌ FAIL

#### Flow 4: testnet Send (Password-Only on Safari)
1. Unlock wallet with password
2. Navigate to Send → Sepolia ETH
3. Enter recipient + amount + select gas tier
4. Review → Confirm & Send
5. Expected: PIN re-auth (password entry)
6. Enter password
7. Expected: Transaction signs and broadcasts (no hardware factor)
8. Capture txid from success screen
9. Open Sepolia Explorer and verify confirmation

**Document:** `[VERIFIED] Safari password-only send: 0x<txid> on Sepolia`
**Screenshots:** Send screen + confirmation
**Status:** ✅ VERIFIED / 🟡 SENT / ❌ FAIL

#### Flow 5: Error Message Clarity (User Messaging)
1. Verify Safari error message for hardware enrollment attempt:
   - Stated: "WebAuthn PRF not supported on this browser. Use a strong password (≥12 characters) instead."
   - Verify: Message is user-friendly (no WebAuthn/hmac-secret jargon for average user)
   - Verify: Suggests password alternative clearly

**Screenshot:** Capture error message
**Status:** ✅ PASS (clear, user-friendly) / ⚠️ PARTIAL (technical jargon remains) / ❌ FAIL (confusing)

---

### Phase 1D: Safari iOS (Mobile) — MOBILE DEGRADATION

#### Setup
1. Open Safari on iPhone/iPad
2. Navigate to `http://localhost:5173` (use local network or ngrok tunnel for local:5173)
3. Open Web Inspector (Mac: Develop → [Device] → [Tab]; or iOS: Settings → Safari → Advanced → Web Inspector)

#### Flow 1: isHardwareKeystoreAvailable() Probe
```javascript
// In console:
const { keyStore } = await import('./src/wallet-core/keystore/index.js');
const available = await keyStore.isHardwareKeystoreAvailable();
console.log('PRF on iOS Safari:', available);
```
**Expected:** `false`
**Screenshot:** Capture console
**Status:** ✅ PASS / ❌ FAIL

#### Flow 2: Enrollment & Password-Only Fallback
1. Navigate to Settings → Security → Hardware Encryption
2. Verify: "Not supported on this browser" message
3. Create wallet with password ≥ 12 chars
4. Lock and re-unlock with password
5. Expected: Successful password-only unlock

**Screenshot:** Capture settings + unlock success
**Status:** ✅ PASS / ❌ FAIL

#### Flow 3: testnet Send (Mobile Safari)
1. Create send transaction on Sepolia ETH (0.001)
2. Confirm with password (no platform authenticator)
3. Wait for confirmation
4. Document: `[VERIFIED] Safari iOS password-only send: 0x<txid> on Sepolia`

**Status:** ✅ VERIFIED / 🟡 SENT / ❌ FAIL

---

## Test Results Summary Table

| Browser | Version | PRF Support | enrollKek() | unlock() | testnet Send | Notes |
|---------|---------|-------------|-----------|---------|--------------|-------|
| Chrome | ≥99 | ✅ Yes | ✅ Success | ✅ Success | ✅ 0x[txid] | Platform authenticator works |
| Firefox | ≥108 | ✅ Yes | ✅ Success | ✅ Success | ✅ 0x[txid] | Version-dependent PRF support |
| Firefox | <108 | ⚠️ Partial | ⚠️ Graceful | ⏭️ Fallback | ✅ 0x[txid] | Graceful password fallback |
| Safari Desktop | ≥15 | ❌ No | ❌ Graceful | ⏭️ Password-only | ✅ 0x[txid] | Clear degradation message |
| Safari iOS | Latest | ❌ No | ❌ Graceful | ⏭️ Password-only | ✅ 0x[txid] | Mobile degradation works |

---

## Acceptance Criteria Checklist

### Phase 1 UAT Complete (All Must Pass)

- [ ] Chrome: Full PRF flow verified end-to-end (enrollment → unlock → testnet send with txid)
- [ ] Firefox: Full PRF flow verified (if ≥108) OR graceful error (if <108)
- [ ] Safari (Desktop): Clear degradation message + password-only fallback works + testnet send txid
- [ ] Safari (iOS): Password-only fallback + send works + testnet send txid
- [ ] All testnet txids captured and documented in this file
- [ ] Zero console errors or unhandled rejections in any browser
- [ ] Error messages are user-friendly (no WebAuthn/hmac-secret jargon for Safari users)
- [ ] Feature flag `HARDWARE_KEK_NATIVE_ENABLED = false` confirmed dead-codes native calls
- [ ] npm test passes: 248 files, 1973 tests (baseline)
- [ ] No regressions in existing password-only unlock flow

---

## Known Limitations & Phase 2 Roadmap

### Phase 1 (Web PRF) — Complete Scope
- Chrome/Firefox: Hardware-backed PRF (hmac-secret) via platform authenticator
- Safari: Graceful degradation to password-only (honest design, not a bug)
- Web: isHardwareKeystoreAvailable() + getHardwareFactor() wired
- Native: Feature flag HARDWARE_KEK_NATIVE_ENABLED = false (calls dead-coded)

### Phase 2 (Native Hardware Binding) — Future (Q3 2026)
- iOS: Secure Enclave HMAC-SHA256 key + device-gated biometric binding
- Android: StrongBox HMAC-SHA256 key + device-gated biometric binding
- Requires: Native Swift/Kotlin plugin, real-device verification, independent audit refresh
- Gate: Real-device testnet send on physical iPhone + Pixel device

---

## Tester Instructions

1. **Before starting:**
   - Ensure you have Sepolia ETH available (faucet or balance)
   - Set up a test recipient address (can be the same address if testing on same device)
   - Note: Use a FRESH browser profile for each browser to avoid cache issues

2. **For each browser:**
   - Complete ALL flows (1–5 for Chrome/Firefox, 1–5 for Safari)
   - Capture screenshots for flows marked [SCREENSHOT REQUIRED]
   - Document txid for any send verification flows
   - Note any deviations (PRF unavailable, graceful fallback, etc.)

3. **Screenshots to capture:**
   - Hardware enrollment success message
   - Platform authenticator prompt (Windows Hello / Touch ID)
   - Successful unlock (balance display)
   - Transaction review screen
   - Pending txid + timestamp
   - Sepolia Explorer confirmation (block number, status)
   - Any error messages (Safari graceful degradation)

4. **If a browser test fails:**
   - Check browser console for errors (F12 → Console tab)
   - Note exact error message
   - Verify browser version meets minimum requirement
   - Check that localhost:5173 is accessible
   - Try a fresh localStorage.clear() and restart

5. **Testnet transaction wait time:**
   - Sepolia typically confirms in < 1 minute
   - If pending > 5 minutes, check gas price (may be too low)
   - Explorer link: https://sepolia.etherscan.io

---

## Sign-Off

Once all tests pass:

1. [ ] Tester Name: _______________
2. [ ] Date: _______________
3. [ ] All tests completed: ✅
4. [ ] Testnet txids documented: ✅
5. [ ] Ready for Phase 2 planning: ✅

---

## Documentation Updates Post-UAT

After UAT completion, update:

1. **`docs/Feature-Status.md` §4 (PIN Security — S1):**
   ```
   PIN Unlock (S1):
   - Web: ✅ VERIFIED (WebAuthn PRF + Argon2id, tested Chrome/Firefox, graceful degrade Safari)
     - Chrome: hardware-backed PRF, testnet send 0x[txid] Sepolia
     - Firefox: hardware-backed PRF, testnet send 0x[txid] Sepolia
     - Safari: password-only (PRF unavailable), testnet send 0x[txid] Sepolia
   - Native: 🟡 Phase 2 (Secure Enclave iOS / StrongBox Android, Q3 2026 roadmap)
   ```

2. **`CLAUDE.md`:**
   - Mark I6 invariant as BUILT-VERIFIED (web PRF)
   - Document Safari graceful degradation (not a gap, by design)
   - Confirm Phase 2 timeline for native hardware binding

3. **`docs/hardware-kek-phase-plan.md`:**
   - Phase 1 summary: Web PRF VERIFIED, testnet txids captured
   - Phase 2 plan: Native Secure Enclave (iOS) + StrongBox (Android), Q3 2026
   - Known limitation: Safari lacks PRF; password-only is honest fallback

---

**Expected UAT Duration:** 3–4 hours (includes testnet transaction confirmation waits)
**Test Environment Stability:** Stable (all unit tests pass)
**Phase 1 Production Readiness:** YES (pending browser UAT completion)
