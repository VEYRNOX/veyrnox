# AppUITests — iOS golden-path smoke

**What it is:** the iOS analogue to the Android Robo crawl in
`.github/workflows/firebase-test-lab.yml`. Firebase Test Lab has no Robo on
iOS, only XCUITest — this bundle IS the XCUITest.

**What it proves per run:** on a real iPhone, fresh install, the app can
walk PIN → Create Wallet → seed reveal without the KEK/RASP fail-closed
banner appearing. That banner is the exact string Play rejected build 5
for on Android. Blocking the equivalent on iOS is why this exists.

## One-time Xcode target setup (30 seconds — the only manual step)

The Swift file below already exists; it just needs a target in the
`.xcodeproj` so Xcode compiles it. Do this once, then commit
`App.xcodeproj/project.pbxproj`.

1. Open `ios/App/App.xcworkspace` in Xcode.
2. **File → New → Target…**
3. Under **iOS → Test**, pick **UI Testing Bundle**.
4. Product Name: `AppUITests`. Target to be Tested: `App`. Team: same as `App`.
5. Xcode creates `ios/App/AppUITests/AppUITests.swift` — **DELETE** its
   default template file, then drag the existing `AppUITests.swift` and
   `Info.plist` from this directory into the new target.
6. Ensure the new `AppUITests` scheme is **Shared** (`Product → Scheme →
   Manage Schemes → tick Shared`), so CI can build it.
7. Commit the changed `App.xcodeproj/project.pbxproj` and
   `App.xcodeproj/xcshareddata/xcschemes/AppUITests.xcscheme`.

## After the target exists

Flip the guard in `.github/workflows/firebase-test-lab.yml`:

```yaml
  ios-smoke:
    runs-on: macos-14
-   if: false  # flip to true once XCUITest target lands
+   if: true
```

Next `workflow_dispatch` (or main push touching `src/`, `ios/`,
`capacitor.config.json`, `package-lock.json`) will build the test bundle
and run it on two real iPhones (iPhone 13 Pro iOS 16.6, iPhone 14 iOS 17.5).

## What to expect

- **Green:** every device shows PIN → Create Wallet → seed screen. Safe to
  promote to TestFlight review.
- **Red on `failureBanner`:** the KEK/RASP path is failing closed on that
  iPhone model. Same class of defect Play rejected. **Do not submit.**
- **Red on `seedHeader`:** Create Wallet path is broken. Debug before
  anything else.

## Extending

The smoke deliberately covers only the first-run golden path — the specific
thing an App Reviewer walks. Do not bloat it into a full regression suite;
that belongs in a separate `AppUITests_Regression` target. Keep this bundle
< 60 seconds so a dispatch stays cheap (~$1/run).
