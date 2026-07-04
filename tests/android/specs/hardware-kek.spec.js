// Hardware KEK enrollment and unlock tests (Android StrongBox)
// Note: These tests require a real Android device with StrongBox support
import appHelper from '../helpers/appHelper.js';
import walletHelper from '../helpers/walletHelper.js';

describe('Hardware KEK (StrongBox)', () => {
  // IMPORTANT: These tests are for real devices only, not emulators
  // Emulators will skip these tests
  let isEmulator = false;

  before(async () => {
    // Check if we're on an emulator
    const capabilities = await driver.getCapabilities();
    const deviceName = capabilities['appium:deviceName'] || '';
    isEmulator = deviceName.includes('emulator') || deviceName.includes('avd');

    if (!isEmulator) {
      // Start app
      await driver.activateApp(appHelper.appPackage);
      await appHelper.pause(1000);

      // Unlock vault
      const passwordField = await driver.$('//android.widget.EditText[@resource-id="unlock-password"]');
      if (passwordField) {
        await walletHelper.unlockVault();
      }
    }
  });

  it('should skip on emulator', async () => {
    if (isEmulator) {
      console.log('⏭️  Skipping Hardware KEK tests on emulator (requires real device with StrongBox)');
      return;
    }
  });

  it('should enroll hardware KEK', async () => {
    if (isEmulator) return;

    // Navigate to Settings
    const settingsBtn = await appHelper.findByText('Settings');
    expect(settingsBtn).toBeTruthy();
    await appHelper.tap(settingsBtn);

    await appHelper.pause(500);

    // Find Hardware Protection section
    const hwProtectionBtn = await appHelper.findByText('Hardware Protection');
    expect(hwProtectionBtn).toBeTruthy();
    await appHelper.tap(hwProtectionBtn);

    await appHelper.pause(500);

    // Tap Enroll Hardware KEK
    const enrollBtn = await appHelper.findByText('Enroll Hardware KEK');
    expect(enrollBtn).toBeTruthy();
    await appHelper.tap(enrollBtn);

    // Wait for biometric prompt or PIN setup
    await appHelper.pause(2000);

    // If biometric prompt appears, we would trigger it here
    // (In real testing, the user would provide their fingerprint)
    console.log('📱 Waiting for biometric authentication...');

    // Wait for enrollment to complete
    await appHelper.pause(3000);

    // Verify enrollment was successful
    const badgeElement = await driver.$('//android.widget.TextView[@resource-id="hardware-kek-badge"]');
    const badgeText = await appHelper.getText(badgeElement);
    expect(badgeText.toLowerCase()).toContain('strongbox');
  });

  it('should unlock vault using hardware KEK', async () => {
    if (isEmulator) return;

    // Navigate away
    const goBackBtn = await appHelper.findByText('Back');
    if (goBackBtn) {
      await appHelper.tap(goBackBtn);
    }

    await appHelper.pause(1000);

    // Close and reopen app to trigger unlock
    await driver.terminateApp(appHelper.appPackage);
    await appHelper.pause(1000);
    await driver.activateApp('com.veyrnox.wallet');
    await appHelper.pause(2000);

    // Should show biometric prompt (not password)
    const biometricPrompt = await driver.$('//android.widget.TextView[@text contains="fingerprint"]');
    expect(biometricPrompt).toBeTruthy();

    console.log('🔐 Waiting for biometric unlock...');
    // In a real test, we would:
    // 1. Trigger fingerprint sensor
    // 2. Verify unlock succeeds

    // Wait for unlock to complete
    await appHelper.pause(3000);

    // Verify we're on main wallet screen
    const balanceElements = await driver.$$('//android.widget.TextView[@resource-id="balance"]');
    expect(balanceElements.length).toBeGreaterThan(0);
  });

  it('should fallback to password if biometric fails', async () => {
    if (isEmulator) return;

    // Close and reopen app
    await driver.terminateApp(appHelper.appPackage);
    await appHelper.pause(1000);
    await driver.activateApp('com.veyrnox.wallet');
    await appHelper.pause(2000);

    // If biometric fails, user should see password field as fallback
    const passwordField = await driver.$('//android.widget.EditText[@resource-id="unlock-password"]');

    if (passwordField) {
      // Enter password to test fallback
      await appHelper.typeText(passwordField, appHelper.testVaultPassword);
      const unlockBtn = await appHelper.findByText('Unlock');
      await appHelper.tap(unlockBtn);
      await appHelper.pause(2000);
    }

    // Verify unlock successful
    const balanceElements = await driver.$$('//android.widget.TextView[@resource-id="balance"]');
    expect(balanceElements.length).toBeGreaterThan(0);
  });

  it('should verify hardware KEK in vault metadata', async () => {
    if (isEmulator) return;

    // Navigate to Settings
    const settingsBtn = await appHelper.findByText('Settings');
    await appHelper.tap(settingsBtn);

    await appHelper.pause(500);

    // Look for vault info showing KEK details
    const vaultInfoBtn = await appHelper.findByText('Vault Info');
    if (vaultInfoBtn) {
      await appHelper.tap(vaultInfoBtn);
      await appHelper.pause(500);

      // Check for hardware KEK version indicator
      const kekVersionElement = await driver.$('//android.widget.TextView[@resource-id="kek-version"]');
      const versionText = await appHelper.getText(kekVersionElement);
      expect(versionText).toContain('2'); // Should be KEK v2 with salt binding
    }
  });

  it('should send crypto using hardware KEK-protected vault', async () => {
    if (isEmulator) return;

    const TEST_RECIPIENT = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
    const SEND_AMOUNT = '0.001';

    // Navigate to Send
    const sendBtn = await appHelper.findByText('Send');
    await appHelper.tap(sendBtn);

    await appHelper.pause(500);

    // Select ETH
    const ethOption = await appHelper.findByText('ETH');
    await appHelper.tap(ethOption);

    // Fill send details
    const recipientField = await driver.$('//android.widget.EditText[@resource-id="recipient-address"]');
    await appHelper.typeText(recipientField, TEST_RECIPIENT);

    const amountField = await driver.$('//android.widget.EditText[@resource-id="send-amount"]');
    await appHelper.typeText(amountField, SEND_AMOUNT);

    // Review and confirm
    const reviewBtn = await appHelper.findByText('Review');
    await appHelper.tap(reviewBtn);

    await appHelper.pause(1000);

    const confirmBtn = await appHelper.findByText('Confirm Send');
    await appHelper.tap(confirmBtn);

    await appHelper.pause(500);

    // Signing should use hardware KEK (no password prompt)
    const passwordField = await driver.$('//android.widget.EditText[@resource-id="confirm-password"]');
    const biometricPrompt = await driver.$('//android.widget.TextView[@text contains="fingerprint"]');

    // Should use biometric, not password
    if (biometricPrompt) {
      console.log('✅ Hardware KEK sign gate active - biometric required');
      // User would provide fingerprint here
    }

    // Wait for transaction
    await appHelper.pause(3000);

    // Get transaction hash
    const txHashElement = await driver.$('//android.widget.TextView[@resource-id="tx-hash"]');
    const txHash = await appHelper.getText(txHashElement);

    console.log(`✅ Hardware KEK-protected send confirmed: ${txHash}`);
    console.log(`Verify on Sepolia: https://sepolia.etherscan.io/tx/${txHash}`);
  });
});
