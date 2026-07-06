// Wallet-specific helper workflows for iOS (XCUITest / WKWebView).
//
// These mirror the Android walletHelper flows but use iOS selectors. Selectors
// resolve against the accessibility tree that XCUITest builds from the Capacitor
// WebView; keep DOM ids / aria-labels stable so `~id` selectors keep working.
import appHelper from './appHelper.js';

class WalletHelper {
  /**
   * Create a new vault with test password.
   */
  async createVault(password = appHelper.testVaultPassword) {
    const createBtn = await appHelper.findByText('Create New Vault');
    await appHelper.tap(createBtn);
    await appHelper.pause(500);

    const passwordField = await appHelper.findByAccessibilityId('password-input');
    await appHelper.typeText(passwordField, password);

    const confirmField = await appHelper.findByAccessibilityId('confirm-password-input');
    await appHelper.typeText(confirmField, password);

    const submitBtn = await appHelper.findByText('Create Vault');
    await appHelper.tap(submitBtn);
    await appHelper.pause(2000);
  }

  /**
   * Unlock vault with password (Safari fallback / password path).
   */
  async unlockVault(password = appHelper.testVaultPassword) {
    const passwordField = await appHelper.findByAccessibilityId('unlock-password');
    await appHelper.typeText(passwordField, password);

    const unlockBtn = await appHelper.findByText('Unlock');
    await appHelper.tap(unlockBtn);
    await appHelper.pause(2000);
  }

  /**
   * Is the app currently showing the lock screen?
   */
  async isLocked() {
    try {
      const field = await appHelper.findByAccessibilityId('unlock-password');
      return await field.isExisting();
    } catch (e) {
      return false;
    }
  }

  /**
   * Go to the Send screen for a specific asset.
   */
  async navigateToSend(assetName = 'ETH') {
    const sendBtn = await appHelper.findByText('Send');
    await appHelper.tap(sendBtn);
    await appHelper.pause(500);

    try {
      const assetSelector = await appHelper.findByText(assetName);
      if (await assetSelector.isExisting()) await appHelper.tap(assetSelector);
    } catch (e) {
      // asset already selected
    }
  }

  /**
   * Enter send details (recipient + amount).
   */
  async enterSendDetails(recipientAddress, amount) {
    const recipientField = await appHelper.findByAccessibilityId('recipient-address');
    await appHelper.typeText(recipientField, recipientAddress);

    const amountField = await appHelper.findByAccessibilityId('send-amount');
    await appHelper.typeText(amountField, amount.toString());
    await appHelper.pause(500);
  }

  /**
   * Review and confirm a send. On a KEK-enrolled iOS vault this triggers the
   * Secure Enclave / Face ID prompt — the biometric sheet is a native XCUITest
   * element and cannot be scripted through; the run must be supervised on a real
   * iPhone with an unrestricted Face ID enrollment.
   */
  async confirmSend(password = appHelper.testVaultPassword) {
    const reviewBtn = await appHelper.findByText('Review');
    await appHelper.tap(reviewBtn);
    await appHelper.pause(1000);

    const confirmBtn = await appHelper.findByText('Confirm Send');
    await appHelper.tap(confirmBtn);
    await appHelper.pause(500);

    // Password path (no KEK, or biometric declined). KEK path surfaces the
    // native Face ID sheet instead of this field.
    try {
      const passwordField = await appHelper.findByAccessibilityId('confirm-password');
      if (await passwordField.isExisting()) {
        await appHelper.typeText(passwordField, password);
        const sendBtn = await appHelper.findByText('Send');
        await appHelper.tap(sendBtn);
      }
    } catch (e) {
      console.log('No password confirm field — assuming biometric (SE/Face ID) gate');
    }
    await appHelper.pause(3000);
  }

  /**
   * Read the transaction hash off the confirmation screen.
   */
  async getTransactionHash() {
    const txHashElement = await appHelper.findByAccessibilityId('tx-hash');
    return await appHelper.getText(txHashElement);
  }

  /**
   * Build the block-explorer URL for a supplied txid (never asserts success —
   * on-chain confirmation is the owner's manual verify-don't-assert step).
   */
  verifyTxOnTestnet(txHash, chainName = 'sepolia') {
    const explorerUrls = {
      sepolia: `https://sepolia.etherscan.io/tx/${txHash}`,
      'bsc-testnet': `https://testnet.bscscan.com/tx/${txHash}`,
      fuji: `https://testnet.snowtrace.io/tx/${txHash}`,
    };
    const url = explorerUrls[chainName];
    if (!url) throw new Error(`Unknown chain: ${chainName}`);
    console.log(`Verify transaction at: ${url}`);
    return url;
  }

  /**
   * Navigate to Settings → Security → Hardware Protection and enroll the SE KEK.
   * The enrollment itself raises the native Face ID sheet (supervised only).
   */
  async enrollHardwareKek() {
    const settingsBtn = await appHelper.findByText('Settings');
    await appHelper.tap(settingsBtn);
    await appHelper.pause(500);

    const hwProtectionBtn = await appHelper.findByText('Hardware Protection');
    await appHelper.tap(hwProtectionBtn);
    await appHelper.pause(500);

    const enrollBtn = await appHelper.findByText('Enroll Hardware KEK');
    await appHelper.tap(enrollBtn);
    // Native Face ID sheet appears here — must be confirmed on-device.
    await appHelper.pause(3000);
  }

  /**
   * Read the Hardware Protection tier badge label (StrongBox / Secure Enclave /
   * WebAuthn / TEE). Returns the raw label text or null if not present.
   */
  async getKekTierBadge() {
    try {
      const badge = await driver.$(
        '-ios predicate string:label CONTAINS "Protected" OR label CONTAINS "Protection"'
      );
      if (await badge.isExisting()) return await appHelper.getText(badge);
    } catch (e) {
      // no badge visible
    }
    return null;
  }

  /**
   * Detect the demo-mode indicator (must be cleared before any real verification).
   */
  async isDemoModeActive() {
    try {
      const demoIndicator = await appHelper.findByAccessibilityId('demo-mode-indicator');
      await demoIndicator.waitForDisplayed({ timeout: 1000 });
      return true;
    } catch {
      return false;
    }
  }
}

export default new WalletHelper();
