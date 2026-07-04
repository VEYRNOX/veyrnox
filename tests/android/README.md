# Veyrnox Android Automated Testing

Automated testing suite for the Veyrnox wallet Android app using **Appium** and **WebdriverIO**.

## Setup

### Prerequisites

- ✅ Android Studio (already installed)
- ✅ ADB (Android Debug Bridge)
- ✅ Node.js v24+ and npm
- ✅ Appium 3.5.2 (installed globally)
- ✅ WebdriverIO (installed in project)
- Android emulator or real device

### Device Setup

#### Option 1: Android Emulator (No Device Needed)

1. Open Android Studio
2. Create or open a virtual device (Android 14+ recommended)
3. Start the emulator
4. Verify connection:
   ```bash
   adb devices
   ```

#### Option 2: Real Android Device (for Hardware KEK testing)

1. Enable USB Debugging on your device (Settings → Developer Options)
2. Connect via USB
3. Verify connection:
   ```bash
   adb devices
   ```

### Configuration

Edit `wdio.conf.js` to match your device:

```javascript
capabilities: [
  {
    platformName: 'Android',
    'appium:deviceName': 'emulator-5554',  // Change to your device/emulator
    // OR for a specific device:
    // 'appium:deviceName': 'Pixel6Pro',
    'appium:appPackage': 'com.veyrnox.wallet',
    'appium:appActivity': '.MainActivity',
  },
]
```

Get your device name:
```bash
adb devices
```

## Building the App

Before running tests, build the Android app:

```bash
npm run android:sync
```

This will:
1. Build the web assets
2. Sync with Capacitor
3. Generate the Android project

## Running Tests

### Start Appium Server (in separate terminal)

```bash
appium
```

Server will start on `http://localhost:4723`

### Run All Android Tests

```bash
npm run android:test
```

### Run Specific Test Suite

```bash
# Vault creation and unlock tests
npm run android:test:vault

# Send crypto tests (with testnet verification)
npm run android:test:send

# Hardware KEK tests (real device only)
npm run android:test:hardware-kek
```

### Run Individual Test

```bash
wdio tests/android/wdio.conf.js --spec tests/android/specs/vault.spec.js
```

### Debug Mode

```bash
# Run with verbose logging
DEBUG=wdio:* npm run android:test

# Interactive debugging
# Stop on breakpoints and inspect app state
```

## Test Suites

### 1. Vault Management (`vault.spec.js`)

✅ **Create new vault** — validates password requirements (≥12 chars)
✅ **Unlock vault** — password-based unlock flow
❌ **Reject incorrect password** — verify error handling
✅ **Vault persistence** — vault survives app restart

**Estimated Duration:** 2-3 minutes

### 2. Send Crypto (`send.spec.js`)

✅ **Navigate to send screen** — UI flow
✅ **Validate recipient address** — address format checking
✅ **Send ETH on testnet** — full send flow with on-chain verification
✅ **Handle insufficient balance** — error handling
❌ **Fee estimation** — calculate and display network fees

**Requirements:**
- Testnet ETH balance (get from a faucet)
- Valid testnet RPC configured

**Estimated Duration:** 3-5 minutes per send (depends on network)

### 3. Hardware KEK (`hardware-kek.spec.js`)

⚠️ **REAL DEVICE ONLY** — Requires StrongBox-capable Android device (Pixel 6+)

✅ **Enroll hardware KEK** — biometric enrollment
✅ **Unlock with biometric** — StrongBox-gated unlock
✅ **Fallback to password** — handles biometric failure
✅ **Send with KEK** — biometric sign gate
✅ **Verify KEK in vault metadata** — check `hardwareKekVersion`, `kekSaltLength`

**Requirements:**
- Real Pixel device (Pixel 6 Pro, Pixel 10 Pro XL, etc.)
- Enrolled fingerprint
- Testnet balance for sends

**Estimated Duration:** 5-7 minutes per test (includes biometric delays)

## Helper Utilities

### `appHelper.js`

Low-level UI automation:

```javascript
// Find element by accessibility ID
const element = await appHelper.findByAccessibilityId('myId');

// Find by text
const btn = await appHelper.findByText('Send');

// Type text
await appHelper.typeText(field, 'value');

// Tap/click
await appHelper.tap(btn);

// Wait for element
await appHelper.waitForElement(element, 10000);

// Get text
const text = await appHelper.getText(element);

// Pause (for debugging or waiting for animations)
await appHelper.pause(500);
```

### `walletHelper.js`

Wallet-specific workflows:

```javascript
// Create vault
await walletHelper.createVault('YourPassword123!@#');

// Unlock vault
await walletHelper.unlockVault('YourPassword123!@#');

// Navigate to send screen
await walletHelper.navigateToSend('ETH');

// Fill send details
await walletHelper.enterSendDetails('0x...', '0.001');

// Confirm send
await walletHelper.confirmSend('YourPassword123!@#');

// Get transaction hash
const txHash = await walletHelper.getTransactionHash();

// Verify on testnet explorer
const url = await walletHelper.verifyTxOnTestnet(txHash, 'sepolia');

// Enroll hardware KEK
await walletHelper.enrollHardwareKek('YourPassword123!@#');

// Check balance
const balance = await walletHelper.getBalance('ETH');

// Disable demo mode
await walletHelper.disableDemoMode();
```

## On-Chain Verification

When a send test completes, you'll get a transaction hash and explorer URL:

```
Transaction sent. Verify at: https://sepolia.etherscan.io/tx/0xabc123...
IMPORTANT: Check the explorer URL and add the txid to CLAUDE.md once confirmed on-chain.
```

### Verification Flow

1. Open the explorer URL in a browser
2. Wait for transaction to be confirmed (1-2 min on testnet)
3. Check block explorer shows:
   - ✅ Status: Success
   - ✅ From: Your vault address
   - ✅ To: Recipient address
   - ✅ Value: Correct amount
4. Copy the txid
5. Add to `CLAUDE.md` in the test evidence section

**Example:**
```markdown
- 🟢 Android Send Test: Sepolia txid `0xeb71a5d31a8794682cf681d8ebb2916967c1097e951519dcf1b53327d2d8e580`, block 11185289 (2026-07-02)
```

## Testnet Faucets

Get testnet ETH for testing:

- **Sepolia (Primary):** https://sepoliafaucet.com
- **Sepolia Alt:** https://www.infura.io/faucet/sepolia
- **Polygon Mumbai:** https://faucet.polygon.technology/
- **BSC Testnet:** https://testnet.binance.org/faucet-smart

## Troubleshooting

### Appium Won't Connect

```bash
# Kill any existing Appium processes
pkill -f appium

# Start fresh
appium
```

### App Won't Install

```bash
# Check if app is already installed
adb shell pm list packages | grep veyrnox

# Uninstall if needed
adb uninstall com.veyrnox.wallet

# Rebuild and sync
npm run android:sync
```

### ADB Device Not Found

```bash
# Restart ADB
adb kill-server
adb start-server

# Check devices again
adb devices
```

### Test Timeouts

- Increase `waitforTimeout` in `wdio.conf.js`
- Check if app is responding: `adb shell am dumpsys window | grep mCurrentFocus`
- Verify network connectivity (especially for sends)

### Elements Not Found

1. Enable debug mode to see what's visible:
   ```javascript
   const source = await driver.getPageSource();
   console.log(source);
   ```

2. Update accessibility IDs in helpers if UI changed

3. Check element hierarchy with Android Studio's Layout Inspector

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Android E2E Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '24'
      - run: npm ci
      - run: npm run android:sync
      - run: npx appium &
      - run: npm run android:test
```

## Performance Notes

- **Emulator:** Slower, ~10-15s per test step
- **Real Device:** Faster, ~2-5s per test step
- **Network:** Testnet sends take 1-2 min to confirm on-chain

## Security

⚠️ **Test Vault Password**

The default test password is hardcoded in `appHelper.js`:
```javascript
this.testVaultPassword = 'TestPassword123!@#';
```

For CI/CD, consider:
- Using environment variables for passwords
- Using a mock/test user account
- Never hardcoding real secrets

## Adding New Tests

1. Create a new spec file: `tests/android/specs/my-feature.spec.js`
2. Use existing helpers or extend them:
   ```javascript
   import appHelper from '../helpers/appHelper.js';
   import walletHelper from '../helpers/walletHelper.js';

   describe('My Feature', () => {
     it('should do something', async () => {
       // Your test here
     });
   });
   ```
3. Add npm script to `package.json`:
   ```json
   "android:test:feature": "wdio tests/android/wdio.conf.js --spec tests/android/specs/my-feature.spec.js"
   ```

## References

- [Appium Documentation](https://appium.io/docs/en/latest/)
- [WebdriverIO Docs](https://webdriver.io/docs/gettingstarted)
- [Android Automated Testing Guide](https://developer.android.com/training/testing)
- [Veyrnox CLAUDE.md](../../CLAUDE.md) — Hardware KEK, test vault setup

## Support

For issues or improvements, reference:
- Test failure logs: `npm run android:test 2>&1 | tee android-tests.log`
- Device logs: `adb logcat | grep veyrnox`
- Appium server logs: Check terminal where `appium` is running
