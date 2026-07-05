# Browserstack Configuration for Veyrnox iOS & Android

This guide walks you through setting up Browserstack App Automate for real-device E2E testing of Veyrnox on iOS and Android.

## Status

- ✅ **Android**: Full CI/CD integration with real-device testing (Google Pixel 10 Pro XL, Android 16.0)
- 🟡 **iOS**: Configuration template ready; requires account setup & device selection
- ✅ **CI/CD**: Automated on push/PR to main/develop (with quota awareness)

---

## Prerequisites

1. **Browserstack Account** with App Automate enabled
   - Sign up: https://www.browserstack.com/app-automate
   - Minimum plan: Free trial or paid (device minutes required)

2. **Credentials** from your Browserstack account:
   - Username: https://www.browserstack.com/accounts/profile/details
   - Access Key: https://www.browserstack.com/accounts/profile/details

3. **Local Tools**:
   - Node.js 22+
   - npm 11+
   - Java 21 (for Android APK build)
   - Xcode (for iOS, Mac only)

---

## Local Setup (macOS / Linux)

### 1. Store Browserstack Credentials

**Option A: Environment Variables (Recommended for local dev)**

```bash
# Add to ~/.zshrc or ~/.bashrc (or export in your shell)
export BROWSERSTACK_USERNAME="your_username"
export BROWSERSTACK_ACCESS_KEY="your_access_key"
```

**Option B: `.env.local` (Git-ignored, project-scoped)**

```bash
# Create .env.local in the repo root (git-ignored)
BROWSERSTACK_USERNAME=your_username
BROWSERSTACK_ACCESS_KEY=your_access_key
```

Then source it before running tests:

```bash
source .env.local
npm run android:test:browserstack
```

### 2. Verify Credentials

```bash
curl -s -u "$BROWSERSTACK_USERNAME:$BROWSERSTACK_ACCESS_KEY" \
  https://api-cloud.browserstack.com/app-automate/plan.json | jq .
```

Expected output includes your plan details (e.g., device minutes available).

---

## Android: Local Testing

### 1. Build APK

```bash
npm run build
npx cap sync android
cd android
./gradlew assembleDebug --build-cache
cd ..
```

Output: `android/app/build/outputs/apk/debug/app-debug.apk`

### 2. Upload APK to Browserstack

```bash
APK_PATH="android/app/build/outputs/apk/debug/app-debug.apk"

UPLOAD_RESPONSE=$(curl -s -u "$BROWSERSTACK_USERNAME:$BROWSERSTACK_ACCESS_KEY" \
  -F "file=@$APK_PATH" \
  https://api-cloud.browserstack.com/app-automate/upload)

APP_URL=$(echo "$UPLOAD_RESPONSE" | jq -r '.app_url')
echo "Uploaded APK: $APP_URL"
```

Save the `APP_URL` (format: `bs://...`) — you'll use it below.

### 3. Run E2E Tests

```bash
export BROWSERSTACK_APP_URL="bs://your_app_id_here"
npm run android:test:browserstack
```

Or in one go:

```bash
BROWSERSTACK_USERNAME=your_user \
BROWSERSTACK_ACCESS_KEY=your_key \
BROWSERSTACK_APP_URL=bs://abc123 \
npm run android:test:browserstack
```

### 4. View Results

- **Dashboard**: https://app-automate.browserstack.com/dashboard
- **Video recordings**: Available for each session
- **Device logs**: Logcat and app-level logging

---

## iOS: Local Testing

### Prerequisites

- Mac with Xcode 15+
- iOS device support (iPhone 15+ recommended)

### 1. Build IPA

```bash
npm run build
npx cap sync ios
cd ios/App
xcodebuild -workspace App.xcworkspace -scheme App -configuration Debug -derivedDataPath build
cd ../..
```

Output: `ios/App/build/...` (IPA path)

### 2. Upload IPA to Browserstack

```bash
IPA_PATH="ios/App/build/Products/Debug-iphoneos/App.ipa"

UPLOAD_RESPONSE=$(curl -s -u "$BROWSERSTACK_USERNAME:$BROWSERSTACK_ACCESS_KEY" \
  -F "file=@$IPA_PATH" \
  https://api-cloud.browserstack.com/app-automate/upload)

APP_URL=$(echo "$UPLOAD_RESPONSE" | jq -r '.app_url')
echo "Uploaded IPA: $APP_URL"
```

### 3. Configure iOS Testing

Create or edit `tests/ios/wdio.browserstack.conf.js`:

```javascript
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const required = ['BROWSERSTACK_USERNAME', 'BROWSERSTACK_ACCESS_KEY', 'BROWSERSTACK_APP_URL'];
const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
  throw new Error(`Missing required BrowserStack env vars: ${missing.join(', ')}`);
}

export const config = {
  runner: 'local',
  user: process.env.BROWSERSTACK_USERNAME,
  key: process.env.BROWSERSTACK_ACCESS_KEY,
  hostname: 'hub-cloud.browserstack.com',
  port: 443,
  protocol: 'https',
  path: '/wd/hub',
  specs: [
    path.join(__dirname, 'specs', '**', '*.spec.js'),
  ],
  maxInstances: 1,
  capabilities: [
    {
      platformName: 'iOS',
      'appium:automationName': 'XCUITest',
      'appium:app': process.env.BROWSERSTACK_APP_URL,
      'appium:bundleId': 'com.veyrnox.app',
      'bstack:options': {
        deviceName: process.env.BROWSERSTACK_DEVICE || 'iPhone 17 Pro',
        osVersion: process.env.BROWSERSTACK_OS_VERSION || '18.0',
        projectName: 'Veyrnox',
        buildName: process.env.BROWSERSTACK_BUILD_NAME || 'Veyrnox iOS E2E (local)',
        sessionName: 'Veyrnox iOS E2E',
        debug: true,
        networkLogs: true,
      },
    },
  ],
  logLevel: 'info',
  bail: 0,
  waitforTimeout: 10000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,
  framework: 'mocha',
  mochaOpts: {
    ui: 'bdd',
    timeout: 120000,
  },
  reporters: ['spec'],
};

export default config;
```

### 4. Run E2E Tests

```bash
export BROWSERSTACK_APP_URL="bs://your_ios_app_id"
npm run ios:test:browserstack
```

---

## CI/CD Setup (GitHub Actions)

### 1. Add Secrets to GitHub

Go to: `https://github.com/VEYRNOX/veyrnox/settings/secrets/actions`

Add:
- `BROWSERSTACK_USERNAME`
- `BROWSERSTACK_ACCESS_KEY`

### 2. Android CI (Already Configured)

File: `.github/workflows/android-real-device-ci.yml`

Runs automatically on:
- Push to `main`, `develop`, `claude/**`
- Pull requests to `main`, `develop`
- Manual trigger (`workflow_dispatch`)

Skips if:
- Only docs/markdown changed
- BrowserStack quota exhausted (honest green warning)

### 3. iOS CI (Template Ready)

Create `.github/workflows/ios-real-device-ci.yml`:

```yaml
name: iOS Real Device E2E Tests (BrowserStack)

on:
  push:
    branches:
      - main
      - develop
      - 'claude/**'
    paths-ignore:
      - 'docs/**'
      - '**/*.md'
  pull_request:
    branches:
      - main
      - develop
    paths-ignore:
      - 'docs/**'
      - '**/*.md'
  workflow_dispatch:

concurrency:
  group: browserstack-ios-${{ github.ref }}
  cancel-in-progress: true

jobs:
  real-device-e2e-tests:
    runs-on: macos-latest
    timeout-minutes: 90

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Validate BrowserStack credentials
        run: |
          if [ -z "${{ secrets.BROWSERSTACK_USERNAME }}" ] || [ -z "${{ secrets.BROWSERSTACK_ACCESS_KEY }}" ]; then
            echo "::error::BROWSERSTACK_USERNAME / BROWSERSTACK_ACCESS_KEY secrets are not set"
            exit 1
          fi
          STATUS=$(curl -s -o plan.json -w "%{http_code}" \
            -u "${{ secrets.BROWSERSTACK_USERNAME }}:${{ secrets.BROWSERSTACK_ACCESS_KEY }}" \
            https://api-cloud.browserstack.com/app-automate/plan.json)
          if [ "$STATUS" != "200" ]; then
            echo "::error::BrowserStack credential check failed"
            exit 1
          fi
          echo "BrowserStack credentials OK"

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'npm'

      - name: Install dependencies
        run: |
          npm install -g npm@11
          npm ci

      - name: Build IPA for testing
        run: |
          npm run build
          npx cap sync ios
          cd ios/App
          xcodebuild -workspace App.xcworkspace \
            -scheme App \
            -configuration Debug \
            -derivedDataPath build
          cd ../..

      - name: Upload IPA to BrowserStack
        id: upload-ipa
        run: |
          IPA_PATH=$(find ios/App/build -name "*.ipa" | head -1)
          if [ -z "$IPA_PATH" ]; then
            echo "::error::Debug IPA not found in ios/App/build"
            exit 1
          fi
          if [ ! -f "$IPA_PATH" ]; then
            echo "::error::IPA file not found at $IPA_PATH"
            exit 1
          fi
          echo "Found IPA at: $IPA_PATH"

          UPLOAD_RESPONSE=$(curl -s -u "${{ secrets.BROWSERSTACK_USERNAME }}:${{ secrets.BROWSERSTACK_ACCESS_KEY }}" \
            -F "file=@$IPA_PATH" \
            https://api-cloud.browserstack.com/app-automate/upload)

          APP_URL=$(echo "$UPLOAD_RESPONSE" | jq -r '.app_url // empty')
          if [ -z "$APP_URL" ]; then
            UPLOAD_ERROR=$(echo "$UPLOAD_RESPONSE" | jq -r '.error // empty')
            if echo "$UPLOAD_ERROR" | grep -q "BROWSERSTACK_TESTING_TIME_LIMIT_EXHAUSTED"; then
              echo "::warning title=Real-device E2E SKIPPED::BrowserStack App Automate testing time is exhausted. Real-device E2E tests DID NOT RUN on this commit. Extend the BrowserStack plan to re-enable."
              echo "skipped=true" >> $GITHUB_OUTPUT
              exit 0
            fi
            echo "::error::Failed to upload IPA to BrowserStack"
            echo "Response: $UPLOAD_RESPONSE"
            exit 1
          fi
          echo "Uploaded: $APP_URL"
          echo "app_url=$APP_URL" >> $GITHUB_OUTPUT
          echo "skipped=false" >> $GITHUB_OUTPUT

      - name: Run E2E tests on BrowserStack real device
        if: steps.upload-ipa.outputs.skipped != 'true'
        env:
          BROWSERSTACK_USERNAME: ${{ secrets.BROWSERSTACK_USERNAME }}
          BROWSERSTACK_ACCESS_KEY: ${{ secrets.BROWSERSTACK_ACCESS_KEY }}
          BROWSERSTACK_APP_URL: ${{ steps.upload-ipa.outputs.app_url }}
          BROWSERSTACK_BUILD_NAME: 'Veyrnox iOS ${{ github.ref_name }} @ ${{ github.sha }}'
        run: npm run ios:test:browserstack

      - name: Report dashboard link
        if: always()
        run: |
          echo "## iOS Real Device E2E (BrowserStack)" >> $GITHUB_STEP_SUMMARY
          echo "- Device: iPhone 17 Pro (iOS 18.0)" >> $GITHUB_STEP_SUMMARY
          echo "- Build: Veyrnox ${{ github.ref_name }}" >> $GITHUB_STEP_SUMMARY
          echo "- Dashboard: https://app-automate.browserstack.com/dashboard" >> $GITHUB_STEP_SUMMARY
```

### 4. Add npm Scripts

Update `package.json`:

```json
{
  "scripts": {
    "android:test:browserstack": "wdio tests/android/wdio.browserstack.conf.js",
    "ios:test:browserstack": "wdio tests/ios/wdio.browserstack.conf.js"
  }
}
```

---

## Device Selection

### Android Recommended Devices

| Device | Version | Screen | Use Case |
|--------|---------|--------|----------|
| Google Pixel 10 Pro XL | 16.0 | 6.9" | Flagship (current) |
| Google Pixel 8 | 14.0 | 6.3" | Mid-range |
| Samsung Galaxy S24 | 14.0 | 6.2" | High-end |

Set via environment:

```bash
export BROWSERSTACK_DEVICE="Google Pixel 10 Pro XL"
export BROWSERSTACK_OS_VERSION="16.0"
npm run android:test:browserstack
```

### iOS Recommended Devices

| Device | Version | Screen | Use Case |
|--------|---------|--------|----------|
| iPhone 17 Pro | 18.0 | 6.3" | Flagship (current) |
| iPhone 16 | 18.0 | 6.1" | Standard |
| iPhone 15 | 17.0 | 6.1" | Prior gen |

Set via environment:

```bash
export BROWSERSTACK_DEVICE="iPhone 17 Pro"
export BROWSERSTACK_OS_VERSION="18.0"
npm run ios:test:browserstack
```

---

## Troubleshooting

### Credentials Issue

```bash
# Verify credentials are valid
curl -s -u "your_user:your_key" \
  https://api-cloud.browserstack.com/app-automate/plan.json | jq .

# Expected: HTTP 200 with plan details
# Got: HTTP 401? Creds invalid. Check https://www.browserstack.com/accounts/profile/details
```

### APK/IPA Upload Fails

```bash
# Check file exists
ls -la android/app/build/outputs/apk/debug/app-debug.apk

# Re-upload with verbose output
UPLOAD_RESPONSE=$(curl -v -u "user:key" \
  -F "file=@android/app/build/outputs/apk/debug/app-debug.apk" \
  https://api-cloud.browserstack.com/app-automate/upload)

echo "$UPLOAD_RESPONSE" | jq .
```

### Test Connection Timeout

Increase timeouts in `wdio.browserstack.conf.js`:

```javascript
waitforTimeout: 15000,          // Find element timeout
connectionRetryTimeout: 180000,  // Connection timeout
```

### Quota Exhausted

Free trial plans have device-minute limits. Check at:
- https://app-automate.browserstack.com/dashboard/plan

Options:
1. Upgrade to a paid plan
2. Run tests less frequently (e.g., on merge to main only)
3. Use emulators for cheaper pre-flight testing

---

## Security Notes

### Never commit credentials

```bash
# ✅ Good: env var
export BROWSERSTACK_USERNAME="..."
npm run android:test:browserstack

# ✅ Good: .env.local (git-ignored)
# .env.local: BROWSERSTACK_USERNAME=...
source .env.local

# ❌ Bad: hardcoded in config files
# wdio.browserstack.conf.js: user: "actual_username"
```

### GitHub Actions

Credentials are encrypted in GitHub Secrets:
- https://github.com/VEYRNOX/veyrnox/settings/secrets/actions
- Only exposed to workflows on your branches
- Never logged or visible in public CI output

---

## Examples

### Local Android Test Run

```bash
# 1. Build APK
npm run build && npx cap sync android && cd android && ./gradlew assembleDebug && cd ..

# 2. Upload
UPLOAD=$(curl -s -u "user:key" \
  -F "file=@android/app/build/outputs/apk/debug/app-debug.apk" \
  https://api-cloud.browserstack.com/app-automate/upload)
APP_URL=$(echo "$UPLOAD" | jq -r '.app_url')

# 3. Run tests
BROWSERSTACK_USERNAME=user \
BROWSERSTACK_ACCESS_KEY=key \
BROWSERSTACK_APP_URL=$APP_URL \
npm run android:test:browserstack
```

### CI Push (Automatic)

```bash
git push origin my-feature
# → GitHub Actions triggers android-real-device-ci.yml
# → APK builds, uploads, runs on real Pixel device
# → Results visible at: https://app-automate.browserstack.com/dashboard
```

---

## Documentation

- [Browserstack App Automate Docs](https://www.browserstack.com/app-automate/getting-started)
- [Appium + WebdriverIO Integration](https://www.browserstack.com/docs/app-automate/appium/get-started)
- [Available Devices](https://www.browserstack.com/list-of-devices)
- [API Reference](https://www.browserstack.com/docs/app-automate/api-reference/rest-api)

---

## Next Steps

1. ✅ Sign up for Browserstack: https://www.browserstack.com/app-automate
2. ✅ Get credentials from: https://www.browserstack.com/accounts/profile/details
3. ✅ Add secrets to GitHub: https://github.com/VEYRNOX/veyrnox/settings/secrets/actions
4. ✅ Create `.github/workflows/ios-real-device-ci.yml` from template above
5. ✅ Test locally: `npm run android:test:browserstack`
6. ✅ Push to trigger CI: `git push origin main`

---

**Last Updated:** 2026-07-05  
**Status:** Ready for iOS setup completion
