# Browserstack Setup Checklist (5 mins)

## ✅ Already Configured for Android

- ✅ Android Browserstack config: `tests/android/wdio.browserstack.conf.js`
- ✅ Android CI/CD workflow: `.github/workflows/android-real-device-ci.yml`
- ✅ npm script: `npm run android:test:browserstack`
- ✅ Real device: Google Pixel 10 Pro XL (Android 16.0)

**What's left:** Add GitHub secrets, test locally.

---

## ✅ Now Configured for iOS

- ✅ iOS Browserstack config: `tests/ios/wdio.browserstack.conf.js`
- ✅ iOS CI/CD workflow: `.github/workflows/ios-real-device-ci.yml`
- ✅ npm script: `npm run ios:test:browserstack`
- ✅ Real device template: iPhone 17 Pro (iOS 18.0)

**What's left:** Add GitHub secrets, test locally (Mac required).

---

## 🎯 Setup Steps (Do These Now)

### Step 1: Get Browserstack Credentials (2 mins)

1. Go to: https://www.browserstack.com/app-automate
2. Sign up or log in
3. Go to: https://www.browserstack.com/accounts/profile/details
4. Copy your **Username** and **Access Key**

### Step 2: Add GitHub Secrets (1 min)

1. Go to: https://github.com/VEYRNOX/veyrnox/settings/secrets/actions
2. Click **New repository secret**
3. Add:
   - Name: `BROWSERSTACK_USERNAME` → Value: your username
   - Name: `BROWSERSTACK_ACCESS_KEY` → Value: your access key

✅ **Done!** CI/CD will now work on every push.

### Step 3: Test Locally (Optional, 2 mins)

**For Android:**

```bash
# Set credentials
export BROWSERSTACK_USERNAME="your_username"
export BROWSERSTACK_ACCESS_KEY="your_access_key"

# Build APK
npm run build && npx cap sync android && cd android && ./gradlew assembleDebug && cd ..

# Upload to Browserstack
UPLOAD=$(curl -s -u "$BROWSERSTACK_USERNAME:$BROWSERSTACK_ACCESS_KEY" \
  -F "file=@android/app/build/outputs/apk/debug/app-debug.apk" \
  https://api-cloud.browserstack.com/app-automate/upload)

APP_URL=$(echo "$UPLOAD" | jq -r '.app_url')
echo "App URL: $APP_URL"

# Run tests
BROWSERSTACK_APP_URL=$APP_URL npm run android:test:browserstack
```

**For iOS (Mac only):**

```bash
# Similar flow — see BROWSERSTACK_SETUP.md for full steps
npm run build && npx cap sync ios
# ... build IPA ...
# ... upload and test ...
```

---

## 🚀 Verify It Works

### GitHub Actions

1. Push to `main` or `develop`
2. Go to: https://github.com/VEYRNOX/veyrnox/actions
3. Watch the workflow run
4. Check results in Browserstack dashboard: https://app-automate.browserstack.com/dashboard

### Local Runs

```bash
npm run android:test:browserstack
npm run ios:test:browserstack
```

---

## 📖 Full Documentation

See: [BROWSERSTACK_SETUP.md](BROWSERSTACK_SETUP.md)

Topics covered:
- Detailed local setup for both platforms
- Device selection & configuration
- Troubleshooting
- Security best practices
- Cost & quota management

---

## ❓ Common Questions

**Q: Do I need a Mac for iOS?**  
A: Yes, for local testing. GitHub Actions uses `macos-latest` in the CI workflow.

**Q: What if Browserstack quota runs out?**  
A: CI will skip honestly (green with warning). Upgrade plan or use emulators for pre-flight testing.

**Q: Can I run multiple devices in parallel?**  
A: Yes, increase `maxInstances` in the config (costs more device minutes).

**Q: Do I need a Browserstack paid plan?**  
A: Free trial covers basic testing. Paid plans unlock more devices & concurrent sessions.

---

## 🎁 What You Get

- ✅ Real device testing on iOS & Android
- ✅ Video recordings of every test session
- ✅ Device logs & network traffic capture
- ✅ Automated CI/CD on every push
- ✅ Parallel testing support
- ✅ Historical test reports

---

## 📊 Next Milestones

1. **This week:** Push a test commit, confirm CI runs
2. **Next week:** Run full E2E suite (send, hardware KEK, biometric unlock)
3. **Ongoing:** Monitor device quota at https://app-automate.browserstack.com/dashboard/plan

---

**Time to complete:** ~5 minutes  
**Last updated:** 2026-07-05
