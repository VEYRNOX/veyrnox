# Branch review — 2026-07-23 (Android release-signing path)

**Scope:** scheduled daily branch review. **Status:** BUILT + verified by a real signed
build on this machine. INTERNAL — not the outstanding independent audit.

## How this started

There was no branch to review: `HEAD` was on `main` with zero local commits and five
commits *behind* `origin/main`. The only delta in the working tree was one untracked file,
`android/UPLOAD-KEY-README.md`, so that is what got reviewed. Two of its claims about the
build did not match the build, and chasing the second one exposed a live defect in the
release-signing path.

## F-1 — `storeFile` resolved one directory too high (MAJOR, fixed)

`android/app/build.gradle` accepts two spellings in `keystore.properties`. They carry
**different path conventions**:

| Spelling | Path is relative to |
|---|---|
| `KEYSTORE_PATH` (ours; also the CI env var) | `android/` |
| `storeFile` (Android Studio's generated spelling) | `android/app/` |

PR #1314 resolved **both** against `rootProject` (= `android/`). The `keystore.properties`
actually in use on the release machine ships `storeFile=../veyrnox-upload.jks`, so the `../`
climbed out of `android/` and pointed at the repo root, where no keystore exists.

Effect: `./gradlew bundleRelease` could not sign at all. It failed with
`Keystore not found at: C:\...\Veyrnox\veyrnox-upload.jks`. Fail-closed, not fail-open — no
mis-signed artifact was possible — but the release path was dead.

**Fix:** each spelling now resolves from its own base (`ksBase`).

## F-2 — the debug-fingerprint check was silently deleted (MAJOR, fixed)

This was first reported as "the README overstates the guard." The PR history says otherwise
— the guard existed and was removed:

| PR | Effect on the guard |
|---|---|
| #1310 | **added** `DEBUG_CERT_FINGERPRINT = '8290314d…'`; rejected blank *and* the debug value |
| #1313 | blanked the `gradle.properties` default (good) and **replaced** #1310's `taskGraph.whenReady` block with a `doFirst` blank+format check — dropping the debug comparison |
| #1314 | key names; both spellings onto one base (see F-1) |
| 2026-07-23 | per-spelling bases; debug **and** upload cert rejections restored |

#1313's commit message describes its guard as failing "if RELEASE_CERT_SHA256 is blank or
malformed" and never mentions losing the debug check. The README's claim was accurate when
written and went stale underneath it. **A shipped security control was removed by a rewrite
and nothing noticed for ten days.**

Secondary flaw in the original: #1310 hardcoded one machine's debug fingerprint
(`8290314d…`). The release machine's debug keystore is `DB:06:83:B4:…`, so even before #1313
deleted the check it would not have fired there. The restored version computes both
fingerprints from the keystores on disk at build time — machine-independent, rotation-proof.

## Root cause across all three PRs

#1309 → #1310 → #1313 → #1314 all touched this block, each reasoned correctly on paper, and
**none was verified by a build**. #1314 says so in its own commit message:

> Not verified by a build — no JDK/Android SDK on the authoring machine. The first real
> bundleRelease is the test; it is imminent.

2026-07-23 was that first real `bundleRelease`. It failed. The project's verify-don't-assert
rule was being applied to on-chain status but not to build configuration.

## Prevention (the actual deliverable)

Documentation alone would not have caught #1313, because nothing ever asserted the guard
**rejects** anything. `.github/workflows/ci.yml` (`android-release`) now runs three negative
cases after the real build, while Gradle is warm:

1. blank → must fail
2. malformed → must fail
3. **the upload cert, derived at runtime via `keytool`** → must fail

Each asserts the failure mentions `RELEASE_CERT_SHA256`, so an unrelated build break cannot
masquerade as a passing test. Deriving the upload fingerprint instead of hardcoding it means
the next key rotation cannot quietly retire the test — the mistake #1310 made.

## Verification evidence (INTERNAL)

Full chain run on the release machine: `npm run build` → `npx cap sync android` →
`./gradlew bundleRelease -PRELEASE_CERT_SHA256=<Google app-signing cert>`.

- `BUILD SUCCESSFUL in 2m 16s` → `app-release.aab`, 8,089,047 bytes
- `jarsigner -verify` → `jar verified`, signed by `CN=Veyrnox, O=Veyrnox LTD, …`
- `keytool -printcert -jarfile` → SHA-256 `CC:3F:16:36:…:13:0A` (the upload key, correct)
- generated release `BuildConfig.java` → `RELEASE_CERT_SHA256 = "D8:99:69:D5:…:6C:B9"`
  (Google's app-signing cert, **not** the upload cert — the distinction the guard enforces)
- guard executed for all five cases: blank, malformed, upload cert and debug cert each fail
  with their specific message; Google's cert builds clean

`versionCode` was deliberately **not** bumped — this was a verification build, not an upload.

## Still unverified

- **RASP on a Play-delivered install.** This proves the AAB builds and signs, and that the
  right constant is compiled in. It does **not** prove `detectTamper()` passes on a device.
  That needs an internal-track install on hardware showing no Security Alert.
- The independent third-party audit remains outstanding, as everywhere else.
