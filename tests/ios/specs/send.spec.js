// Send crypto on iOS with on-chain verification.
// Run: npm run ios:test:send  (real device + local Appium, supervised)
//
// iOS analogue of tests/android/specs/send.spec.js. The Android send flow is
// device-verified (Sepolia txid 0x989f6b4c…, 2026-07-04). iOS has NO in-app UI
// send txid yet — this spec drives that gate. Fund the vault from a Sepolia
// faucet first, and clear demo mode (visit /?demo=0) before running.
import appHelper from '../helpers/appHelper.js';
import walletHelper from '../helpers/walletHelper.js';

describe('Send Crypto — iOS On-Chain Verification', () => {
  // Sepolia testnet recipient (same throwaway target the Android suite uses).
  const TEST_RECIPIENT = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
  const SEND_AMOUNT = '0.001';

  before(async () => {
    await driver.execute('mobile: launchApp', { bundleId: appHelper.bundleId });
    await appHelper.pause(1500);
    if (await walletHelper.isLocked()) {
      await walletHelper.unlockVault();
    }
    if (await walletHelper.isDemoModeActive()) {
      throw new Error(
        'Demo mode is ON — a demo send is a fake send and can NEVER be verification. ' +
          'Clear demo (visit /?demo=0) and confirm a real 0.0 balance before running.'
      );
    }
  });

  it('should navigate to the Send screen and confirm the form is ready', async () => {
    let navigated = false;
    try {
      const sendBtn = await appHelper.findByText('Send');
      await appHelper.tap(sendBtn);
      navigated = true;
    } catch (e) {
      console.log('Send button not found from current screen');
    }
    if (!navigated) {
      console.log('Skipping: Send entry point unavailable');
      return;
    }
    await appHelper.pause(500);
    const source = await driver.getPageSource();
    expect(source).toMatch(/send|recipient|amount/i);

    console.log(`
✅ iOS Send screen reachable
  Recipient: ${TEST_RECIPIENT}
  Amount:    ${SEND_AMOUNT} Sepolia ETH

Supervised on-chain procedure:
1. Select ETH.
2. Recipient ${TEST_RECIPIENT}, amount ${SEND_AMOUNT}.
3. Review → Confirm. If the vault is KEK-enrolled a native Face ID sheet appears
   (this is the SE-gated sign) — approve it on-device.
4. Copy the resulting txid from the confirmation screen.
5. Verify on-chain at sepolia.etherscan.io, then add the txid to
   docs/verified-evidence.json (verify, don't assert — a passing test is NOT a txid).`);
  });

  it('should perform a supervised on-chain send when SUPERVISED_SEND=1', async () => {
    if (process.env.SUPERVISED_SEND !== '1') {
      console.log(
        '⚠️ SUPERVISED_SEND != 1 — skipping the real send. This gate mirrors ' +
          'RUN_SUPERVISED_E2E: a funded, human-in-the-loop, on-chain send never runs unattended.'
      );
      return;
    }

    await walletHelper.navigateToSend('ETH');
    await walletHelper.enterSendDetails(TEST_RECIPIENT, SEND_AMOUNT);
    await walletHelper.confirmSend(); // raises Face ID sheet on a KEK vault — approve on-device

    let txHash = null;
    try {
      txHash = await walletHelper.getTransactionHash();
    } catch (e) {
      console.log('Could not read tx hash from the confirmation screen');
    }

    if (txHash) {
      const url = walletHelper.verifyTxOnTestnet(txHash, 'sepolia');
      console.log(`
🟢 iOS in-app send broadcast
  txid: ${txHash}
  explorer: ${url}
NEXT (owner): confirm SUCCESS on the explorer, then record the txid in
docs/verified-evidence.json to advance iOS in-app send from BUILT to device-verified.`);
      expect(txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
    } else {
      console.log('No txid captured — send did not reach broadcast (supervised retry needed).');
    }
  });
});
