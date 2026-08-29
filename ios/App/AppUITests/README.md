# AppUITests — iOS golden-path smoke

**What it is:** an XCUITest bundle that walks the first-run flow on iOS.

**What it proves per run:** on a real iPhone (or simulator), fresh install,
the app can walk PIN → Create Wallet → seed reveal without the KEK/RASP
fail-closed banner appearing. That banner is the exact string Play rejected
build 5 for on Android. Blocking the equivalent on iOS is why this exists.

## Running locally

```
xcodebuild test \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro Max'
```

No cloud runner is wired up. Real-device crash + hang signal for shipped
builds comes from **TestFlight → Crashes** and **Xcode Organizer → Metrics
/ Hangs** on tester installs with Analytics-sharing enabled.

## Extending

The smoke deliberately covers only the first-run golden path — the specific
thing an App Reviewer walks. Do not bloat it into a full regression suite;
that belongs in a separate `AppUITests_Regression` target. Keep this bundle
< 60 seconds.
