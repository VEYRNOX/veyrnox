# Veyrnox — Android upload signing key (BACKUP)

**Created:** 2026-07-20 · **Last verified:** 2026-07-23
**Do not commit the keystore or its password file. Do not share them. Do not delete them.**
(This README carries no secrets — only public certificate fingerprints — so it *is*
tracked in git. The two files it describes are git-ignored.)

## What's here

| File | What it is |
|---|---|
| `veyrnox-upload.jks` | The Android **upload keystore** — signs every AAB uploaded to Google Play |
| `keystore.properties` | The store/key **password** and alias for that keystore |

## Key details

- **Alias:** `veyrnox`
- **Valid until:** 5 December 2053
- **Upload cert SHA-256:**
  `CC:3F:16:36:E0:79:6A:80:29:4A:7B:6F:5B:86:53:81:45:09:5A:74:3B:8C:47:B8:33:96:09:D2:67:A8:13:0A`
- **Package:** `com.veyrnox.app`
- **Generated:** 2026-07-20 (replaced an older `veyrnox-release.jks` whose password was
  lost — that one lived only in GitHub Secrets, which cannot be read back)

## Why this matters

Google Play identifies your app by its signing key. Without this keystore + password you
cannot ship an update to an existing Play listing under normal circumstances.

**Mitigation already in place:** the app is enrolled in **Play App Signing**, which means
Google holds the *app signing key* and this is only the *upload key*. A lost upload key can
be reset by Google Play support — inconvenient, not fatal (that is exactly what happened
here: the reset was approved 2026-07-22). That safety net does **not** exist for the app
signing key, which is why Play App Signing should stay enabled.

## Where this needs to live

This copy sits beside the original in the same working checkout, so it protects against an
accidental `rm`/repo wipe — **not** against disk failure, loss, or theft.

**Still to do (owner, still open as of 2026-07-23):** put a copy somewhere off this machine:
- Password manager (1Password/Bitwarden support file attachments — best option: file and
  password stay together, encrypted)
- Encrypted external drive
- Encrypted cloud storage

Storing the `.jks` and the password in the *same* unencrypted cloud folder defeats the
point — if you use cloud storage, encrypt the bundle first.

## Related

- Working copies live at `android/veyrnox-upload.jks` and `android/keystore.properties`
  in the repo (both git-ignored).
- `android/keystore.properties` may use either spelling, and they resolve their paths
  from **different** directories — `KEYSTORE_PATH` (and the CI env var of the same name)
  relative to `android/`, `storeFile` (Android Studio's generated spelling) relative to
  `android/app/`. `android/app/build.gradle` handles both; don't "normalise" one to the
  other without changing the base it resolves against.
- CI expects the same values as GitHub Secrets: `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`,
  `KEY_ALIAS`, `KEY_PASSWORD`, `RELEASE_CERT_SHA256` (see `.github/workflows/ci.yml`).
  These were updated to this key on 2026-07-22.
- versionCodes 1–6 are consumed (6 is committed in `android/app/build.gradle`). The next
  upload must bump past whatever has already reached Play.
- **Every release build:** `RELEASE_CERT_SHA256` must be **Google's app-signing cert
  SHA-256** (Play Console → Setup → App integrity), *not* the upload cert above —
  otherwise RASP reports `tampered: true` on every launch of the Play-installed build.

  Pass it **on the Gradle command line**:

  ```
  ./gradlew bundleRelease -PRELEASE_CERT_SHA256=D8:99:69:D5:C4:9F:39:50:A8:CA:20:03:13:C5:0E:B1:09:37:E3:9B:62:4B:38:64:3F:B3:A0:4F:63:44:6C:B9
  ```

  ⚠️ **NOT `android/local.properties`** — no Gradle file in this project loads
  `local.properties`, so a value placed there is silently ignored. Gradle's
  `findProperty()` only reads `gradle.properties` and `-P` flags. `android/gradle.properties`
  deliberately leaves `RELEASE_CERT_SHA256` **blank** so a missing `-P` flag fails closed
  (I4) instead of silently building against the wrong fingerprint — debug builds pass
  their own fingerprint via `-P` too. Never put the real release value there; it's
  committed to git.

  A build-time guard in `android/app/build.gradle` (`bundleRelease` / `assembleRelease`)
  fails the release build loudly rather than shipping a silently broken AAB. It rejects:

  | Rejected | Why |
  |---|---|
  | blank | fail-closed (I4) — RASP would report `tampered: true` on every device |
  | malformed | not 32 colon-separated hex pairs |
  | the **upload** cert (`CC:3F:16:…`) | Play re-signs the AAB, so installs never carry it |
  | the **debug** keystore cert | local-debug value pasted into a release build |

  The last two are computed at build time from the keystores on disk, so there is no
  hardcoded fingerprint to go stale.
