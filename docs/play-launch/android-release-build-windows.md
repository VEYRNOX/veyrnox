# Android Release Build — Windows

Step-by-step to produce a signed `.aab` on Windows for Play upload.

## Prerequisites

- JDK 17+ on PATH (`java -version`)
- Android SDK with build-tools, platform 36 (`sdkmanager --list`)
- The upload keystore `android/veyrnox-upload.jks` (copy from Mac)
- Keystore password in your password manager ("Veyrnox Play upload keystore")

## 1. Copy the keystore to the Windows checkout

Copy `android/veyrnox-upload.jks` from the Mac to `android/veyrnox-upload.jks`
on this machine. The key alias is `veyrnox`. Verify it opens:

```bash
keytool -list -v -keystore android/veyrnox-upload.jks -alias veyrnox
```

SHA-1 should be `97:5A:05:8E:…:B2:F3`.

## 2. Create `android/keystore.properties`

Copy the template:

```bash
cp android/keystore.properties.template android/keystore.properties
```

Fill in your actual password. This file is git-ignored.

## 3. Build the web app

```bash
npm install --legacy-peer-deps
npm run build
npx cap sync android
```

## 4. Build the signed AAB

From the repo root:

```bash
cd android
./gradlew bundleRelease -PRELEASE_CERT_SHA256="D8:99:69:D5:6D:CF:E3:B4:A1:4C:DA:B0:E2:9A:69:50:B5:9D:B8:3E:95:3E:F6:F9:29:72:8B:EB:9D:44:6C:B9"
```

The `RELEASE_CERT_SHA256` value is Google's **app signing** certificate
(not the upload key). Play App Signing re-signs the AAB after upload, so
the installed APK will carry this fingerprint. RASP `detectTamper` checks
against it.

Output: `android/app/build/outputs/bundle/release/app-release.aab`

## 5. Verify the bundle

```bash
keytool -printcert -jarfile app/build/outputs/bundle/release/app-release.aab
```

The SHA-1 should be `97:5A:05:8E:…:B2:F3` (the upload key's fingerprint).
After Play re-signs, the installed APK will show Google's app signing cert
instead.

## 6. Upload to Play Console

Play Console → Production (or Internal testing) → Create new release →
Upload `app-release.aab`. versionCode is `4`, versionName is `1.0`.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `JAVA_HOME not set` | `export JAVA_HOME="C:/Program Files/Java/jdk-17"` in Git Bash, or set in Windows env vars |
| `SDK location not found` | Create `android/local.properties` with `sdk.dir=C:\\Users\\<you>\\AppData\\Local\\Android\\Sdk` |
| `tampered: true` on device | You used the upload key fingerprint instead of Google's app signing cert for `RELEASE_CERT_SHA256` |
| versionCode conflict | Increment `versionCode` in `android/app/build.gradle` (codes 1–3 are consumed) |

## CI vs local signing

- **CI (GitHub Actions):** reads `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`,
  `KEY_ALIAS`, `KEY_PASSWORD` from GitHub Secrets → env vars.
- **Local (this guide):** reads `android/keystore.properties` file.

`build.gradle` supports both — properties file takes precedence when
present, env vars are the fallback.
