# Runbook — G4 iOS screen-capture and overlay detection (device session)

**Drafted:** 2026-07-14 (plan only — nothing below has been executed)
**Status:** BUILT-UNVALIDATED. Methods were authored on Windows and have not been
compiled on a Mac or exercised on a real device.
**Requires:** Mac with Xcode 15+ (or later), iPhone running iOS 11+, USB connection
trusted, Apple developer signing (personal team is sufficient for local install).
**Companion docs:** `docs/Feature-Status.md` §"2026-07-13/14 RASP", `CLAUDE.md`
§"2026-07-13 iOS RASP", `docs/runbook-ios-kek-session.md` (style reference).
**PR that added the methods:** #985 (BUILT-UNVALIDATED).

---

## What PR #985 adds

Three methods added to `ios/App/App/RaspIntegrityPlugin.m`:

| Method | Mechanism | Output key in `checkIntegrity` result | Policy |
|---|---|---|---|
| `checkScreenCapture` | `[[UIScreen mainScreen] isCaptured]` — YES when screen is mirrored, AirPlayed, or ReplayKit-recorded (iOS 11+) | `"screenCapture"` | Detection only; JS gate policy TBD (see Honest Gaps) |
| `checkOverlay` | `UIAccessibilityIsAssistiveTouchRunning()` (iOS 11+) | `"overlayActive"` | Informational only; must NOT gate sends |
| `applyScreenshotProtection:(WKWebView *)` | HONEST-DISABLED placeholder — no iOS equivalent of Android's `FLAG_SECURE`; method body is a no-op comment | Not called from `checkIntegrity`; not wired | HONEST-DISABLED (I4) |

### Key naming note — iOS vs Android
The iOS plugin returns `"jailbroken"` (not `"rooted"`) for the primary OS trust signal.
`nativeProbe.js:99` maps `verdict.jailbroken === true` into the unified `rooted` signal
that `detect()` consumes. The new `"screenCapture"` and `"overlayActive"` keys are NOT
yet forwarded by `nativeProbe.js` — they will be silently ignored by the current JS
compose layer until a follow-up PR adds them to the `signals` object at `nativeProbe.js:98–105`.
That JS update is a required follow-up task before either signal can influence pre-sign
gate verdicts.

---

## Prerequisites

- [ ] Mac with Xcode 15+ (Xcode 26 if targeting iOS 26 SDK; Xcode 15 is the minimum for
  `[[UIScreen mainScreen] isCaptured]` on iOS 11 deployment target)
- [ ] iPhone, any model, iOS 11 or later (both API calls require iOS 11; `isCaptured`
  is available from iOS 11.0)
- [ ] USB cable; device trusted (Settings → trust this computer)
- [ ] Apple developer account — personal team (`DEVELOPMENT_TEAM` not required if
  `CODE_SIGNING_REQUIRED=NO` for compile check; a real install requires a signing cert)
- [ ] Current `main` branch checked out (`git pull origin main` before starting)
- [ ] `npm ci && npm run build && npx cap sync ios` completed without error
- [ ] AirPlay receiver visible on the local network (e.g., Apple TV, Mac running macOS
  Sequoia AirPlay receiver, or QuickTime → Mirror iPhone) for Step 3
- [ ] AssistiveTouch reachable in device Settings (no MDM restriction on Accessibility)

---

## Step 1 — Build verification (compile check only)

This step can run on the Mac without a device. It closes the "never compiled on a Mac"
gap. It does NOT constitute device verification.

```sh
cd /path/to/veyrnox-secure/ios/App
xcodebuild \
  -workspace App.xcworkspace \
  -scheme App \
  -destination "generic/platform=iOS" \
  build \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY="" \
  2>&1 | grep -E "error:|warning:|BUILD"
```

**Expected:** `BUILD SUCCEEDED`, zero errors.

**Accept criteria:**
- Zero errors in `RaspIntegrityPlugin.m`.
- No warning about `isCaptured` being unavailable below the deployment target —
  `[[UIScreen mainScreen] isCaptured]` is iOS 11+ and Veyrnox targets iOS 13+, so no
  `@available` guard is required. If a warning appears here the deployment target in
  `App.xcodeproj` has changed; record it as a new finding.
- No warning about `UIAccessibilityIsAssistiveTouchRunning` — same iOS 11+ baseline.
- If the compile check is already passing in CI (`.github/workflows/ios-compile-check.yml`),
  note it and proceed directly to Step 2. A CI green does not substitute for Step 3/4
  on a real device.

**If it fails:** check that `RaspIntegrityPlugin.m` is in the Xcode App build target
(PR #826 added it; a `cap sync` might have dropped it). Open `ios/App/App.xcworkspace`,
select the `App` target, check Build Phases → Compile Sources. Also confirm UIKit is
available (it comes via `Capacitor.h` for the `UIScreen` call). Do not proceed to
Step 2 until the build is clean.

---

## Step 2 — Install to device

```sh
# From the repo root:
npm run build && npx cap sync ios
```

Then open `ios/App/App.xcworkspace` in Xcode, select the real device as the target,
and run (or use):

```sh
xcodebuild \
  -workspace ios/App/App.xcworkspace \
  -scheme App \
  -destination "platform=iOS,id=<DEVICE_UDID>" \
  build install
```

Confirm the app launches and the Security Dashboard loads without error. If a previous
Veyrnox build is installed, a same-team/same-bundle reinstall preserves Keychain items
(no need to re-onboard).

---

## Step 3 — Verify `checkScreenCapture`

**Goal:** confirm `"screenCapture":true` appears in the raw bridge result when the device
screen is being mirrored, and returns to `false` when mirroring stops.

### 3a — Trigger mirroring
On the device, open Control Centre → Screen Mirroring → connect to an available AirPlay
receiver (Apple TV, a Mac running AirPlay receiver, or QuickTime Player → File →
New Movie Recording → select iPhone as the camera source). Confirm the status bar shows
the screen-recording/mirroring indicator (orange or blue pill icon).

### 3b — Trigger the RASP probe inside the app
While mirroring is active, open the Veyrnox app and navigate to the Send screen or the
Security Dashboard (either triggers a RASP probe via `selectPresignProbeSource`).

### 3c — Capture the bridge result
Capture the raw `checkIntegrity()` return value from the native bridge via one of:
- **Xcode console:** with the device connected and the scheme running under Xcode,
  `RaspIntegrityPlugin.m` can log the resolved dictionary — add a temporary
  `NSLog(@"[G4] checkIntegrity result: %@", result)` line if needed, or read the
  Capacitor bridge echo in debug builds.
- **Safari Web Inspector:** on Mac, Safari → Develop → [device name] → [Veyrnox WebView] →
  Console → evaluate `window.Capacitor.Plugins.RaspIntegrity.checkIntegrity()`.

**Expected raw bridge result (iOS key names):**
```json
{
  "jailbroken": false,
  "hookedProcess": false,
  "emulator": false,
  "tampered": false,
  "screenCapture": true,
  "overlayActive": false
}
```

Note: the iOS plugin uses `"jailbroken"` not `"rooted"`. `nativeProbe.js` maps
`verdict.jailbroken === true` to the unified `rooted` signal. The new `"screenCapture"`
field is NOT yet forwarded by `nativeProbe.js` to `detect()` — it will appear in the raw
bridge output but will not affect the TIER verdict until the follow-up JS update lands.

### 3d — Stop mirroring and re-probe
Disconnect the AirPlay receiver from Control Centre. Trigger the RASP probe again.

**Expected:** `"screenCapture":false` in the result.

**Record:** both results (with and without mirroring active), timestamps, AirPlay receiver
type used, device model and iOS version.

### 3e — Pass criteria
- `"screenCapture":true` while mirroring is active.
- `"screenCapture":false` when mirroring is not active.
- The four existing keys (`jailbroken`, `hookedProcess`, `emulator`, `tampered`) are
  unchanged and correct for a non-jailbroken device (all `false`).
- No crash or unhandled exception in the plugin.

---

## Step 4 — Verify `checkOverlay`

**Goal:** confirm `"overlayActive":true` when AssistiveTouch is on, `false` when off.

### 4a — Enable AssistiveTouch
Settings → Accessibility → Touch → AssistiveTouch → ON. The floating circle appears.

### 4b — Trigger RASP probe and capture result
Same method as Step 3c. **Expected:** `"overlayActive":true`.

### 4c — Disable AssistiveTouch and re-probe
Settings → Accessibility → Touch → AssistiveTouch → OFF. Trigger probe again.
**Expected:** `"overlayActive":false`.

### 4d — Pass criteria
- `"overlayActive":true` with AssistiveTouch on.
- `"overlayActive":false` with AssistiveTouch off.
- The `"overlayActive"` signal does NOT change the pre-sign TIER verdict — it is
  informational only. Confirm the Send screen allows a normal send with AssistiveTouch
  on (no unexpected BLOCK or WARN that was not present before this check).

---

## Step 5 — Regression check on existing keys

With both `screenCapture` and `overlayActive` false (normal device state, no mirroring,
no AssistiveTouch), confirm the `checkIntegrity()` result on a non-jailbroken device is:

```json
{
  "jailbroken": false,
  "hookedProcess": false,
  "emulator": false,
  "tampered": false,
  "screenCapture": false,
  "overlayActive": false
}
```

And that the TIER verdict from the full probe chain remains `ALLOW` (no regression on
the send gate from the new fields being present).

Also run a basic send-flow smoke test on testnet (Sepolia) to confirm no regression
in the end-to-end path. A testnet send for regression purposes does NOT constitute a
new on-chain verification; it is a regression gate only.

---

## Step 6 — Record evidence

After Steps 3–5 pass:

1. Save the full `checkIntegrity()` JSON from each state (mirroring on/off,
   AssistiveTouch on/off, baseline) with timestamps.
2. Note: a txid is NOT required for this session. The G4 checks are detection
   additions, not send-gate changes. The evidence package is the captured bridge
   output plus the build log from Step 1.
3. Update `CLAUDE.md` with:
   - Device model and iOS version
   - Date of session
   - Result JSONs for each tested state
   - Which Xcode version was used for the compile check
4. Update `docs/Feature-Status.md` to change the G4 row status from
   `BUILT-UNVALIDATED` to `DEVICE-VERIFIED (INTERNAL)`.
5. Note in both files that independent audit remains outstanding.

**Status language after a passing session:**
`DEVICE-VERIFIED (INTERNAL, [date]) — [device model], iOS [version]; screenCapture
and overlayActive confirmed on [AirPlay receiver type]; existing keys unaffected.
INTERNAL — not independently audited.`

**Status language if a step fails:** record as a dated finding; do not advance status
beyond `BUILT-UNVALIDATED` for the affected check.

---

## Honest gaps — record without mitigation

These are known limitations that must be documented in the evidence record; do not
attempt to close them during this session.

### `applyScreenshotProtection:` is HONEST-DISABLED
The method is a no-op placeholder. There is no iOS equivalent of Android's
`FLAG_SECURE` that prevents screenshots from a WKWebView without private API. This
is documented in the source as a known architectural gap. Do NOT test it and do NOT
change its status to anything other than `HONEST-DISABLED` unless a real iOS API
is confirmed to work. No runbook step covers it.

### `overlayActive` is informational only — do not gate sends on it
`UIAccessibilityIsAssistiveTouchRunning()` is a legitimate accessibility feature used
by millions of users with motor impairments. The JS compose/degrade layer must not
promote an `overlayActive:true` signal into a send BLOCK or WARN. Confirm this
explicitly in Step 4d. If any future PR adds a degrade policy for `overlayActive`,
flag it for the owner before merging.

### `screenCapture` policy gap — JS follow-up required
After PR #985 lands, `nativeProbe.js` does not forward `"screenCapture"` to
`detect()`'s `signals` object. The signal is present in the raw bridge result but
is a no-op at the gate layer. A follow-up PR must decide and implement:
- **Option A (TIER.WARN):** add `screenSharing: verdict.screenCapture === true` to
  the `signals` object in `nativeProbe.js` and handle it in `degrade.js` with copy
  such as "Your screen appears to be shared." This is the safer choice for a wallet.
- **Option B (informational):** expose it in the Security Dashboard UI only, no
  gate effect.
The decision requires the owner. Do not implement either option without explicit
direction. Record this as an open policy gap in the evidence record.

### `isCaptured` on iOS Simulator
`[[UIScreen mainScreen] isCaptured]` may behave differently in the iOS Simulator than
on a real device (QuickTime mirror and AirPlay are real-device paths). The compile
check (Step 1) and build can use the Simulator; Steps 3 and 4 require a real device.

### Independent audit not satisfied
This session produces INTERNAL evidence only. The outstanding independent third-party
audit covers the full RASP stack and is not satisfied by any INTERNAL session or
runbook passage.

### Argon2id 192 MiB OOM on A11 hardware
As noted from the 2026-07-13 palera1n session: 192 MiB Argon2id runs out of memory
on A11 devices (iPhone 8 Plus) in WKWebView. If the test device is A11-class,
wallet unlock may fail or be very slow. For the purposes of this runbook a test device
with ≥4 GB RAM (A14 or later) avoids the issue. If A11 hardware is the only device
available, record the OOM as a known preexisting gap and proceed with a locally
reduced KDF cost for the session (revert before committing).

---

## Abort criteria

- Step 1 fails to compile: do not proceed past Step 1. Record the compiler error as
  a new finding and file a PR before the device session.
- Any of the existing four keys (`jailbroken`, `hookedProcess`, `emulator`, `tampered`)
  change value in an unexpected direction: stop, capture logs, treat as a regression
  finding. Do not ship a build that changes an existing key's behaviour on a
  non-jailbroken device.
- The app crashes or the bridge call throws during Steps 3 or 4: stop, capture the
  Xcode crash log, file as a finding. Do not mark G4 as DEVICE-VERIFIED.
