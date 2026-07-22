# Android release build (AAB) — Windows runbook

**For:** the first Play upload after the 2026-07-22 upload-key reset.
**Run on:** the **Windows** machine (the Mac has no JDK/Android SDK/Gradle).
**Do not start before:** 2026-07-22 **09:29 UTC / 10:29 BST** — Play rejects uploads until
the new upload key becomes valid.

---

## 0. Prerequisites on the Windows box

- JDK 17+ and the Android SDK (Android Studio provides both).
- Node 22 + the repo checked out at the commit you intend to ship.
- **Both signing files copied over** (verified identical to the Mac originals):
  - `android/veyrnox-upload.jks`
  - `android/keystore.properties`  ← contains KEYSTORE_PASSWORD / KEY_PASSWORD / KEY_ALIAS

> Verified 2026-07-22: `veyrnox-upload.jks` SHA1 =
> `97:5A:05:8E:B0:B8:06:14:49:3C:7C:E7:63:ED:4E:71:7C:BA:B2:F3` — exact match to the cert
> Google registered for the reset.

---

## 1. Set the signing env vars (Git Bash / MINGW64)

**Gradle reads ENV VARS, not `keystore.properties`.** The properties file just records the
values. If these are unset, `build.gradle` **silently falls back to DEBUG signing** and you
get an AAB Play will reject:

```groovy
signingConfig ksPath ? signingConfigs.release : signingConfigs.debug
```

```bash
cd /c/path/to/veyrnox-secure          # adjust to the Windows checkout path

export KEYSTORE_PATH="$PWD/android/veyrnox-upload.jks"
export KEY_ALIAS="veyrnox"
# Pull the passwords from keystore.properties without echoing them:
export KEYSTORE_PASSWORD="$(grep -E '^KEYSTORE_PASSWORD=' android/keystore.properties | cut -d= -f2- | tr -d ' \r')"
export KEY_PASSWORD="$(grep -E '^KEY_PASSWORD='       android/keystore.properties | cut -d= -f2- | tr -d ' \r')"

# Sanity check (prints lengths only, never the secrets):
echo "path set: ${KEYSTORE_PATH:+yes} | alias: $KEY_ALIAS | storepw len: ${#KEYSTORE_PASSWORD} | keypw len: ${#KEY_PASSWORD}"
```

All four must be non-empty before continuing.

---

## 2. Check `.env.local` — Vite inlines these at BUILD time

`.env.local` is **git-ignored**, so it does NOT arrive with the checkout. It must be copied
to the Windows machine separately. Without it the AAB ships with referrals dead
(`supabase = null` → every referralApi call silently no-ops), IAP dead (no RevenueCat key)
and WalletConnect dead — and versionCode 4 is consumed regardless.

Required vars:

```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_REVENUECAT_APPLE_API_KEY      # appl_… (not a test-store key)
VITE_REVENUECAT_GOOGLE_API_KEY     # goog_… (not a test-store key)
VITE_WALLETCONNECT_PROJECT_ID
VITE_FORCE_TIER                    # MUST be empty
```

🔴 **Verify the tier override is not set:**

```bash
grep -E "^VITE_FORCE_TIER" .env.local     # must show `VITE_FORCE_TIER=` (empty) or nothing
```

`entitlement.js` does `if (FORCED_TIER) return FORCED_TIER;` **before** consulting
RevenueCat. A non-empty value ships a build that grants Safety Plus to everyone for free.
There is no build-mode guard — the safety depends entirely on this value being empty.

## 3. Build web assets + sync Capacitor (release mode)

`VITE_RELEASE=1` is the store-build guard — without it the demo-build throw is not armed.

```bash
npm install --legacy-peer-deps
npm run mobile:build:release      # VITE_RELEASE=1 vite build + cap sync
```

---

## 3. Build the AAB

`RELEASE_CERT_SHA256` must be **Google's app-signing certificate**, NOT the upload key.
Play re-signs your upload, so pinning the upload key makes a Play-installed build fail RASP
`detectTamper` (`tampered: true`). The plugin strips colons and lowercases before comparing,
so this format is fine.

```bash
cd android

./gradlew bundleRelease \
  -PRELEASE_CERT_SHA256="D8:99:69:D5:C4:9F:39:50:A8:CA:20:03:13:C5:0E:B1:09:37:E3:9B:62:4B:38:64:3F:B3:A0:4F:63:44:6C:B9"
```

(On cmd.exe use `gradlew.bat` and drop the backslashes.)

Output: `android/app/build/outputs/bundle/release/app-release.aab`

> If `RELEASE_CERT_SHA256` is omitted, `BuildConfig.RELEASE_CERT_SHA256` is empty and
> `detectTamper()` returns **true** fail-closed (I4) — the app will treat itself as tampered.

---

## 4. VERIFY before uploading (do not skip)

Confirm the AAB is signed with the **upload key** and not the debug key:

```bash
keytool -printcert -jarfile app/build/outputs/bundle/release/app-release.aab
```

The printed **SHA1** must equal:

```
97:5A:05:8E:B0:B8:06:14:49:3C:7C:E7:63:ED:4E:71:7C:BA:B2:F3
```

- ✅ Match → upload.
- ❌ Anything else (especially a debug cert, CN=Android Debug) → **STOP**. The env vars
  didn't take. Fix and rebuild — do not upload.

---

## 5. Upload

Play Console → **Veyrnox** → **Test and release** → **Testing → Internal testing** →
**Create new release** → upload `app-release.aab`.

- **versionCode 4** (already set in `android/app/build.gradle`) — permanently consumed by
  this upload; deleting a release does NOT free it.
- **versionName "1.0"** — the only customer-visible value.
- App record already exists (Draft / Internal testing) — **do not create a second app**.
- Personal account: the 12-tester/14-day rule gates **production only**, not internal
  testing — real Play Billing IS verifiable on this track.

---

## 6. After it installs from Play

- Confirm RASP does **not** report `tampered: true` (proves `RELEASE_CERT_SHA256` was the
  Google app-signing cert, not the upload key).
- Verify a **real** Play Billing purchase before recording Android IAP as anything beyond
  BUILT. Sandbox/simulated ≠ verified.
