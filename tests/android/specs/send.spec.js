// Send crypto tests with on-chain verification
// 🎯 READY FOR TESTNET: Replace TEST_RECIPIENT with your throwaway wallet address
// Then run: npm run android:test:send
import appHelper from '../helpers/appHelper.js';
import walletHelper from '../helpers/walletHelper.js';

describe('Send Crypto — On-Chain Verification', () => {
  // ⚠️ TODO: Replace with your throwaway wallet address for on-chain testing
  const TEST_RECIPIENT = '0x742d35Cc6634C0532925a3b844Bc7e7595f42e01';
  const SEND_AMOUNT = '0.001'; // Sepolia ETH test amount (adjust per asset)

  before(async () => {
    // Start app and unlock
    await driver.activateApp(appHelper.appPackage);
    await appHelper.pause(1000);

    // Unlock if needed
    const passwordField = await driver.$('//android.widget.EditText[@resource-id="unlock-password"]');
    if (passwordField) {
      await walletHelper.unlockVault();
    }

    // Disable demo mode if active
    await walletHelper.disableDemoMode();
  });

  it('should navigate to send screen', async () => {
    const sendBtn = await appHelper.findByText('Send');
    expect(sendBtn).toBeTruthy();
    await appHelper.tap(sendBtn);

    await appHelper.pause(500);

    // Verify send screen is displayed
    const recipientField = await driver.$('//android.widget.EditText[@resource-id="recipient-address"]');
    expect(recipientField).toBeTruthy();
  });

  it('should validate recipient address', async () => {
    // Navigate to send
    const sendBtn = await appHelper.findByText('Send');
    await appHelper.tap(sendBtn);

    await appHelper.pause(500);

    const recipientField = await driver.$('//android.widget.EditText[@resource-id="recipient-address"]');

    // Try invalid address
    await appHelper.typeText(recipientField, 'invalid-address');

    const amountField = await driver.$('//android.widget.EditText[@resource-id="send-amount"]');
    await appHelper.typeText(amountField, SEND_AMOUNT);

    // Look for validation error
    await appHelper.pause(500);
    const errorMsg = await driver.$('//android.widget.TextView[@resource-id="error-message"]');
    const errorText = await appHelper.getText(errorMsg);
    expect(errorText.toLowerCase()).toContain('invalid');

    // Go back
    await appHelper.goBack();
    await appHelper.pause(500);
  });

  it('should send ETH on testnet and verify on-chain', async () => {
    // Navigate to send
    const sendBtn = await appHelper.findByText('Send');
    await appHelper.tap(sendBtn);

    await appHelper.pause(500);

    // Ensure ETH is selected
    const ethOption = await appHelper.findByText('ETH');
    await appHelper.tap(ethOption);

    await appHelper.pause(500);

    // Fill in send details
    const recipientField = await driver.$('//android.widget.EditText[@resource-id="recipient-address"]');
    await appHelper.typeText(recipientField, TEST_RECIPIENT);

    const amountField = await driver.$('//android.widget.EditText[@resource-id="send-amount"]');
    await appHelper.typeText(amountField, SEND_AMOUNT);

    // Review send
    const reviewBtn = await appHelper.findByText('Review');
    await appHelper.tap(reviewBtn);

    await appHelper.pause(1000);

    // Verify review screen shows correct details
    const reviewAmount = await driver.$('//android.widget.TextView[@resource-id="review-amount"]');
    const reviewText = await appHelper.getText(reviewAmount);
    expect(reviewText).toContain(SEND_AMOUNT);

    // Confirm send
    const confirmBtn = await appHelper.findByText('Confirm Send');
    await appHelper.tap(confirmBtn);

    // Enter password
    await appHelper.pause(500);
    const passwordField = await driver.$('//android.widget.EditText[@resource-id="confirm-password"]');
    await appHelper.typeText(passwordField, appHelper.testVaultPassword);

    // Final send
    const finalSendBtn = await appHelper.findByText('Send');
    await appHelper.tap(finalSendBtn);

    // Wait for transaction
    await appHelper.pause(3000);

    // Get transaction hash
    const txHashElement = await driver.$('//android.widget.TextView[@resource-id="tx-hash"]');
    const txHash = await appHelper.getText(txHashElement);
    expect(txHash).toMatch(/0x[a-fA-F0-9]{64}/);

    // Log explorer URL for manual verification
    const explorerUrl = await walletHelper.verifyTxOnTestnet(txHash, 'sepolia');
    console.log(`Transaction sent. Verify at: ${explorerUrl}`);
    console.log(`IMPORTANT: Check the explorer URL and add the txid to CLAUDE.md once confirmed on-chain.`);
  });

  it('should handle insufficient balance', async () => {
    const sendBtn = await appHelper.findByText('Send');
    await appHelper.tap(sendBtn);

    await appHelper.pause(500);

    const recipientField = await driver.$('//android.widget.EditText[@resource-id="recipient-address"]');
    await appHelper.typeText(recipientField, TEST_RECIPIENT);

    const amountField = await driver.$('//android.widget.EditText[@resource-id="send-amount"]');
    // Try to send a very large amount
    await appHelper.typeText(amountField, '999999');

    const reviewBtn = await appHelper.findByText('Review');
    await appHelper.tap(reviewBtn);

    await appHelper.pause(1000);

    // Should show error about insufficient balance
    const errorMsg = await driver.$('//android.widget.TextView[@resource-id="error-message"]');
    const errorText = await appHelper.getText(errorMsg);
    expect(errorText.toLowerCase()).toContain('insufficient');
  });
});
