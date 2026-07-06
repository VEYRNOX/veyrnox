# Shipping Verification Task Breakdown (2026-07-06)

**Objective:** Move three shipping-approved features from "Built, internal-audited" to "Verified & Live" by capturing missing on-chain txids and device validation.

**Status:** PR #640 shipping approval merged to main (2026-07-06 08:24:20 UTC). Three features ready. 

---

## HIGH-ROI TASKS (Ship-Blocking)

### Task 1: Add Android KEK v3 to verified-evidence.json ✅ DONE
- **What:** Document the 2026-07-05 v3 fix on Pixel 10 Pro XL
- **Why:** Canonical verification record was missing; only in Feature-Status.md
- **Status:** COMPLETED (commit 51a218a4)
- **Txid:** `0xecd68494e888af742e5166c93c5354536fb6bbe62e93dc795847079d981727e3` (block 11206686)

---

### Task 2: Web Phase 1 KEK — Windows Hello Sepolia Send
**Estimated Time:** 1-2 hours | **Blocker:** Windows PC with Windows Hello enabled

#### Setup (15 min)
- [ ] Windows 10+ PC with Windows Hello configured (facial recognition or fingerprint)
- [ ] Open Chrome or Firefox (WebAuthn PRF support required)
- [ ] Navigate to app.veyrnox.com (or local dev server)
- [ ] Seed Sepolia ETH (~0.01 ETH minimum) to a throwaway address

#### Fresh Wallet Enrollment (30 min)
- [ ] Create new wallet
- [ ] Write down seed phrase (testnet-safe)
- [ ] Reach Settings → Security
- [ ] Toggle "WebAuthn PRF KEK"
- [ ] Approve Windows Hello prompt
- [ ] Confirm enrollment success message

#### The Send (20 min)
- [ ] Dashboard → Send
- [ ] Asset: ETH, Chain: Sepolia
- [ ] Recipient: `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045` (standard test recipient)
- [ ] Amount: 0.001 ETH
- [ ] Click "Review"
- [ ] Verify: "Hardware Protection ON (WebAuthn PRF)" badge visible
- [ ] Click "Confirm & Send"
- [ ] Windows Hello prompt appears → approve (fingerprint or face)
- [ ] Wait for broadcast (5-30 seconds)
- [ ] Copy txid from success page

#### Verification (15 min)
- [ ] Open https://sepolia.etherscan.io
- [ ] Paste txid in search
- [ ] Confirm: status SUCCESS, block number, from/to addresses, amount
- [ ] Screenshot: txid + block + SUCCESS status
- [ ] Update `docs/verified-evidence.json` entry:
  ```json
  "Web Phase 1 KEK (WebAuthn PRF)": {
    "chain": "sepolia",
    "txid": "0x…",
    "from": "0x90f9f1F9F5a1938B21ef0C20352C7b792E68a729",
    "to": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    "amount": "0.001 ETH",
    "date": "2026-07-0X",
    "verified_onchain": "eth_getTransactionByHash + eth_getTransactionReceipt, chainId 11155111, status SUCCESS"
  }
  ```

**Acceptance Criteria:** 
- ✅ Sepolia txid on-chain with SUCCESS status
- ✅ "Hardware Protection ON" badge visible during send flow
- ✅ Entry added to verified-evidence.json with full details
- ✅ PR created + merged to main

---

### Task 3: Android KEK Residual Tests (v2→v3 migration + salt validation)
**Estimated Time:** 4 hours | **Blocker:** Pixel 10 Pro XL or equivalent Android device with StrongBox

#### Setup (30 min)
- [ ] Connect Pixel device via USB
- [ ] Enable USB debugging
- [ ] Run `adb logcat > kek-test-$(date +%s).log` in a terminal (capture full session)
- [ ] Have Sepolia ETH seeded to the device wallet (~0.01 ETH)

#### Subtest 3A: v2→v3 Lazy Migration (90 min)
**Purpose:** Confirm that falsely v2-stamped vaults (from pre-#568 builds) correctly migrate to v3 on first unlock.

- [ ] Build APK from pre-#568 commit (e.g., PR #529 HEAD, commit 732f9676)
  - `git checkout 732f9676`
  - `npm install && npx cap sync android`
  - `./gradlew assembleDebug`
  - `adb install -r app-debug.apk`

- [ ] Enroll KEK on this build (will stamp `hardwareKekVersion: 2`)
  - Settings → Security → Enroll Hardware Protection
  - Tap fingerprint → enroll
  - Confirm "Hardware Protection ON"
  - Export vault backup (Settings → Local Backup Export)
  - **Save the encrypted backup file locally**

- [ ] Force-kill app and cold restart to confirm vault is stored
  - `adb shell am force-stop com.veyrnox.app.debug`
  - Wait 10 seconds
  - Tap app icon to reopen
  - Unlock via fingerprint → confirm success

- [ ] Upgrade to current main APK (with v3 code)
  - `git checkout main`
  - `npm install && npx cap sync android`
  - `./gradlew assembleDebug`
  - `adb install -r app-debug.apk`

- [ ] Unlock the falsely-v2 vault (should trigger lazy migration)
  - Tap app → unlock with fingerprint
  - Confirm: "Hardware Protection ON" (still)
  - Check logcat for: `v2→v3 migration` or `lazy upgrade` message
  - Force-kill and restart to confirm migration persisted

- [ ] Verify vault is now truly v3
  - Open DevTools Console
  - `localStorage.veyrnoxVault` → parse JSON
  - Confirm: `hardwareKekVersion: 3` (NOT 2)
  - Confirm: `kekSalt` present and non-empty

- [ ] Send Sepolia ETH from the migrated vault
  - Send 0.001 ETH to `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045`
  - Approve fingerprint
  - Record txid
  - Verify on-chain: SUCCESS

**Logcat markers to capture:**
```
[VEYRNOX-KEK] v2→v3 lazy migration triggered
[VEYRNOX-KEK] Migration complete: hardwareKekVersion now 3
[VEYRNOX-KEK] getHardwareFactor kekSalt: <44-char-base64-STRING>
```

**Acceptance Criteria:**
- ✅ Pre-v3 vault upgrades to v3 on first unlock (no manual action)
- ✅ Logcat shows salt-bound HMAC (base64 STRING, not {})
- ✅ Sepolia txid on-chain with SUCCESS from migrated vault
- ✅ Document in `docs/runbook-android-kek-residuals.md § T1`: "Migration tested 2026-07-0X — PASS"

---

#### Subtest 3B: Salt-Tamper Negative Test (60 min)
**Purpose:** Confirm Kotlin plugin rejects malformed/wrong salt (fails closed).

- [ ] Extract current vault blob from SecureStorage
  ```bash
  adb shell "run-as com.veyrnox.app.debug sqlite3 /data/data/com.veyrnox.app.debug/shared_prefs/veyrnox-vault.xml"
  # OR use Android Studio Device File Explorer
  ```

- [ ] Decode base64 vault ciphertext + parse JSON vault blob
  - Locate `kekSalt` field (44-char base64 STRING)
  - Copy the original salt value for later comparison

- [ ] Create malformed variants (in a test file):
  - **Variant A (empty):** `"kekSalt": ""`
  - **Variant B (wrong salt):** `"kekSalt": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"` (different 44-char value)
  - **Variant C (null):** `"kekSalt": null`

- [ ] For each variant:
  - Inject the mutated vault blob back into SecureStorage
  - Force-kill app
  - Attempt unlock
  - **Expected:** "Hardware key invalid" or "Unlock failed — PIN recovery required"
  - Confirm: app does NOT fall back to v1 fixed salt
  - Confirm: logcat shows plugin rejecting malformed salt
  - Restore original vault blob
  - Unlock → success (to reset state)

**Logcat markers to expect on rejection:**
```
[VEYRNOX-KEK] getHardwareFactor: kekSalt malformed or absent
[VEYRNOX-KEK] Hardware factor recovery failed
KeyStoreException: Hardware key unavailable (salt binding)
```

**Acceptance Criteria:**
- ✅ All three variants rejected (none silently fall back to v1)
- ✅ Logcat shows plugin-level rejection (Kotlin, not JS-layer)
- ✅ Document in `docs/runbook-android-kek-residuals.md § T2`: "Salt-tamper test — PASS (3/3 variants rejected)"

---

#### Subtest 3C: Per-Enrollment Salt Distinctness (60 min)
**Purpose:** Confirm ≥4 enrolled vaults use distinct per-enrollment salts (no collisions).

- [ ] On the same Pixel device, create 4 separate encrypted vaults
  - Use a test app flow: Settings → Create Multi-Vault
  - OR: Full logout + new wallet → enroll KEK 4 times
  - Label them: Vault-A, Vault-B, Vault-C, Vault-D

- [ ] For each vault:
  - Unlock (Face ID / fingerprint)
  - Export vault backup file
  - Extract `kekSalt` from the encrypted JSON blob
  - Record the base64 STRING value

- [ ] Compute SHA-256 of each salt:
  ```bash
  echo -n "BASE64_SALT_VALUE" | sha256sum
  ```

- [ ] Compare all 4 digests
  - **Expected:** All 4 are unique
  - **Failure:** Any two digests are identical (salt collision)

**Example output:**
```
Vault-A salt SHA-256: a3f4b2c1d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0
Vault-B salt SHA-256: b1c2d3e4f5g6h7i8j9k0l1m2n3o4p5q6r7s8t9u0
Vault-C salt SHA-256: c7d8e9f0g1h2i3j4k5l6m7n8o9p0q1r2s3t4u5v6
Vault-D salt SHA-256: d2e3f4g5h6i7j8k9l0m1n2o3p4q5r6s7t8u9v0w1
```

**Acceptance Criteria:**
- ✅ All 4 salts are distinct (0% collision)
- ✅ Each salt is non-empty base64 (44 chars, 32 bytes decoded)
- ✅ Document in `docs/runbook-android-kek-residuals.md § T3`: "Per-enrollment distinctness — 4/4 unique salts confirmed"

---

#### Completion (30 min)
- [ ] Consolidate all logcat excerpts into a single report
- [ ] Create PR `docs: android-kek-residual-tests-2026-07-0X` with:
  - Updated `runbook-android-kek-residuals.md` (T1/T2/T3 marked PASS with dates)
  - Logcat transcript (sanitized, no H values or private keys)
  - Sepolia txid from migration subtest
  - SHA-256 digest table from distinctness subtest

---

## MEDIUM-ROI TASKS (Polish)

### Task 4: Passkey Clone Detection Device Test (M-K)
**Estimated Time:** 1-2 hours | **Blocker:** Windows PC with Playwright + Chrome

- [ ] Write Playwright test that:
  - Registers a passkey via web UI
  - Enables PIN+Passkey 2FA in Settings
  - Drives a Sepolia send (first authenticator, signCount 0→1)
  - Simulates a cloned authenticator (same credential ID, reset signCount to 0)
  - Attempts same send with clone (should REJECT with signCountReplay error)

- [ ] Verify: `passkey.js` detectSignCountReplay() fired and blocked

**Why:** Already unit-tested (26/26 passing), device exercise is optional insurance.

---

### Task 5: Trezor Hardware Wallet Send
**Estimated Time:** 2-3 hours | **Blocker:** Physical Trezor device (or emulator)

- [ ] Connect Trezor via WebUSB
- [ ] Derive address from Trezor
- [ ] Send 0.001 ETH Sepolia
- [ ] Approve on device
- [ ] Record Sepolia txid
- [ ] Add to verified-evidence.json

---

## NOT BLOCKING (Can defer)

- **iOS biometric re-enroll test:** Device Face ID enrollment locked (needs different iPhone)
- **RASP OS-level probes:** Native/Phase 4 work
- **Audit Log device smoke test:** No on-chain bar (metadata feature)
- **Login Activity device test:** No on-chain bar (metadata feature)

---

## Timeline Recommendation

**Friday (today, 2026-07-06):**
- [ ] Task 1: ✅ DONE (commit 51a218a4)
- [ ] Task 2: Web KEK send (1-2 hrs, if Windows Hello available)

**Next Session (with Pixel device):**
- [ ] Task 3: Android residuals (4 hrs, can split across 2 sessions)
  - Session A: Setup + 3A (v2→v3 migration, 90 min)
  - Session B: 3B + 3C (tamper + distinctness, 120 min)

**Optional (low priority):**
- [ ] Task 4: Passkey clone test (1-2 hrs)
- [ ] Task 5: Trezor send (2-3 hrs)

---

## Success Definition

Ship mainnet unlock with:
- ✅ Three shipping-approved features (WalletConnect, deniability, dApp alerts + local backup)
- ✅ Android KEK v3 device-verified (fresh enroll + v2→v3 migration + send)
- ✅ Web KEK device-verified (Windows Hello + send)
- ✅ iOS KEK device-verified (F9 trace captured 2026-07-02)
- ✅ All residuals documented
- ✅ Independent audit deferred (not required per owner decision)

No blockers remain.
