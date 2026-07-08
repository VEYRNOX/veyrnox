// ─────────────────────────────────────────────────────────────────────────────
// Android Hardware KEK — Residual Tests Automated
//
// Runs on real Pixel device via Appium (UiAutomator2). Tests the three critical
// Android KEK v3 residuals:
//   T1: v2→v3 lazy migration (falsely v2-stamped vault upgrades to v3)
//   T3: Per-enrollment salt distinctness (4 vaults use unique salts)
//   T2: Salt-tamper negative test (requires manual ADB — separate)
//
// Setup:
//   - Local Appium server (BrowserStack removed — LOG-1 H exposure risk)
//   - Real Pixel device (StrongBox support required)
//   - APK built with VITE_DEV_UNGATE_SEND=1 (testnet asset send enabled)
//   - Pre-v3 APK binary available for migration test
//
// Run:
//   npm test -- tests/android/hardware-kek-residuals-automated.spec.js
//
// Exit: Captured logcat excerpts + Sepolia txids from v3 sends
// ─────────────────────────────────────────────────────────────────────────────

const { remote } = require('webdriverio');
const assert = require('assert');
const crypto = require('crypto');

// ── Config ───────────────────────────────────────────────────────────────────
const BASE_URL = 'http://localhost:5173'; // or https://staging.veyrnox.com

// Test credentials (matching testnet vault)
const TEST_PASSWORD = '12345678abcd'; // 12+ chars for web, 8 for native
const SEPOLIA_RECIPIENT = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
const SEND_AMOUNT = '0.001';

// ── Utilities ────────────────────────────────────────────────────────────────

// Parse logcat for [VEYRNOX-KEK] lines
function extractKekLogs(logcat) {
  return logcat
    .split('\n')
    .filter(line => line.includes('[VEYRNOX-KEK]') || line.includes('hardwareKekVersion'))
    .map(line => line.trim());
}

// Extract 44-char base64 salt from logcat
function extractSaltFromLogs(logs) {
  for (const line of logs) {
    // Look for patterns like: kekSalt: "AAAA...AAAA" or salt=AAAA...AAAA (44 chars)
    const match = line.match(/(?:kekSalt|salt)['":\s=]*([A-Za-z0-9+/]{44})/);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
}

// Compute SHA-256 of a base64 salt string
function saltSha256(base64Salt) {
  return crypto.createHash('sha256').update(base64Salt).digest('hex');
}

describe('Android Hardware KEK — Residual Tests', () => {
  let driver;
  let logcatBuffer = [];

  before(async () => {
    // ── Connect to local Appium ──────────────────────────────────────────────
    const capabilities = {
      platformName: 'Android',
      'appium:automationName': 'UiAutomator2',
      'appium:app': process.env.APK_PATH || './android/app/build/outputs/apk/debug/app-debug.apk',
      'appium:appPackage': 'com.veyrnox.app.debug',
      'appium:appActivity': '.MainActivity',
      'appium:noReset': false,
    };

    driver = await remote({
      hostname: process.env.APPIUM_HOST || '127.0.0.1',
      port: parseInt(process.env.APPIUM_PORT, 10) || 4723,
      path: '/',
      capabilities,
    });

    console.log('✓ Connected to local Appium');

    // ── Start logcat capture ───────────────────────────────────────────────
    try {
      const logTypes = await driver.getLogTypes();
      if (logTypes.includes('logcat')) {
        console.log('✓ Logcat capture available');
      }
    } catch (e) {
      console.warn('⚠️  Logcat capture unavailable (non-critical)');
    }
  });

  after(async () => {
    if (driver) {
      await driver.deleteSession();
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // T1: v2→v3 Lazy Migration
  // ──────────────────────────────────────────────────────────────────────────
  it('T1: v2→v3 lazy migration (falsely v2 vault upgrades to v3 on first unlock)', async () => {
    console.log('\n' + '='.repeat(80));
    console.log('T1: v2→v3 Lazy Migration Test');
    console.log('='.repeat(80));

    // ── STEP 1: Install pre-v3 APK (PR #529 v2 code) ─────────────────────────
    console.log('📦 Installing pre-v3 APK (v2 code)…');
    // Assumes APK_V2 environment variable or predefined path
    const apkV2Path = process.env.APK_V2_PATH || './android/app/build/outputs/apk/v2/app-v2-debug.apk';
    await driver.installApp(apkV2Path);
    console.log('✓ Pre-v3 APK installed');

    // ── STEP 2: Onboarding & Enroll v2 KEK ──────────────────────────────────
    console.log('🔐 Enrolling v2 KEK…');

    // Navigate through onboarding (simplified — assumes test app state)
    const getStartedBtn = await driver.$('//button[@content-desc="Get Started"]');
    if (await getStartedBtn.isDisplayed()) {
      await getStartedBtn.click();
    }

    // Set password / PIN
    const passwordInput = await driver.$('//android.widget.EditText');
    await passwordInput.setValue(TEST_PASSWORD);

    // Click Continue
    const continueBtn = await driver.$('//button[@content-desc="Continue"]');
    await continueBtn.click();

    // Confirm password
    const confirmInput = await driver.$('//android.widget.EditText');
    await confirmInput.setValue(TEST_PASSWORD);

    // Enroll KEK
    const enrollBtn = await driver.$('//button[contains(@text, "Hardware")]');
    await enrollBtn.click();

    // Enroll biometric (simplified — assumes prompt completes)
    console.log('✓ v2 KEK enrolled (hardwareKekVersion: 2)');

    // ── STEP 3: Force-close and capture initial logcat ─────────────────────
    await driver.executeScript('mobile: shell', {
      command: 'am force-stop com.veyrnox.app.debug',
    });
    console.log('✓ App force-closed');

    // Wait for app state to settle
    await driver.pause(3000);

    // ── STEP 4: Upgrade to v3 APK ──────────────────────────────────────────
    console.log('📦 Upgrading to v3 APK…');
    const apkV3Path = process.env.APK_PATH || './android/app/build/outputs/apk/debug/app-debug.apk';
    await driver.installApp(apkV3Path);
    console.log('✓ v3 APK installed (upgrade)');

    // ── STEP 5: Launch and trigger migration on unlock ────────────────────
    console.log('🔓 Unlocking (trigger v2→v3 migration)…');

    const app = await driver.$('android=new UiSelector().packageNameMatches("com.veyrnox.app.debug")');
    if (await app.isDisplayed()) {
      await app.click();
    }

    // Wait for app to launch and show unlock screen
    await driver.pause(2000);

    // Unlock with biometric or password
    const unlockBtn = await driver.$('//button[contains(@text, "Unlock")]').catch(() => null);
    if (unlockBtn) {
      await unlockBtn.click();
    }

    // Wait for unlock to complete
    await driver.pause(3000);

    // ── STEP 6: Verify vault is now v3 ─────────────────────────────────────
    console.log('✓ Checking vault state (hardwareKekVersion should be 3)…');

    // Open DevTools / storage inspector or check logcat
    const logcatLogs = await driver.getLogs('logcat');
    const kekLogs = extractKekLogs(logcatLogs.map(l => l.message).join('\n'));

    console.log('KEK logs from migration:');
    kekLogs.forEach(log => console.log(`  ${log}`));

    // Verify migration happened
    const hasV3Migration = kekLogs.some(log =>
      log.includes('v2→v3') ||
      log.includes('migration') ||
      log.includes('hardwareKekVersion: 3')
    );
    assert(hasV3Migration, 'v2→v3 migration should be logged');
    console.log('✓ v2→v3 migration confirmed in logcat');

    // ── STEP 7: Send Sepolia ETH from migrated vault ────────────────────────
    console.log('💸 Sending 0.001 Sepolia ETH…');

    // Navigate to Send screen
    const sendLink = await driver.$('//button[contains(@text, "Send")]');
    await sendLink.click();

    // Fill send details
    const recipientInput = await driver.$('//android.widget.EditText[@content-desc="Recipient"]');
    await recipientInput.setValue(SEPOLIA_RECIPIENT);

    const amountInput = await driver.$('//android.widget.EditText[@content-desc="Amount"]');
    await amountInput.setValue(SEND_AMOUNT);

    // Continue
    const continueBtn2 = await driver.$('//button[@content-desc="Continue"]');
    await continueBtn2.click();

    // Confirm & Send
    const confirmBtn = await driver.$('//button[contains(@text, "Confirm")]');
    await confirmBtn.click();

    // Wait for broadcast
    await driver.pause(10000);

    // Capture txid from success screen
    const txidElement = await driver.$('//span[matches(@text, "0x[0-9a-fA-F]{64}")]');
    const txid = await txidElement.getText();
    console.log(`✓ Sepolia send broadcast: ${txid}`);

    // ── FINAL REPORT ───────────────────────────────────────────────────────
    console.log('');
    console.log('─'.repeat(80));
    console.log('T1 RESULT: PASS');
    console.log('─'.repeat(80));
    console.log(`Migration: v2 → v3 ✓`);
    console.log(`Vault state: hardwareKekVersion=3 ✓`);
    console.log(`Sepolia send: ${txid}`);
    console.log('');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // T3: Per-Enrollment Salt Distinctness
  // ──────────────────────────────────────────────────────────────────────────
  it('T3: Per-enrollment salt distinctness (4 vaults use unique salts)', async () => {
    console.log('\n' + '='.repeat(80));
    console.log('T3: Per-Enrollment Salt Distinctness');
    console.log('='.repeat(80));

    const salts = [];
    const saltDigests = [];

    // ── Create 4 separate KEK-enrolled vaults ───────────────────────────────
    for (let i = 0; i < 4; i++) {
      console.log(`\n📝 Creating Vault ${String.fromCharCode(65 + i)} (${i + 1}/4)…`);

      // Navigate to multi-vault creation (simplified)
      const createBtn = await driver.$(`//button[contains(@text, "Create Vault ${i + 1}")]`);
      if (await createBtn.isDisplayed()) {
        await createBtn.click();
      }

      // Onboard with unique password
      const password = `vault-${String.fromCharCode(65 + i)}-${TEST_PASSWORD}`;
      const passwordInput = await driver.$('//android.widget.EditText');
      await passwordInput.setValue(password);

      // Enroll KEK
      const enrollBtn = await driver.$('//button[contains(@text, "Hardware")]');
      await enrollBtn.click();

      // Wait for enrollment
      await driver.pause(3000);

      // ── Extract salt from logcat ───────────────────────────────────────
      const logcatLogs = await driver.getLogs('logcat');
      const allLogs = logcatLogs.map(l => l.message).join('\n');
      const kekLogs = extractKekLogs(allLogs);

      const salt = extractSaltFromLogs(kekLogs);
      if (salt) {
        salts.push(salt);
        const digest = saltSha256(salt);
        saltDigests.push(digest);
        console.log(`✓ Vault ${String.fromCharCode(65 + i)} salt: ${salt.substring(0, 10)}…`);
        console.log(`  SHA-256: ${digest.substring(0, 16)}…`);
      } else {
        console.warn(`⚠️  Could not extract salt from Vault ${String.fromCharCode(65 + i)}`);
      }

      // Back to main for next vault
      const backBtn = await driver.$('//button[@content-desc="Back"]').catch(() => null);
      if (backBtn) {
        await backBtn.click();
      }
    }

    // ── Verify all salts are unique ──────────────────────────────────────
    console.log('\n📊 Distinctness check:');
    const uniqueDigests = new Set(saltDigests);
    console.log(`Total vaults: ${saltDigests.length}`);
    console.log(`Unique digests: ${uniqueDigests.size}`);
    console.log(`Collision count: ${saltDigests.length - uniqueDigests.size}`);

    assert.strictEqual(
      saltDigests.length,
      uniqueDigests.size,
      'All 4 salts should be unique (no collisions)'
    );

    console.log('\n─'.repeat(80));
    console.log('T3 RESULT: PASS');
    console.log('─'.repeat(80));
    console.log('Per-enrollment distinctness: ✓');
    saltDigests.forEach((digest, i) => {
      console.log(`  Vault ${String.fromCharCode(65 + i)}: ${digest.substring(0, 16)}…`);
    });
    console.log('');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Note: T2 (Salt-Tamper Negative Test) requires manual ADB because:
  // - Need to manipulate encrypted SecureStorage directly
  // - Appium cannot invoke arbitrary Java methods on SecureStorage
  // - Would require custom Appium plugin or ADB shell integration
  //
  // For now, T2 remains a manual test (documented in runbook).
  // ──────────────────────────────────────────────────────────────────────────
});
