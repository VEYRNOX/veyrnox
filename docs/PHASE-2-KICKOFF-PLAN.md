# Phase 2 Kickoff Plan & Sprint Checklist

**Hardware KEK Phase 2: Native Hardware Binding (iOS Secure Enclave + Android StrongBox)**

Target: **Q3 2026** — Real-device development, device-verified sends, audit refresh

Date: 2026-07-01  
Status: **PRE-KICKOFF PLANNING** — Dispatch this plan when Phase 1 UAT is complete (all 3 Sepolia txids captured)

---

## Executive Summary

Phase 2 adds hardware-level encryption to iOS (Secure Enclave) and Android (StrongBox/Keystore), closing the offline-seizure gap on mobile. Unlike Phase 1 (web WebAuthn PRF), Phase 2 requires:
- Custom native plugin development (Swift + Kotlin)
- Real device hardware (physical iPhone with Face ID; physical Pixel with fingerprint)
- Real-device verification (cannot be tested in simulator/emulator)
- Audit refresh (native plugin is in-scope for security review)

**Timeline:** 8 weeks (including audit)  
**Team:** 2 developers (1 iOS, 1 Android, or sequential if single resource)  
**Delivery Gate:** 3 Sepolia testnet send txids (iPhone Face ID + Pixel Fingerprint + cross-device) + audit sign-off

---

## Pre-Kickoff Phase: Weeks -2 to 0 (Before Dev Starts)

### DEVICE ACQUISITION (Week -2 to -1)

#### Real iPhone with Face ID

**Requirement:** iPhone 12+ (Face ID is required; SE/Touch ID insufficient for biometric re-enroll test)

**Options:**
1. **Borrow from team member** (lowest cost, fastest)
   - Ensure member has consistent access for 4–5 weeks
   - Confirm iPhone 15+ preferred (latest Face ID model for validation)
   - Escalation contact in case device becomes unavailable

2. **Reserve from device lab/fleet** (if available)
   - Contact device manager: [to be filled]
   - Reserve 5 hours/week for 4 weeks = 20 hours total
   - Ensure 24-hour cancellation notice for urgent testing

3. **Purchase** (best for long-term)
   - iPhone 15 Pro (recommended): ~$1200
   - iPhone 13/14 (acceptable): ~$800
   - Budget: $800–$1200
   - Procurement timeline: 3–5 business days

**Pre-Testing Checklist:**
- [ ] Device boots and is factory-reset
- [ ] Face ID enrolls and works (test in Settings → Face ID & Passcode)
- [ ] iOS 17.2+ installed (or latest supported version)
- [ ] iCloud sign-in optional (not required for dev build testing)
- [ ] Device has stable WiFi access (for Xcode builds + testnet RPCs)

---

#### Real Android Device with StrongBox

**Requirement:** Pixel 3+ (StrongBox available on Pixel 3+, Android 9+)

**Options:**
1. **Borrow from team member** (lowest cost)
   - Ensure Pixel 3/4/5/6/7 (any of these have StrongBox)
   - Confirm fingerprint sensor works
   - Escalation contact in case device becomes unavailable

2. **Reserve from device lab/fleet**
   - Contact device manager: [to be filled]
   - Reserve 5 hours/week for 4 weeks
   - Ensure Android 9.0+ (StrongBox requires Android 9+)

3. **Purchase** (best for long-term)
   - Pixel 7a (recommended): ~$400
   - Pixel 6a (acceptable): ~$350
   - Pixel 5a (legacy acceptable): ~$300
   - Budget: $300–$400
   - Procurement timeline: 3–5 business days

**Pre-Testing Checklist:**
- [ ] Device boots and is factory-reset
- [ ] Fingerprint enrolls and works (test in Settings → Security → Biometrics)
- [ ] Android 9.0+ confirmed (`adb shell getprop ro.build.version.sdk`)
- [ ] Verify StrongBox present (not all Android devices have it; Pixel 3+ guaranteed)
- [ ] Device has stable WiFi + USB-C for ADB

**StrongBox Verification Command:**
```bash
adb shell getprop ro.hardware.keystore
# Expected output: "msm8998" (or similar HW keystore)
# For Pixel: expect dedicated secure processor
```

---

### TESTNET FUNDS (Week -1)

Pre-fund both devices with testnet assets. All sends will use these fixtures.

**Sepolia ETH:**
- Source: https://sepoliafaucet.com or https://faucet.quicknode.com
- Amount per device: 0.05 ETH (covers 5 test sends at ~0.01 ETH each + gas)
- Recipients: (will be generated after app is first run on real device)
- Timeline: Acquire 2–3 days before device dev starts (faucets can be rate-limited)

**Bitcoin Testnet (Optional, for BTC send verification):**
- Source: https://testnet-faucet.mempool.space
- Amount: 0.1 BTC (optional; priority is Sepolia ETH for EVM)
- Timeline: Same as Sepolia

**Solana Devnet (Optional):**
- Source: `solana airdrop 5 <address>` (local devnet CLI; not critical for Phase 2)
- Timeline: Only if SOL send is part of verification scope (likely not for Phase 2)

---

### ENVIRONMENT SETUP (Week -1 to 0)

#### macOS with Xcode (iOS Development)

**Requirement:** Mac with Apple Silicon or Intel CPU (M1+ preferred)

**Installation Steps:**
1. Download Xcode 15.3+ from App Store or developer.apple.com (~12 GB, ~1 hour)
2. Install Command Line Tools:
   ```bash
   xcode-select --install
   ```
3. Verify installation:
   ```bash
   xcode-select -p
   # Expected: /Applications/Xcode.app/Contents/Developer
   ```
4. Install CocoaPods (Swift dependency manager):
   ```bash
   sudo gem install cocoapods
   pod repo update
   ```
5. Provision iOS build path:
   ```bash
   cd veyrnox-secure
   npm install
   npm run ios
   # This will generate ios/App, configure CocoaPods
   ```

**Xcode Setup:**
- [ ] Open `ios/App/App.xcworkspace` (NOT .xcodeproj)
- [ ] Select team/signing: Xcode → Preferences → Accounts → Add Apple ID (personal or team account)
- [ ] Auto-manage signing: Build Settings → Signing → "Automatically manage signing"
- [ ] Provisioning profile will auto-provision for ad-hoc dev testing

**Verification:**
```bash
cd ios/App
xcodebuild -workspace App.xcworkspace -scheme App -configuration Debug \
  -sdk iphoneos -showBuildSettings | grep PROVISIONING
# Should see a provisioning profile UUID
```

---

#### Android Studio (Android Development)

**Requirement:** macOS or Linux with Android 13+ SDK

**Installation Steps:**
1. Download Android Studio 2023.2+ from developer.android.com (~4 GB, ~30 min)
2. Install and launch
3. SDK Manager (within Android Studio):
   - [ ] API 33 (Android 13) — minimum for modern testing
   - [ ] API 34 (Android 14) — recommended
   - [ ] Android SDK Platform-Tools (latest)
   - [ ] Android Emulator (optional; real device preferred)
4. Environment setup:
   ```bash
   export ANDROID_HOME=$HOME/Library/Android/sdk
   export PATH=$PATH:$ANDROID_HOME/tools:$ANDROID_HOME/platform-tools
   ```
5. Verify:
   ```bash
   adb --version  # Should print "Android Debug Bridge version"
   ```

**Real Device Setup (Pixel):**
- [ ] Enable Developer Mode: Settings → About → "Build number" (tap 7x) → Developer options appear
- [ ] Enable USB Debugging: Settings → Developer options → "USB Debugging" toggle on
- [ ] Connect via USB-C to Mac: Allow USB debugging on device prompt
- [ ] Verify adb sees device:
   ```bash
   adb devices
   # Should list: <device-id> device
   ```

---

#### Git Worktree (Session Isolation)

**Requirement:** Prevent concurrent same-identity session hazard (documented in CLAUDE.md)

**Setup:**
```bash
cd /path/to/veyrnox-secure
git worktree add ~/veyrnox-phase-2 origin/main
# Creates isolated git working tree at ~/veyrnox-phase-2
# Use this path for all Phase 2 development
```

**Why:** Multiple developers or sequential native/web work on the same branch can cause state conflicts. A worktree isolates the git state.

---

### TEAM COORDINATION (Week 0)

- [ ] Audit contact established — confirm audit availability for weeks 7–8
- [ ] Slack channel or email thread created: `#veyrnox-phase-2` or `phase2-dev@...`
- [ ] Daily standup scheduled: 15 min, same time each day (e.g., 10 AM UTC)
- [ ] GitHub project board created: `Phase 2` with columns [Backlog, In Progress, Review, Done]
- [ ] Add PRs/issues to board: e.g., `Phase 2a: iOS SE setup`, `Phase 2b: Android StrongBox setup`, etc.
- [ ] Blockers list created: Maintain a live list of show-stoppers (device unavailable, build errors, etc.)
- [ ] Escalation path defined: Who to contact if blocked (PM, device manager, security lead)

**Communication Template (Daily Standup):**
```
## Phase 2 Daily Standup — 2026-07-XX

**iOS (Phase 2a):**
- ✅ Yesterday: Set up Xcode, confirmed CocoaPods installed
- 🔄 Today: Start HardwareKekPlugin.swift, P-256 key generation
- 🚧 Blocker: None

**Android (Phase 2b):**
- ✅ Yesterday: Android Studio set up, real Pixel connected
- 🔄 Today: Start HardwareKekPlugin.kt, StrongBox key config
- 🚧 Blocker: None

**Shared:**
- [ ] Both devices funded with testnet ETH (in progress)
- [ ] Audit contact: awaiting confirmation
- Next sync: Tomorrow, 10 AM UTC
```

---

## PHASE 2a: iOS Secure Enclave (Weeks 1–4)

### Week 1: Build & Device Setup

**Goal:** Verify app builds on real iPhone, confirm Xcode toolchain works, confirm HardwareKekPlugin.swift compiles

**Tasks:**

1. **Clone & Build**
   ```bash
   cd ~/veyrnox-phase-2
   npm install
   npm run ios
   # Generates ios/App/App.xcworkspace, installs CocoaPods deps
   ```

2. **Connect Real iPhone**
   - Connect iPhone to Mac via USB-C cable
   - Trust the computer: Open Settings → General → Trust
   - Open Xcode: Window → Devices and Simulators → Select connected device

3. **Configure Signing**
   - Open `ios/App/App.xcworkspace` in Xcode
   - Select target "App"
   - Build Settings → Signing → Team (auto-select your personal Apple ID)
   - Signing Certificate (auto-manage)

4. **Build to Real Device**
   ```bash
   cd ios/App
   xcodebuild -workspace App.xcworkspace -scheme App \
     -configuration Debug -sdk iphoneos -destination 'id=<DEVICE_UUID>'
   # Or use Xcode UI: select device from top-left dropdown, hit Play
   ```

5. **Verify App Launches**
   - App should open on iPhone
   - Splash screen + onboarding appears
   - No build errors in Xcode console

**Acceptance Criteria:**
- [ ] Xcode build completes (no errors)
- [ ] App launches on real iPhone
- [ ] Xcode console shows no Swift compilation errors
- [ ] Keychain is accessible (Settings → App → Keychain checked)

**Sign-Off:** Dev lead confirms build success and device readiness

---

### Week 2: Enrollment & Keychain Testing

**Goal:** Implement and test Secure Enclave P-256 key generation and Keychain storage

**Implementation Checklist:**

1. **Create HardwareKekPlugin.swift**
   ```swift
   // Location: ios/App/App/Plugins/HardwareKekPlugin/HardwareKekPlugin.swift
   
   import Capacitor
   import Security
   import CryptoKit
   
   @objc(HardwareKekPlugin)
   public class HardwareKekPlugin: CAPPlugin {
       
       @objc func enrollHardwareCredential(
           _ call: CAPPluginCall
       ) {
           // Generate P-256 ECIES key in Secure Enclave
           // Store in Keychain with Face ID ACL
           // Return { enrolled: true, reference: <keyRef> }
       }
       
       @objc func isHardwareEnrolled(
           _ call: CAPPluginCall
       ) {
           // Check if Keychain has an enrolled hardware key
           // Return { enrolled: true/false }
       }
       
       @objc func getHardwareFactor(
           _ call: CAPPluginCall
       ) {
           // Retrieve H from Keychain (triggers biometric if Face ID ACL set)
           // Return { factor: <base64-H> }
       }
       
       @objc func clearHardwareCredential(
           _ call: CAPPluginCall
       ) {
           // Delete enrolled key from Keychain
       }
   }
   ```

2. **Keychain Storage Configuration**
   - Access control: `kSecAccessControlBiometryCurrentSet` (not yet; start without ACL for enrollment testing)
   - Accessible: `kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly`
   - Synchronization: `kSecAttrSynchronizable = false` (device-local only)

3. **Key Generation (Secure Enclave)**
   - Algorithm: P-256 ECIES (secp256r1)
   - Non-extractable: Key never leaves Secure Enclave
   - Rotation: Optional (not required for Phase 2; manual re-enroll if needed)

4. **Keychain Item Structure**
   ```
   KEY_SE_REF (P-256 private key reference)
   └─ kSecClass: kSecClassKey
   └─ kSecAttrKeyType: kSecAttrKeyTypeEC
   └─ kSecAttrKeySizeInBits: 256
   └─ kSecAttrAccessible: kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly
   
   EPHEM_PUB (ephemeral public key for ECIES)
   └─ kSecClass: kSecClassGenericPassword
   └─ kSecValueData: <public-key-bytes>
   
   ENC_H (encrypted hardware factor)
   └─ kSecClass: kSecClassGenericPassword
   └─ kSecValueData: <AES-GCM-encrypted-H>
   
   NONCE (IV for ECIES)
   └─ kSecClass: kSecClassGenericPassword
   └─ kSecValueData: <random-12-byte-nonce>
   ```

5. **Test Cycles**
   ```swift
   // Test 1: Enroll
   enrollHardwareCredential() → { enrolled: true }
   isHardwareEnrolled() → { enrolled: true }
   // 4 Keychain items should exist
   
   // Test 2: Retrieve
   getHardwareFactor() → { factor: "..." } (no biometric prompt yet)
   
   // Test 3: Clear
   clearHardwareCredential() → success
   isHardwareEnrolled() → { enrolled: false }
   // 4 Keychain items deleted
   
   // Test 4: Re-enroll
   enrollHardwareCredential() → { enrolled: true } (fresh key)
   getHardwareFactor() → { factor: "..." } (different from Test 2)
   ```

**Acceptance Criteria:**
- [ ] `enrollHardwareCredential()` succeeds (4 Keychain items created)
- [ ] `isHardwareEnrolled()` returns true after enroll
- [ ] `getHardwareFactor()` returns base64 H without error
- [ ] `clearHardwareCredential()` deletes all 4 items
- [ ] Repeat enroll/clear 3x with no stale items accumulating
- [ ] No Keychain sync to iCloud (device-local only)

**Sign-Off:** Keychain items created, read, cleared; re-enroll cycle passes

---

### Week 3: Face ID & Biometric Re-enrollment

**Goal:** Wire Face ID biometric ACL to Keychain, test unlock flow, test biometric invalidation

**Implementation Checklist:**

1. **Add Face ID ACL to Keychain**
   ```swift
   // Modify enrollHardwareCredential() to add biometric gate
   
   let attributes = [
       kSecAttrAccessControl as String: 
           SecAccessControlCreateWithFlags(
               kCFAllocatorDefault,
               kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly,
               .biometryCurrentSet,  // Face ID required here
               nil
           )!
   ]
   // When stored with this ACL, key access will require Face ID prompt
   ```

2. **Test Face ID Prompt**
   - Call `getHardwareFactor()` → Face ID prompt should appear on-device
   - Approve with enrolled Face ID → H returned
   - Deny Face ID → error returned, H not retrieved

3. **Biometric Re-enrollment Test**
   - Enroll Face ID (Settings → Face ID & Passcode)
   - Launch app, unlock, confirm Face ID works (Face ID prompt appears, unlock succeeds)
   - Change Face ID (Settings → Face ID & Passcode → "Set Up Alternative Appearance" or delete + re-enroll)
   - Attempt unlock with app → Face ID prompt appears BUT Face ID fails (device rejects old face)
   - Confirm `getHardwareFactor()` throws `KeyError: Key invalidated by biometric enrollment change`
   - Auto-detect this error in plugin, trigger `clearHardwareCredential()` + return error to JS
   - JS layer: display "Biometric changed, re-enrollment required" + guide user to re-enroll

4. **Latency Measurement**
   - Measure unlock latency: Call `getHardwareFactor()` 5 times, record each time
   - Expected: 1–2 seconds per call (includes Face ID prompt delay)
   - Record: Min, max, median, std-dev
   - Report in verification doc

5. **Error Path Testing**
   - User cancels Face ID prompt → `getHardwareFactor()` returns error `USER_CANCELLED`
   - App shows clear error message: "Face ID cancelled. Try again or use password recovery."
   - Vault NOT decrypted; unlock fails safely (I4)

**Acceptance Criteria:**
- [ ] Face ID prompt renders on `getHardwareFactor()` call
- [ ] Approve Face ID → H retrieved successfully
- [ ] Deny/cancel Face ID → error returned, H not retrieved
- [ ] Biometric re-enroll → old key invalidated, clear auto-triggers
- [ ] Error messages are user-friendly (not raw Keychain errors)
- [ ] Latency: median ≤ 2 seconds
- [ ] 5-cycle test cycle passes without hangs or crashes

**Sign-Off:** Face ID gate works, biometric re-enroll invalidation confirmed, latency baseline recorded

---

### Week 4: Testnet & Verification Report

**Goal:** Create a real vault, unlock with Face ID, send real ETH on Sepolia, capture txid, document results

**Pre-Send Checklist:**
- [ ] Device has 0.05 Sepolia ETH funded (from Week -1)
- [ ] App is built and running on iPhone
- [ ] Face ID is enrolled and working (from Week 3)

**Send Flow:**

1. **Create Vault**
   - Launch app → Onboarding
   - Create new wallet: testnet-safe seed (never use real funds)
   - Set vault password (≥12 chars for web; mobile doesn't have that constraint, but use >8 for safety)
   - Enroll hardware KEK: Face ID prompt appears → approve → Secure Enclave key generated

2. **Verify Vault Unlocks with Face ID**
   - Kill app
   - Reopen app → Lock screen
   - Enter password → Face ID prompt appears → approve → vault decrypts
   - Balances load: Sepolia ETH balance should show (0.05 ETH or whatever was funded)

3. **Perform Sepolia Send**
   - Navigate to Send
   - Select ETH (Sepolia)
   - Amount: 0.01 ETH (leaves 0.04 for gas + future tests)
   - Recipient: Testnet-safe address (e.g., faucet return address, or another test wallet)
   - Confirm: Fee selector, recipient review
   - Unlock: PIN/password + Face ID (2FA if enabled)
   - Broadcast

4. **Capture Txid**
   - App should display: "Sent successfully" + txid
   - Copy txid: `0x<64-hex-chars>`
   - Open etherscan.io/sepolia in iPhone browser
   - Search txid: Confirm transaction appears, status SUCCESS
   - Record:
     ```
     Transaction ID: 0x________________________________________
     Block: __________
     From: 0x_________________________________
     To: 0x_________________________________
     Amount: 0.01 ETH
     Status: SUCCESS (green checkmark on explorer)
     Device: iPhone 15 Pro (or model used)
     iOS Version: 17.4 (or version tested)
     Face ID Type: Face ID (standard)
     Timestamp: 2026-07-XX HH:MM:SS UTC
     ```

**Verification Report: `/docs/verification/phase-2a-ios-device-verification.md`**

Create a summary document:

```markdown
# Phase 2a — iOS Secure Enclave Device Verification

**Device:** iPhone 15 Pro, iOS 17.4  
**Test Date:** 2026-07-24  
**Tester:** [Name]  

## Summary

iOS Secure Enclave HMAC-SHA256 hardware KEK implementation verified on real device.
All verification gates PASSED; ready for audit.

## Verification Results

### Enrollment
- ✅ HardwareKekPlugin.swift compiles (no errors)
- ✅ enrollHardwareCredential() succeeds (4 Keychain items created)
- ✅ isHardwareEnrolled() returns true

### Face ID
- ✅ Face ID prompt appears on getHardwareFactor()
- ✅ Face ID approved → H retrieved (no error)
- ✅ Face ID denied → error returned (unlock fails)
- ✅ User cancel → error handled gracefully

### Biometric Re-enroll
- ✅ Change Face ID in Settings → change detected
- ✅ App unlock attempt → Face ID fails (old key invalid)
- ✅ Auto-clear triggered: isHardwareEnrolled() returns false
- ✅ Re-enrollment available: enrollHardwareCredential() succeeds with fresh key

### Performance
- Unlock latency (5 cycles):
  - Min: 1.2s, Max: 1.8s, Median: 1.5s
  - Status: ✅ Within expected range (1–2s)

### Testnet Send (Sepolia)
- Vault created with testnet seed
- Unlock: Password + Face ID (both required)
- Send: 0.01 ETH to recipient
- **Txid: 0x__________________________________**
- **Block: __________**
- **Status on explorer: SUCCESS (confirmed)**

### Security
- ✅ I1 (keys never leave device): SE key non-extractable
- ✅ I2 (no silent data egress): No network during unlock/enroll
- ✅ I3 (deniability): Decoy sessions block all SE calls
- ✅ I4 (fail closed): Missing SE → clear error, password recovery available
- ✅ I6 (hardware binding): DEK = HKDF(H || C), both required

## Sign-Off

iOS Secure Enclave verified and ready for audit.

Tester: ________________  Date: 2026-07-XX  
Lead Dev: ________________  Date: 2026-07-XX  
```

**Acceptance Criteria:**
- [ ] Testnet send succeeds (txid on-chain, status SUCCESS)
- [ ] Device verification report complete and signed
- [ ] All security invariants (I1–I6) confirmed
- [ ] Latency baseline recorded

**Sign-Off:** Real iPhone send on Sepolia confirmed; Phase 2a COMPLETE

---

## PHASE 2b: Android StrongBox (Weeks 2–5)

### Week 2: Build & Device Setup

**Goal:** Verify app builds on real Pixel, confirm Android toolchain works, confirm HardwareKekPlugin.kt compiles

**Tasks:**

1. **Build APK**
   ```bash
   cd ~/veyrnox-phase-2
   npm run android:open  # Opens Android Studio
   # Or via command line:
   npx cap sync android
   ./gradlew assembleDebug
   ```

2. **Install to Real Pixel**
   ```bash
   adb devices  # Confirm Pixel is listed
   adb install -r build/outputs/apk/debug/app-debug.apk
   # App should install and appear on home screen
   ```

3. **Launch & Verify**
   - Tap app icon → Onboarding screen appears
   - No crash on startup
   - Logcat shows no fatal errors:
     ```bash
     adb logcat | grep -i "error\|crash"
     ```

4. **Confirm HardwareKekPlugin.kt Compiles**
   - Open Android Studio: `File → Open → veyrnox-phase-2/android/app`
   - Should build without errors
   - No Kotlin compilation warnings in console

**Acceptance Criteria:**
- [ ] APK builds (gradlew assembleDebug succeeds)
- [ ] APK installs to real Pixel (adb install succeeds)
- [ ] App launches without crash
- [ ] No fatal logcat errors
- [ ] HardwareKekPlugin.kt compiles cleanly

**Sign-Off:** Android build succeeds, Pixel device ready

---

### Week 3: Enrollment & Keystore Testing

**Goal:** Implement and test Android Keystore HMAC-SHA256 key generation with StrongBox support

**Implementation Checklist:**

1. **Create HardwareKekPlugin.kt**
   ```kotlin
   // Location: android/app/src/main/java/com/veyrnox/HardwareKekPlugin.kt
   
   import android.security.keystore.KeyGenParameterSpec
   import android.security.keystore.KeyProperties
   import javax.crypto.KeyGenerator
   import javax.crypto.Mac
   
   class HardwareKekPlugin : Plugin() {
       
       @PluginMethod
       fun enrollHardwareCredential(call: PluginCall) {
           // Generate HMAC-SHA256 key in Android Keystore
           // Set biometric auth requirement + re-enroll invalidation
           // Return { enrolled: true }
       }
       
       @PluginMethod
       fun isHardwareEnrolled(call: PluginCall) {
           // Check if Keystore has enrolled key
           // Return { enrolled: true/false }
       }
       
       @PluginMethod
       fun getHardwareFactor(call: PluginCall) {
           // Retrieve H from Keystore (triggers biometric if configured)
           // Return { factor: <base64-H> }
       }
       
       @PluginMethod
       fun clearHardwareCredential(call: PluginCall) {
           // Delete enrolled key
       }
   }
   ```

2. **Keystore Configuration**
   ```kotlin
   val keyGenSpec = KeyGenParameterSpec.Builder(
       "VEYRNOX_HARDWARE_KEK_KEY",
       KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY
   )
       .setKeySize(256)
       .setDigests(KeyProperties.DIGEST_SHA256)
       .setSignaturePaddings(KeyProperties.SIGNATURE_PADDING_RSA_PKCS1)
       .setUserAuthenticationRequired(true)  // Biometric required
       .setUserAuthenticationValidityDurationSeconds(30)  // 30-sec window
       .setInvalidatedByBiometricEnrollment(true)  // Re-enroll invalidates
       .setIsStrongBoxBacked(true)  // Prefer StrongBox; fallback to Keystore
       .build()
   
   val keyGenerator = KeyGenerator.getInstance(
       KeyProperties.KEY_ALGORITHM_HMAC_SHA256,
       "AndroidKeyStore"
   )
   keyGenerator.init(keyGenSpec)
   val key = keyGenerator.generateKey()
   ```

3. **StrongBox Detection**
   ```kotlin
   val isStrongBoxAvailable = keyProperties.isStrongBoxBacked  // true if StrongBox, false if TEE
   ```

4. **Test Cycles**
   ```kotlin
   // Test 1: Enroll
   enrollHardwareCredential() → { enrolled: true }
   isHardwareEnrolled() → { enrolled: true }
   
   // Test 2: Retrieve (no biometric prompt yet; testing without ACL first)
   getHardwareFactor() → { factor: "..." }
   
   // Test 3: Clear
   clearHardwareCredential() → success
   isHardwareEnrolled() → { enrolled: false }
   
   // Test 4: Re-enroll
   enrollHardwareCredential() → { enrolled: true } (fresh key)
   getHardwareFactor() → { factor: "..." } (different from Test 2)
   ```

**Acceptance Criteria:**
- [ ] `enrollHardwareCredential()` succeeds (Keystore key created)
- [ ] `isHardwareEnrolled()` returns true after enroll
- [ ] `getHardwareFactor()` returns base64 H without error
- [ ] `clearHardwareCredential()` deletes key
- [ ] Repeat enroll/clear 3x with no stale keys
- [ ] StrongBox availability detected (log output confirms)

**Sign-Off:** Keystore key creation, retrieval, clearing; re-enroll cycle passes

---

### Week 4: Fingerprint & Biometric Re-enrollment

**Goal:** Wire fingerprint biometric ACL to Keystore, test unlock flow, test re-enroll invalidation

**Implementation Checklist:**

1. **Add Fingerprint ACL (BiometricPrompt)**
   ```kotlin
   // Modify unlock flow to prompt for biometric
   
   val biometricPrompt = BiometricPrompt(
       activity,
       ContextCompat.getMainExecutor(context),
       object : BiometricPrompt.AuthenticationCallback() {
           override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
               // Biometric approved → retrieve H from Keystore
               getHardwareFactor() { h -> ... }
           }
           
           override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
               // Biometric failed or cancelled
               showError(errString)
           }
       }
   )
   
   val promptInfo = BiometricPrompt.PromptInfo.Builder()
       .setTitle("Unlock Wallet")
       .setSubtitle("Use your fingerprint")
       .setNegativeButtonText("Cancel")
       .build()
   
   biometricPrompt.authenticate(promptInfo)
   ```

2. **Test Fingerprint Prompt**
   - Call unlock flow → BiometricPrompt appears on-device
   - Approve with enrolled fingerprint → H retrieved, vault unlocks
   - Deny fingerprint → prompt shows "Fingerprint not recognized"
   - Cancel → error handled, unlock fails

3. **Biometric Re-enrollment Test**
   - Enroll fingerprint (Settings → Security → Biometrics → Add fingerprint)
   - Launch app, unlock, confirm biometric works (prompt appears, unlock succeeds)
   - Change fingerprint (Settings → delete existing + add new fingerprint)
   - Attempt unlock with app → BiometricPrompt appears BUT fingerprint fails (device rejects old fingerprint)
   - Confirm `getHardwareFactor()` throws `KeyPermanentlyInvalidatedException`
   - Auto-detect in plugin: trigger `clearHardwareCredential()` + return error to JS
   - JS layer: display "Biometric changed, re-enrollment required"

4. **Latency Measurement**
   - Measure unlock latency: 5 full unlock cycles (biometric prompt + decrypt)
   - Expected: 1–3 seconds per call (includes fingerprint prompt + Keystore access)
   - Record: Min, max, median
   - Report in verification doc

5. **Error Path Testing**
   - User denies biometric → `onAuthenticationError()` called, error displayed
   - User cancels prompt → same as denial
   - Keystore unavailable → `KeyStoreException` caught, password recovery fallback offered
   - Vault NOT decrypted; unlock fails safely (I4)

**Acceptance Criteria:**
- [ ] BiometricPrompt renders on unlock
- [ ] Approve fingerprint → H retrieved, vault unlocks
- [ ] Deny/cancel fingerprint → error, unlock fails
- [ ] Biometric re-enroll → old key invalidated by OS (`KeyPermanentlyInvalidatedException`)
- [ ] Auto-clear detected in plugin, JS layer notified
- [ ] Error messages are user-friendly
- [ ] Latency: median ≤ 3 seconds
- [ ] 5-cycle test passes without hangs/crashes

**Sign-Off:** Fingerprint ACL works, biometric re-enroll invalidation confirmed, latency baseline recorded

---

### Week 5: Testnet & Verification Report

**Goal:** Create vault, unlock with fingerprint, send real ETH on Sepolia, capture txid, document

**Send Flow:**

1. **Create Vault**
   - Launch app → Onboarding
   - Create new wallet: testnet-safe seed
   - Set password (8+ chars for mobile testing)
   - Enroll hardware KEK: BiometricPrompt appears → approve fingerprint → Keystore key generated

2. **Verify Vault Unlocks with Fingerprint**
   - Kill app
   - Reopen → Lock screen
   - Enter password → BiometricPrompt → approve fingerprint → vault unlocks
   - Balances load: 0.05 Sepolia ETH shows

3. **Perform Sepolia Send**
   - Send → ETH (Sepolia)
   - Amount: 0.01 ETH
   - Recipient: testnet-safe address
   - Confirm: Fee, recipient
   - Unlock: Password + Fingerprint biometric
   - Broadcast

4. **Capture Txid**
   ```
   Transaction ID: 0x________________________________________
   Block: __________
   From: 0x_________________________________
   To: 0x_________________________________
   Amount: 0.01 ETH
   Status: SUCCESS
   Device: Pixel 7a (or model used)
   Android Version: 13 (or version tested)
   Keystore Tier: StrongBox (or Keystore if unavailable)
   Timestamp: 2026-07-28 HH:MM:SS UTC
   ```

**Verification Report: `/docs/verification/phase-2b-android-device-verification.md`**

```markdown
# Phase 2b — Android StrongBox Device Verification

**Device:** Pixel 7a, Android 13  
**Test Date:** 2026-07-28  
**Tester:** [Name]  

## Summary

Android StrongBox HMAC-SHA256 hardware KEK implementation verified on real device.
All verification gates PASSED; ready for audit.

## Verification Results

### Enrollment
- ✅ HardwareKekPlugin.kt compiles (no errors)
- ✅ enrollHardwareCredential() succeeds (Keystore key created)
- ✅ Keystore tier: StrongBox (or Keystore TEE)
- ✅ isHardwareEnrolled() returns true

### Fingerprint
- ✅ BiometricPrompt appears on getHardwareFactor()
- ✅ Fingerprint approved → H retrieved (no error)
- ✅ Fingerprint denied → error returned (unlock fails)
- ✅ Prompt cancelled → error handled gracefully

### Biometric Re-enroll
- ✅ Change fingerprint in Settings → change detected
- ✅ App unlock attempt → fingerprint fails (old key invalid, KeyPermanentlyInvalidatedException)
- ✅ Auto-clear triggered: isHardwareEnrolled() returns false
- ✅ Re-enrollment available: enrollHardwareCredential() succeeds with fresh key

### Performance
- Unlock latency (5 cycles):
  - Min: 1.4s, Max: 2.8s, Median: 2.1s
  - Status: ✅ Within expected range (1–3s)

### Keystore Details
- Backed by: StrongBox (Pixel 7a has dedicated secure processor)
- Re-enroll invalidation: Confirmed (automatic via OS)
- Fallback: Standard Keystore available if StrongBox unavailable

### Testnet Send (Sepolia)
- Vault created with testnet seed
- Unlock: Password + Fingerprint (both required)
- Send: 0.01 ETH to recipient
- **Txid: 0x__________________________________**
- **Block: __________**
- **Status on explorer: SUCCESS (confirmed)**

### Security
- ✅ I1 (keys never leave device): Keystore key non-extractable
- ✅ I2 (no silent data egress): No network during unlock/enroll
- ✅ I3 (deniability): Decoy sessions block all Keystore calls
- ✅ I4 (fail closed): Missing key → clear error, password recovery available
- ✅ I6 (hardware binding): DEK = HKDF(H || C), both required

## Sign-Off

Android StrongBox verified and ready for audit.

Tester: ________________  Date: 2026-07-28  
Lead Dev: ________________  Date: 2026-07-28  
```

**Acceptance Criteria:**
- [ ] Testnet send succeeds (txid on-chain, status SUCCESS)
- [ ] Device verification report complete and signed
- [ ] All security invariants (I1–I6) confirmed
- [ ] Keystore tier documented (StrongBox or Keystore TEE)
- [ ] Latency baseline recorded

**Sign-Off:** Real Pixel send on Sepolia confirmed; Phase 2b COMPLETE

---

## PHASE 2c: Integration & Cross-Platform (Weeks 5–6)

### Week 5: Feature Flag & Capability Detection

**Goal:** Wire native plugin into JS app, add capability detection, ensure backward compatibility

**Tasks:**

1. **Add Feature Flag to networks.js**
   ```javascript
   // src/wallet-core/networks.js
   export const HARDWARE_KEK_NATIVE_ENABLED = false;  // Phase 2 gate
   // Set to true only after audit sign-off
   ```

2. **Implement getHardwareCapabilities()**
   ```javascript
   // src/lib/native.js
   export async function getHardwareCapabilities() {
       try {
           const result = await Plugins.HardwareKek?.getHardwareFactor?.();
           if (result) {
               return {
                   platform: 'native',  // iOS or Android
                   available: true,
                   se_or_strongbox: true,
                   biometric_required: true
               };
           }
       } catch (e) {
           // Plugin not available or failed
       }
       return { available: false };
   }
   ```

3. **Update Unlock Flow to Use Native Plugin (if available)**
   ```javascript
   // src/lib/WalletProvider.jsx
   
   async function unlockWithHardwareKek(password, pin) {
       if (!HARDWARE_KEK_NATIVE_ENABLED) return null;
       
       const capabilities = await getHardwareCapabilities();
       if (!capabilities.available) return null;
       
       // Derive C (password/PIN factor) via Argon2id
       const C = await derivePasswordFactor(password, salt);
       
       // Retrieve H from native plugin (will prompt for biometric)
       const { factor: H_b64 } = await Plugins.HardwareKek.getHardwareFactor();
       const H = base64ToBytes(H_b64);
       
       // Combine KEK
       const DEK = await combineKek(H, C);
       
       // Decrypt vault
       const vault = await decryptVault(vaultCiphertext, DEK);
       
       // Zero sensitive values
       H.fill(0);
       C.fill(0);
       DEK.fill(0);
       
       return vault;
   }
   ```

4. **Backward Compatibility**
   - Non-KEK vaults (from Phase 1) should still decrypt via old path
   - Detect vault version: if no KEK metadata, use Argon2id-only path
   - New vaults on native: HARDWARE_KEK_NATIVE_ENABLED=true will use plugin

5. **Test Backward Compat**
   - [ ] Old vault (web, no hardware KEK) still unlocks on mobile
   - [ ] New vault (mobile, with hardware KEK) unlocks correctly
   - [ ] Feature flag toggle: off → web path, on → native path
   - [ ] Graceful degradation: plugin unavailable → fallback to password path

**Acceptance Criteria:**
- [ ] Feature flag gate working (toggle off/on changes unlock path)
- [ ] `getHardwareCapabilities()` returns correct platform info
- [ ] Native plugin callable from JS (no registration errors)
- [ ] Old vaults decrypt without errors
- [ ] New vaults encrypt/decrypt via plugin (when enabled)
- [ ] No regressions in non-KEK path

**Sign-Off:** Integration layer complete, backward compat verified

---

### Week 6: Device Test Suite & Audit Prep

**Goal:** Formalize verification artifacts, prepare audit materials, conduct final end-to-end tests

**Tasks:**

1. **Device Test Suite Skeleton**
   ```javascript
   // __tests__/hardware-kek-device.test.js
   
   describe('Hardware KEK Device Tests', () => {
       test('enrollHardwareCredential succeeds on real device', async () => {
           // Requires real iPhone or Pixel connected
           const result = await Plugins.HardwareKek.enrollHardwareCredential();
           expect(result.enrolled).toBe(true);
       });
       
       test('getHardwareFactor prompts for biometric', async () => {
           // Manual: user must approve biometric when prompted
           // Assertion: H is non-empty base64 string
       });
       
       test('biometric re-enroll invalidates key', async () => {
           // Manual: user changes biometric in Settings, then tests unlock
           // Assertion: KeyPermanentlyInvalidatedException or Face ID error
       });
       
       test('vault decrypt with hardware KEK succeeds', async () => {
           // Integration: Unlock flow with real vault + real biometric
           // Assertion: Vault ciphertext decrypts to valid JSON
       });
   });
   ```

2. **Compile Audit Materials**
   Create `/docs/audit-materials/phase-2d/`:

   - **code-review-ios.md** — Source review of HardwareKekPlugin.swift
     - Key generation in Secure Enclave
     - Keychain storage config (access control, sync settings)
     - Face ID ACL binding
     - Error handling + fallback path
     - Threat model: What attacks are prevented? (offline-seizure, biometric replay, etc.)

   - **code-review-android.md** — Source review of HardwareKekPlugin.kt
     - Keystore key config (biometric + re-enroll)
     - StrongBox vs standard Keystore fallback
     - BiometricPrompt integration
     - Error handling
     - Threat model: Same as iOS

   - **device-verification-ios.md** — (from Week 4 report)
     - Real iPhone model, iOS version
     - Sepolia txid + block
     - Face ID test results
     - Latency baseline
     - Security invariants checked

   - **device-verification-android.md** — (from Week 5 report)
     - Real Pixel model, Android version
     - Sepolia txid + block
     - Fingerprint test results
     - StrongBox confirmation
     - Latency baseline
     - Security invariants checked

   - **threat-model-update.md** — I6 hardening for native
     ```markdown
     # Hardware KEK Phase 2: Threat Model Update
     
     ## Offline-Seizure Threat (CLOSED)
     **Before Phase 2:** PIN-derived Argon2id exhaustible via local brute-force.
     **Phase 2 Closure:** H requires live Secure Enclave (iOS) / StrongBox (Android) + biometric.
     - Attacker can brute-force C (Argon2id password factor) offline
     - Attacker cannot derive H (biometric + hardware-gated)
     - DEK requires H + C → Offline attacker blocked
     - Result: ✅ CLOSED for mobile
     
     ## Biometric Replay (MITIGATED)
     **Threat:** Attacker replays recorded fingerprint/face to unlock device.
     **Mitigation:** iOS Face ID uses temporal/anti-replay checks (Apple device-level). Android fingerprint vetted by OS BiometricPrompt (Google device-level).
     - OS prevents replay (Veyrnox trusts OS-level biometric vetting)
     - Our plugin treats biometric approval as sufficient
     - Result: ✅ MITIGATED (OS-enforced, not Veyrnox code)
     
     ## Biometric Re-enroll (CLOSED)
     **Threat:** User re-enrolls biometric; old key should be invalidated.
     **Mitigation:**
     - iOS: `kSecAccessControlBiometryCurrentSet` auto-invalidates on re-enroll (Apple device-level)
     - Android: `setInvalidatedByBiometricEnrollment(true)` auto-invalidates (Google device-level)
     - Our code detects invalidation (Face ID error, KeyPermanentlyInvalidatedException)
     - Result: ✅ CLOSED (auto-invalidation + detection)
     
     ## Key Extraction (MITIGATED)
     **Threat:** Debugger/RAM dump extracts key from app memory.
     **Mitigation:** H is never stored on disk; returned only during unlock. DEK zeroed post-use.
     - H obtained from Secure Enclave/StrongBox only during `getHardwareFactor()` call
     - DEK exists only during decrypt window
     - Both zeroed in finally-block
     - Result: ✅ MITIGATED (in-memory window minimized)
     
     ## Password Rollover (NOT CLOSED)
     **Threat:** Attacker with vault ciphertext + time can brute-force C (Argon2id).
     **Status:** ⏳ OUT OF SCOPE for Phase 2 (same as Phase 1)
     - 64 MiB / t=3 Argon2id is exhaustible offline if ciphertext captured
     - Phase 2 adds H (offline-proof) but does NOT improve password entropy
     - If user reuses password across apps, cross-site compromise is independent risk
     - Result: ⏳ UNCHANGED (not a Phase 2 finding; existing design decision)
     ```

   - **testnet-txid-summary.md** — All 3 verified txids
     ```
     # Phase 2 Testnet Verification Summary
     
     ## iOS Face ID (Week 4)
     - Device: iPhone 15 Pro, iOS 17.4
     - Txid: 0x________________________________________
     - Block: __________ (Sepolia)
     - Explorer: https://etherscan.io/sepolia/tx/0x________...
     - Status: SUCCESS
     - Timestamp: 2026-07-24 HH:MM UTC
     
     ## Android Fingerprint (Week 5)
     - Device: Pixel 7a, Android 13
     - Txid: 0x________________________________________
     - Block: __________ (Sepolia)
     - Explorer: https://etherscan.io/sepolia/tx/0x________...
     - Status: SUCCESS
     - Timestamp: 2026-07-28 HH:MM UTC
     
     ## Verification Gate Summary
     - ✅ iOS unlock + send = on-device biometric KEK working
     - ✅ Android unlock + send = on-device biometric KEK working
     - ✅ Both txids confirmed on-chain explorer
     - ✅ All I1–I6 security invariants validated
     → Phase 2 READY FOR AUDIT
     ```

3. **Prepare Audit Kick-Off Presentation** (30 min)
   - Slide deck: Hardware KEK architecture (I6 definition, H+C combination, offline-seizure closure)
   - Demo: App build on real device, unlock with biometric, send txid on-chain
   - Q&A topics (anticipated):
     - Is SE/Keystore attestation required? (Phase 2 or Phase 3)
     - Should StrongBox be enforced on Android? (Phase 2 or Phase 3)
     - Are testnet txids sufficient proof? (or do we need cryptographic attestation)
     - Key rotation policy? (not addressed; can defer to Phase 3)

**Acceptance Criteria:**
- [ ] Audit materials compiled (code review, device verification, threat model, txid summary)
- [ ] No blocking issues from QA (device test suite runs without fatal errors)
- [ ] Presentation deck ready for auditor
- [ ] All Q&A topics anticipated + talking points prepared

**Sign-Off:** Audit materials ready, presentation prepared; Phase 2c COMPLETE

---

## PHASE 2d: Audit & Sign-Off (Weeks 7–8)

### Week 7: Audit Submission & Initial Review

**Goal:** Submit materials to auditor, kick off review, prepare for initial findings

**Tasks:**

1. **Submit Audit Package**
   - Create `/docs/audit-materials/phase-2d/` directory (created in Week 6)
   - Package for auditor:
     ```
     Audit Package — Phase 2 Hardware KEK Native Binding
     ├── code-review-ios.md
     ├── code-review-android.md
     ├── device-verification-ios.md
     ├── device-verification-android.md
     ├── threat-model-update.md
     ├── testnet-txid-summary.md
     ├── HardwareKekPlugin.swift (source)
     ├── HardwareKekPlugin.kt (source)
     └── native.js (integration layer)
     ```
   - Transmit to auditor with cover letter:
     ```
     Subject: Veyrnox Phase 2 Audit Submission — Hardware KEK Native Binding
     
     Attached: Phase 2 hardware KEK implementation materials.
     
     Summary: iOS Secure Enclave + Android StrongBox bindings for offline-seizure closure.
     Verified on real iPhone 15 Pro (Face ID, Sepolia txid 0x______) and Pixel 7a (Fingerprint, txid 0x______).
     
     Scope: Native plugin code (Swift + Kotlin), integration layer (JS), device verification reports.
     Not in scope: Remote attestation, OS-level jailbreak detection (Phase 4).
     
     Timeline: Audit weeks 7–8 (4-week window). Kick-off meeting: [Date/Time]
     
     Contact: [Lead Dev Name], [email]
     ```

2. **Kick-Off Meeting with Auditor**
   - Present: Lead dev + PM + (optionally) security lead
   - Agenda:
     - 10 min: Architecture overview (I6 definition, H+C combination)
     - 10 min: Demo on real device (unlock, biometric, send)
     - 5 min: Testnet txid evidence
     - 5 min: Q&A + anticipated findings
   - Questions to ask auditor:
     - Is SE/Keystore attestation required for Phase 2, or deferred to Phase 3?
     - Should StrongBox be enforced on Android (fail if unavailable), or acceptable to fall back to standard Keystore?
     - Are testnet txids sufficient proof of function, or do you require cryptographic attestation?

3. **Prepare for Initial Findings**
   - Auditor typically returns initial findings by end of Week 7
   - Expected categories:
     - **CRITICAL:** Potential fund loss, key extraction, offline-proof broken
     - **HIGH:** Biometric bypass, re-enrollment not detected, fallback weakness
     - **MEDIUM:** Latency concerns, error message disclosure, logging leaks
     - **LOW:** Documentation gaps, variable naming, test coverage
   - Be prepared to respond within 48 hours (prioritize CRITICAL/HIGH)

**Acceptance Criteria:**
- [ ] Audit package delivered to auditor
- [ ] Kick-off meeting scheduled and completed
- [ ] Initial findings received (expected by end of Week 7)
- [ ] Response plan drafted for CRITICAL/HIGH findings

**Sign-Off:** Audit submitted, kick-off completed, findings acknowledged

---

### Week 8: Findings Resolution & Mainnet Gate

**Goal:** Address audit findings, obtain sign-off, prepare mainnet promotion

**Tasks:**

1. **Triage Findings**
   - Categorize by severity (CRITICAL, HIGH, MEDIUM, LOW)
   - Estimate effort per finding (hours to fix + re-test)
   - Prioritize CRITICAL + HIGH (target: resolve by Wednesday of Week 8)

2. **Address Findings**
   - For each finding:
     - Create a branch: `fix/phase-2d-finding-<ID>`
     - Implement fix
     - Add test case (if not already tested)
     - Re-test on real device (if affects unlock/send flow)
     - Commit + push
   - Re-run full test suite:
     ```bash
     npm test
     npm run typecheck
     npm run lint
     ```

3. **Re-Verify on Real Devices** (if findings affect unlock/send)
   - iOS: Perform test send on Sepolia, capture new txid
   - Android: Perform test send on Sepolia, capture new txid
   - Update verification reports with new txids (if any)

4. **Prepare Mainnet Sign-Off Document**
   Create: `/docs/audit-triage/phase-2d-sign-off.md`

   ```markdown
   # Phase 2 Audit Sign-Off

   **Audit Period:** 2026-07-XX to 2026-08-XX  
   **Auditor:** [Audit firm name]  
   **Findings:** [Count] total ([X] CRITICAL, [Y] HIGH, [Z] MEDIUM, [W] LOW)  
   **Resolution Status:** [X] Resolved, [Y] Deferred, [Z] Accepted Risk

   ## Finding Resolutions

   | ID | Severity | Title | Status | Resolution |
   |----|----------|-------|--------|-----------|
   | P2-1 | CRITICAL | [Description] | ✅ RESOLVED | [PR #XXX] |
   | P2-2 | HIGH | [Description] | ✅ RESOLVED | [PR #XXX] |
   | ... | ... | ... | ... | ... |

   ## Security Invariants Validated

   - ✅ I1 — Keys never leave device (SE/StrongBox non-extractable verified)
   - ✅ I2 — No silent data egress (biometric gate local-only)
   - ✅ I3 — Deniability mode blocks hardware calls (confirmed)
   - ✅ I4 — Fail closed (error paths explicit, no fallback to weak key)
   - ✅ I6 — Hardware binding (H + C both required, offline-proof achieved)

   ## Device Verification Complete

   - ✅ iPhone 15 Pro Face ID unlock + Sepolia send: `0x________` (block _____)
   - ✅ Pixel 7a Fingerprint unlock + Sepolia send: `0x________` (block _____)
   - ✅ Biometric re-enroll invalidation confirmed on both platforms
   - ✅ Error handling tested + user-friendly messaging confirmed

   ## Mainnet Promotion Gate

   All conditions met; Phase 2 approved for mainnet. Next steps:

   1. Set `HARDWARE_KEK_NATIVE_ENABLED = true` in networks.js
   2. Merge to main branch
   3. Tag release: `v1.x.x-phase-2-hardware-kek-native`
   4. Update Feature-Status.md: Mark Phase 2 as ✅ VERIFIED

   **Approved By:**
   - Auditor: ___________________  Date: ________
   - Lead Dev: ___________________  Date: ________
   - PM/Owner: ___________________  Date: ________
   ```

5. **Flip Feature Flag & Merge**
   ```bash
   cd ~/veyrnox-phase-2
   git checkout -b feat/phase-2-mainnet-promotion
   
   # Edit networks.js
   # OLD: export const HARDWARE_KEK_NATIVE_ENABLED = false;
   # NEW: export const HARDWARE_KEK_NATIVE_ENABLED = true;
   
   git add src/wallet-core/networks.js
   git commit -m "Phase 2 mainnet gate: Enable native hardware KEK

   - iOS Secure Enclave Face ID binding
   - Android StrongBox/Keystore fingerprint binding
   - All audit findings resolved (P2-1, P2-2, ...)
   - Device verification complete (iPhone + Pixel Sepolia sends)
   - Ready for mainnet promotion

   Co-Authored-By: [Auditor Name] <auditor@firm.com>"
   
   git push origin feat/phase-2-mainnet-promotion
   ```

6. **Update Feature-Status.md**
   - Section §4 "Security — S1 foundation & Hardware KEK Phase 1/2"
   - Update Phase 2 line:
     ```
     **Phase 2 — Native Hardware KEK (Q3 2026 SHIPPED):** ✅ VERIFIED 2026-08-XX
     ```
   - Add link to verification reports:
     - iOS: `docs/verification/phase-2a-ios-device-verification.md`
     - Android: `docs/verification/phase-2b-android-device-verification.md`

7. **Post-Ship Comms**
   - Email team: "Phase 2 shipped. Hardware KEK now live on iOS/Android."
   - Update roadmap: Mark Phase 2 COMPLETE
   - Plan Phase 3 (remote attestation, RASP OS-level probes) if desired

**Acceptance Criteria:**
- [ ] All CRITICAL findings resolved
- [ ] All HIGH findings resolved (or explicitly deferred with risk acceptance)
- [ ] Mainnet sign-off document signed by auditor
- [ ] Feature flag set to true + merged to main
- [ ] Feature-Status.md updated with Phase 2 VERIFIED status
- [ ] Release tagged and communicated to team

**Sign-Off:** Phase 2 audit complete, mainnet promotion approved

---

## Critical Dates & Milestones

```
Pre-Kickoff (Weeks -2 to 0)
  • Device acquisition: iPhone + Pixel
  • Testnet funds: Sepolia ETH, BTC, SOL (as needed)
  • Environment: Xcode + Android Studio
  • Team: Slack channel, daily standup scheduled

Phase 2a — iOS Secure Enclave (Weeks 1–4)
  Week 1  (Day 1–7):   Build on device, compile HardwareKekPlugin.swift
  Week 2  (Day 8–14):  Keychain enrollment, key generation, storage test
  Week 3  (Day 15–21): Face ID ACL, biometric prompt, re-enroll invalidation
  Week 4  (Day 22–28): Real vault, Face ID unlock, Sepolia send (TXID #1)

Phase 2b — Android StrongBox (Weeks 2–5)
  Week 2  (Day 8–14):  Build on device, compile HardwareKekPlugin.kt
  Week 3  (Day 15–21): Keystore enrollment, key generation, storage test
  Week 4  (Day 22–28): Fingerprint ACL, BiometricPrompt, re-enroll invalidation
  Week 5  (Day 29–35): Real vault, fingerprint unlock, Sepolia send (TXID #2)

Phase 2c — Integration & Audit Prep (Weeks 5–6)
  Week 5  (Day 29–35): Feature flag gate, getHardwareCapabilities(), backward compat test
  Week 6  (Day 36–42): Device test suite, audit materials, presentation deck

Phase 2d — Audit & Sign-Off (Weeks 7–8)
  Week 7  (Day 43–49): Audit submission, kick-off meeting, initial findings
  Week 8  (Day 50–56): Findings resolution, mainnet gate flip, release tag

TOTAL: 8 weeks (56 days) from kickoff to mainnet promotion
```

---

## Success Criteria (Hard Gates)

All items must pass before Phase 2 is marked SHIPPED/VERIFIED:

- [ ] **iOS:** Real iPhone Face ID unlock → Sepolia send → txid confirmed on-chain (block, status SUCCESS)
- [ ] **Android:** Real Pixel fingerprint unlock → Sepolia send → txid confirmed on-chain (block, status SUCCESS)
- [ ] **Biometric Re-enroll:** Confirmed working on both platforms (old key auto-invalidated, re-enroll succeeds)
- [ ] **Error Handling:** All error paths tested (user cancel, biometric mismatch, hardware unavailable)
- [ ] **Performance:** Unlock latency baselines recorded (iPhone ≤2s, Pixel ≤3s)
- [ ] **Security Invariants:** I1–I6 all validated
- [ ] **Audit Approval:** All CRITICAL + HIGH findings resolved; auditor sign-off obtained
- [ ] **Zero Regressions:** Existing send paths still work; backward compat verified
- [ ] **Feature Flag:** `HARDWARE_KEK_NATIVE_ENABLED = true` on main branch
- [ ] **Documentation:** Feature-Status.md updated, verification reports signed

---

## Risk Mitigation

| Risk | Impact | Probability | Mitigation |
|---|---|---|---|
| Device unavailable mid-sprint | Cannot verify implementation | Medium | Pre-acquire + budget fallback purchase ($500–$1200) |
| Biometric re-enroll complexity | Unknown behavior on real hardware | High | Early testing (Week 3–4) + document exact OS behavior |
| Audit scope creep (attesting, key rotation, etc.) | Delay mainnet gate | Medium | Lock Phase 2 scope; defer extras to Phase 3 in kickoff meeting |
| Testnet fund shortage | Cannot perform send verification | Low | Budget $50 for faucet drips; order in advance |
| Capacitor plugin registration fails at runtime | Cannot call native code from JS | High | Mitigated by plugin author review + test on real device early (Week 1) |
| Secure Enclave / StrongBox behavior unknown | Assume wrong about key properties | High | Real-device testing is the ONLY true path; no simulator |
| Audit approval delayed (auditor backlog) | Miss mainnet window | Low | Schedule audit 4 weeks in advance; escalate if delayed |

---

## Post-Launch (Phase 3 & Beyond)

- **Hardware Attestation (iOS + Android)** — auditor approval pending
- **30-second unlock timeout optimization** — convenience vs security trade-off
- **StrongBox enforcement on Android** — if auditor requires (vs optional fallback)
- **Multi-device KEK sync** — backend work (self-custody challenge)
- **Passkey as secondary hardware factor** — FIDO2 enhancements

---

## Team Sign-Off Template

```
PHASE 2 KICKOFF — TEAM SIGN-OFF

Device Acquisition:
  [ ] iPhone 15 Pro acquired: ______________________ Date: _______
  [ ] Pixel 7a acquired: ______________________ Date: _______

Environment Setup:
  [ ] Xcode 15.3+ installed: ______________________ Date: _______
  [ ] Android Studio 2023.2+ installed: ______________________ Date: _______
  [ ] Git worktree created: ______________________ Date: _______

Testnet Funding:
  [ ] iPhone: 0.05 Sepolia ETH funded: ______________________ Date: _______
  [ ] Pixel: 0.05 Sepolia ETH funded: ______________________ Date: _______

Team Coordination:
  [ ] Audit contact confirmed: ______________________ Date: _______
  [ ] Slack channel created: ______________________ Date: _______
  [ ] Daily standup scheduled: ______________________ Date: _______
  [ ] Blocker escalation path defined: ______________________ Date: _______

iOS Phase 2a Sign-Off (Week 4):
  [ ] Real iPhone Sepolia send: 0x____________________ Date: _______
  [ ] Device verification report signed: ______________________ Date: _______

Android Phase 2b Sign-Off (Week 5):
  [ ] Real Pixel Sepolia send: 0x____________________ Date: _______
  [ ] Device verification report signed: ______________________ Date: _______

Audit Submission (Week 7):
  [ ] Materials delivered to auditor: ______________________ Date: _______
  [ ] Kick-off meeting completed: ______________________ Date: _______

Mainnet Promotion (Week 8):
  [ ] Audit sign-off obtained: ______________________ Date: _______
  [ ] Feature flag flipped to true: ______________________ Date: _______
  [ ] Release tagged + shipped: ______________________ Date: _______

Project Lead: ______________________ Date: _______
PM/Owner: ______________________ Date: _______
Audit Lead: ______________________ Date: _______
```

---

**Document prepared by:** Claude Haiku 4.5  
**Date:** 2026-07-01  
**Status:** READY FOR TEAM REVIEW (dispatch after Phase 1 UAT complete)
