// Wallet-specific helper functions
import appHelper from './appHelper.js';

class WalletHelper {
  /**
   * Create a new vault with test password
   */
  async createVault(password = appHelper.testVaultPassword) {
    // Tap "Create New Vault" button
    const createBtn = await appHelper.findByText('Create New Vault');
    await appHelper.tap(createBtn);

    // Wait for password input
    await appHelper.pause(500);
    const passwordField = await driver.$('//android.widget.EditText[@resource-id="password-input"]');
    await appHelper.typeText(passwordField, password);

    // Confirm password
    const confirmField = await driver.$('//android.widget.EditText[@resource-id="confirm-password-input"]');
    await appHelper.typeText(confirmField, password);

    // Tap create button
    const submitBtn = await appHelper.findByText('Create Vault');
    await appHelper.tap(submitBtn);

    // Wait for vault creation to complete
    await appHelper.pause(2000);
  }

  /**
   * Unlock vault with password
   */
  async unlockVault(password = appHelper.testVaultPassword) {
    const passwordField = await driver.$('//android.widget.EditText[@resource-id="unlock-password"]');
    await appHelper.typeText(passwordField, password);

    const unlockBtn = await appHelper.findByText('Unlock');
    await appHelper.tap(unlockBtn);

    // Wait for unlock to complete
    await appHelper.pause(2000);
  }

  /**
   * Go to Send screen for a specific asset
   */
  async navigateToSend(assetName = 'ETH') {
    // Tap Send button
    const sendBtn = await appHelper.findByText('Send');
    await appHelper.tap(sendBtn);

    await appHelper.pause(500);

    // Select asset (if not already selected)
    const assetSelector = await appHelper.findByText(assetName);
    if (assetSelector) {
      await appHelper.tap(assetSelector);
    }
  }

  /**
   * Enter send details
   */
  async enterSendDetails(recipientAddress, amount) {
    // Enter recipient address
    const recipientField = await driver.$('//android.widget.EditText[@resource-id="recipient-address"]');
    await appHelper.typeText(recipientField, recipientAddress);

    // Enter amount
    const amountField = await driver.$('//android.widget.EditText[@resource-id="send-amount"]');
    await appHelper.typeText(amountField, amount.toString());

    await appHelper.pause(500);
  }

  /**
   * Review and confirm send
   */
  async confirmSend(password = appHelper.testVaultPassword) {
    // Tap Review button
    const reviewBtn = await appHelper.findByText('Review');
    await appHelper.tap(reviewBtn);

    await appHelper.pause(1000);

    // Tap Confirm button
    const confirmBtn = await appHelper.findByText('Confirm Send');
    await appHelper.tap(confirmBtn);

    // Enter password to confirm
    await appHelper.pause(500);
    const passwordField = await driver.$('//android.widget.EditText[@resource-id="confirm-password"]');
    await appHelper.typeText(passwordField, password);

    // Tap final send
    const sendBtn = await appHelper.findByText('Send');
    await appHelper.tap(sendBtn);

    // Wait for send to complete
    await appHelper.pause(3000);
  }

  /**
   * Get transaction hash from confirmation screen
   */
  async getTransactionHash() {
    const txHashElement = await driver.$('//android.widget.TextView[@resource-id="tx-hash"]');
    return await appHelper.getText(txHashElement);
  }

  /**
   * Verify transaction on testnet explorer
   */
  async verifyTxOnTestnet(txHash, chainName = 'sepolia') {
    const explorerUrls = {
      sepolia: `https://sepolia.etherscan.io/tx/${txHash}`,
      'bsc-testnet': `https://testnet.bscscan.com/tx/${txHash}`,
      fuji: `https://testnet.snowtrace.io/tx/${txHash}`,
    };

    const url = explorerUrls[chainName];
    if (!url) {
      throw new Error(`Unknown chain: ${chainName}`);
    }

    console.log(`Verify transaction at: ${url}`);
    return url;
  }

  /**
   * Enroll hardware KEK (if device supports it)
   */
  async enrollHardwareKek(password = appHelper.testVaultPassword) {
    // Navigate to settings
    const settingsBtn = await appHelper.findByText('Settings');
    await appHelper.tap(settingsBtn);

    await appHelper.pause(500);

    // Find Hardware Protection option
    const hwProtectionBtn = await appHelper.findByText('Hardware Protection');
    await appHelper.tap(hwProtectionBtn);

    await appHelper.pause(500);

    // Tap Enroll
    const enrollBtn = await appHelper.findByText('Enroll Hardware KEK');
    await appHelper.tap(enrollBtn);

    // Follow biometric/PIN flow
    await appHelper.pause(1000);

    // Wait for enrollment to complete
    await appHelper.pause(3000);
  }

  /**
   * Get vault balance for asset
   */
  async getBalance(assetName = 'ETH') {
    const balanceElement = await driver.$(`//android.widget.TextView[@text contains="${assetName}"]`);
    const balanceText = await appHelper.getText(balanceElement);
    // Parse balance from text (format: "ETH 0.0000")
    const match = balanceText.match(/[\d.]+/);
    return match ? parseFloat(match[0]) : 0;
  }

  /**
   * Check if demo mode is active
   */
  async isDemoModeActive() {
    const demoIndicator = await driver.$('//android.widget.TextView[@resource-id="demo-mode-indicator"]');
    try {
      await demoIndicator.waitForDisplayed({ timeout: 1000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Disable demo mode if active
   */
  async disableDemoMode() {
    if (await this.isDemoModeActive()) {
      const settingsBtn = await appHelper.findByText('Settings');
      await appHelper.tap(settingsBtn);

      await appHelper.pause(500);

      const demoToggle = await appHelper.findByText('Demo Mode');
      await appHelper.tap(demoToggle);

      await appHelper.pause(500);
    }
  }
}

export default new WalletHelper();
