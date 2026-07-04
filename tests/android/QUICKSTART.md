# Quick Start — Android Automated Testing

Get up and running in 5 minutes.

## 1. Build the App

```bash
npm run android:sync
```

This builds the web wallet and syncs it to the Android project.

## 2. Start an Emulator (or Connect Device)

### Emulator:
```bash
# In Android Studio: Device Manager → Create/Start emulator
# Verify:
adb devices
```

### Real Device:
```bash
# Connect via USB, enable USB Debugging in Settings
adb devices
```

## 3. Start Appium Server

```bash
appium
```

Leave this running in a separate terminal. You should see:
```
[Appium] Appium REST HTTP server listening on http://127.0.0.1:4723
```

## 4. Run a Test

In another terminal:

```bash
# Run vault tests (quickest)
npm run android:test:vault

# Or run all tests
npm run android:test
```

## 5. Watch the App Test

You'll see the app:
- Install automatically
- Create a vault
- Unlock it
- Navigate screens
- Send crypto (if testnet balance available)

## Minimal Config

Update `tests/android/wdio.conf.js` if needed:

```javascript
capabilities: [
  {
    'appium:deviceName': 'emulator-5554',  // From adb devices
    'appium:appPackage': 'com.veyrnox.wallet',
    'appium:appActivity': '.MainActivity',
  },
]
```

## Test Outputs

Each test logs:
- ✅ Pass/fail
- 🔐 Password/unlock actions
- 💸 Send amounts and transaction hashes
- 📱 Device state

Example:
```
Vault Management
  ✓ should create a new vault with password
  ✓ should unlock vault with correct password
  ✓ should reject incorrect password

Send Crypto
  ✓ should navigate to send screen
  ✓ should send ETH on testnet and verify on-chain
    Transaction sent. Verify at: https://sepolia.etherscan.io/tx/0xabc123...
```

## Next Steps

- Read [README.md](./README.md) for detailed info
- Add custom tests in `tests/android/specs/`
- Integrate with CI/CD (GitHub Actions example in README)
- Set up testnet faucet for automatic fund transfers

## Need Help?

```bash
# Debug mode
DEBUG=wdio:* npm run android:test

# View app logs
adb logcat | grep veyrnox

# Check device health
adb shell am dumpsys battery
```
