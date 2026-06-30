# RASP — Rooted/Hooked Device Adversarial Testing: Device Verification Package

**Finding ID:** F-09 (open audit finding: "RASP not adversarially tested on rooted/Frida devices")  
**Status:** OPEN — native RASP OS-level probes not yet written; browser probe BUILT and wired  
**Source files:**  
  `src/rasp/browserProbe.js` — browser automation detection (BUILT, wired to SendCrypto)  
  `src/rasp/detect.js` — `detect()`, `classifyEnvironment()`, BUILT  
  `src/rasp/degrade.js` — `degrade()` policy map, BUILT  
  `src/rasp/nativeProbe.js` — JS interface layer, BUILT; native Swift/Kotlin plugin NOT written  
  `src/rasp/raspIntegrityPlugin.js` — Capacitor plugin registration stub, BUILT  
  `src/rasp/conditions.js` — CONDITION/TIER constants, BUILT  
  `src/sign-gate/presign.js` — `presignGate()`, wired in SendCrypto and WalletConnect  
**Open audit finding:** `docs/audit-2026-06-28-internal-static-analysis.md` F-09  
**Date prepared:** 2026-06-30  

---

## Critical architecture note — read before designing any test

### What is BUILT and what is not

**BUILT (browser probe, always-on on web and in the Capacitor WebView):**

`browserProbeSource` in `src/rasp/browserProbe.js` samples at module-load time:
- `navigator.webdriver === true` → `hooked = true` (CDP-controlled browsers, Selenium, Playwright default launch)
- HTML `webdriver` attribute on `<html>` → `hooked = true`
- `window.callPhantom`, `window._phantom` → `hooked = true` (PhantomJS)
- `window.__selenium_unwrapped`, `window.__webdriver_evaluate`, `window.__webdriver_script_fn` → `hooked = true` (legacy Selenium)

When `hooked = true`, `detect()` returns `CONDITION.HOOKED`, `degrade()` maps it to `TIER.BLOCK`, and `presignGate()` sets `signerReachable: false` — the send is blocked.

`rooted`, `emulator`, and `tampered` are always `false` in the browser probe. The browser cannot access OS-level signals.

**NOT BUILT (native OS probe):**

`src/rasp/nativeProbe.js` is the JS interface that would call a Capacitor native plugin (`RaspIntegrity.checkIntegrity()`). This JS layer exists and is correct. However, `src/rasp/raspIntegrityPlugin.js` says explicitly:

> "The actual detection logic is NATIVE code a mobile dev must still write. iOS (Swift): `ios/App/App/RaspIntegrityPlugin.swift`. Android (Kotlin): `RaspIntegrityPlugin.kt`."

Neither the Swift nor the Kotlin implementation exists. When `nativeProbeSource()` is called on a real device, the plugin import throws, and it fails closed to `{ available: false }`, which `detect()` maps to `CONDITION.INTEGRITY_UNAVAILABLE`, and `degrade()` maps to `TIER.WARN` — not `TIER.BLOCK`. A rooted device with the current native build will see a WARN, not a BLOCK. Frida injection on a native device: if it does not set `navigator.webdriver`, the browser probe will not detect it.

**What F-09 actually gates:**

F-09 is not "verify that the existing detection works on a rooted device." F-09 is: "the native OS-level probes (jailbreak paths, Frida port scan, su detection, etc.) do not exist yet, and the existing code cannot detect root/jailbreak/Frida on a real device." The test must be honest about this.

### What degrade() policy says (from source)

| Condition | Tier | Blocks signing |
|---|---|---|
| CLEAN | ALLOW | No |
| ROOTED | WARN | No (advisory only) |
| INTEGRITY_UNAVAILABLE | WARN | No (advisory only) |
| EMULATOR | BLOCK | Yes (all sends blocked) |
| HOOKED | BLOCK | Yes |
| TAMPERED | BLOCK | Yes |
| INTEGRITY_FAIL | BLOCK | Yes |

Note: `requiresBiometric: true` on ROOTED and INTEGRITY_UNAVAILABLE is a TARGET field — `compose.js` currently treats WARN as proceed-allowed with no biometric step. The biometric re-confirm at WARN is not enforced.

---

## What this test package covers

This package covers two separate scopes:

**Scope A (BUILT, can be tested now):** Browser automation detection — confirming the browser probe correctly triggers BLOCK when `navigator.webdriver` is set. This is functional verification of what is already wired.

**Scope B (native gap, documents F-09):** Adversarial testing on a rooted Android or jailbroken iOS device with Frida, to confirm that (a) the browser probe fires on the flag it can detect, and (b) the native probe correctly fails-closed to INTEGRITY_UNAVAILABLE (WARN) because the native plugin does not exist. This test CANNOT confirm native root/jailbreak detection; it confirms that the fail-closed path is honest.

---

## Hardware and tools required

### Scope A (browser probe)

- Any machine with Chrome (or Chromium), Node, and `npm run dev` running.
- Chrome DevTools Protocol (CDP) or Playwright. Both set `navigator.webdriver = true` by default in their controlled browser sessions.
- Alternatively: `npm test` already has coverage via `browserProbe.test.js` (or equivalent); Scope A may already be covered in the test suite.

### Scope B (native adversarial)

- Rooted Android device (Pixel 5 or later recommended; root via Magisk), OR jailbroken iPhone (iOS 15–16; jailbreak via palera1n or Dopamine on a supported model).
- Frida server 16.x matching the device OS version. Install instructions: `https://frida.re/docs/android/` or `https://frida.re/docs/ios/`.
- Dev machine with `adb` (Android) or `idb`/`usbmuxd` (iOS) and Frida tools (`pip install frida-tools`).
- Mac with Xcode (for iOS native build). Android build can be done on Mac or Linux.
- Note: F-09 cannot be "closed" by this test. This test confirms the honest fail-closed behaviour in the absence of a native plugin. The finding remains OPEN until the native plugin is written and verified.

---

## Scope A procedure: browser automation detection

### Setup

1. Run `npm run dev`. Open the app in a normal browser (not automation-controlled). Confirm the app loads and RASP shows no warning in the Security Dashboard (Settings > Security, or the RASP status indicator if present). This is the CLEAN baseline.

### Trigger: CDP-controlled browser (Playwright)

2. Install Playwright: `npm i -D playwright`. In a test script or REPL:

```js
const { chromium } = require('playwright');
const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();
await page.goto('http://localhost:5173/');
// At this point navigator.webdriver === true in the page
```

3. Confirm in the DevTools console of the Playwright-controlled browser: `navigator.webdriver` must be `true`.
4. Navigate to Send in the wallet UI. Attempt to initiate a send.
5. The pre-sign gate must block the send. The UI should show a RASP warning indicating signing is turned off (copy from `degrade.js`: "Another program appears to be inspecting this app, so signing and key access are turned off until it stops.").

### Pass criteria for Scope A

- `navigator.webdriver === true` in the controlled browser.
- The send flow is blocked before the signing step. `presignGate()` returns `signerReachable: false`.
- The RASP warning sentence is displayed in the UI.
- In a normal (non-automated) browser, the same send flow proceeds normally (no false positive).

### Evidence to capture

- Screenshots: the RASP block state in the UI, the warning sentence, the blocked send flow.
- Console log confirming `signerReachable: false` from `presignGate()` if accessible.
- Playwright output or CDP session log showing `webdriver: true`.

---

## Scope B procedure: native device with Frida

### Purpose

Confirm that on a real rooted/jailbroken device:
1. The browser probe fires correctly for any automation signals it can detect (consistent with Scope A).
2. The native probe correctly fails-closed to INTEGRITY_UNAVAILABLE (WARN) because the native plugin is not implemented — no false CLEAN, no crash, no block that would prevent the app from loading.
3. The WARN tier is shown honestly to the user.

### What this test CANNOT confirm

This test CANNOT confirm that Frida injection is detected by the app at the OS level — the native plugin that would do this does not exist. Frida on a native device will likely produce no RASP signal above WARN/INTEGRITY_UNAVAILABLE unless Frida sets `navigator.webdriver` (it does not by default). Document this honestly in the evidence.

### Android setup

```bash
# Push frida-server to device
adb push frida-server /data/local/tmp/
adb shell chmod +x /data/local/tmp/frida-server
adb shell /data/local/tmp/frida-server &

# Verify Frida can see the app process
frida-ps -U | grep veyrnox
```

Build the native Android app in debug mode:
```bash
npm run build
npx cap sync android
# In Android Studio, run on the connected rooted device, OR:
cd android && ./gradlew assembleDebug
adb install app/build/outputs/apk/debug/app-debug.apk
```

### iOS setup (requires jailbroken device and Mac)

```bash
# On jailbroken device, install Frida via Cydia/Sileo: add repo https://build.frida.re
# Install "Frida" package
# From dev Mac:
frida-ps -U  # lists running processes on device
```

Build native app via Xcode (see `h1-passkey-2fa-se-verification.md` build instructions). Install on the jailbroken device the same way as a normal device.

### Test steps

1. Launch the Veyrnox app on the rooted/jailbroken device.
2. From the dev machine, attach Frida to the app process:
   ```bash
   frida -U -n Veyrnox  # or the app process name from frida-ps
   ```
3. Confirm Frida attaches successfully (Frida REPL prompt appears).
4. In the Frida REPL, probe the JavaScript environment in the WebView:
   ```js
   // Check if navigator.webdriver is set
   // (Frida on the native process does not inject into the WebView JS context by default)
   // Use frida-compile or a Frida gadget to attach to the WebView JS context if needed
   ```
   Note: Frida attached to the native process does not automatically set `navigator.webdriver` in the WebView. The browser probe may not fire.
5. In the app, navigate to Security Dashboard (if accessible). Note the RASP status shown.
6. Navigate to Send. Attempt to initiate a send.
7. Record what the RASP gate shows:
   - If the browser probe detected an automation flag: BLOCK, send stopped.
   - If no browser signals were set: WARN (INTEGRITY_UNAVAILABLE from the native probe failing closed), send proceeds with advisory.
   - If the app shows CLEAN and send proceeds with no warning: this would be a FAIL (the native probe returned a spurious CLEAN despite the plugin not being implemented). This should not happen given the fail-closed code, but must be checked.

### Pass criteria for Scope B

1. The app loads and does not crash on the rooted/jailbroken device.
2. The native probe fails-closed to INTEGRITY_UNAVAILABLE: no CLEAN verdict is returned. The Security Dashboard or RASP gate shows WARN, not CLEAN.
3. There is no fabricated security assertion. The UI does not claim the device is "safe" or "verified" when the plugin could not run.
4. If Frida sets any automation signal detectable by the browser probe (e.g. via a Gadget injection that sets `navigator.webdriver`), the gate escalates to BLOCK.
5. No crash, no silent failure, no data egress (I2). Network monitor (Charles Proxy or `tcpdump` on the device) must show no outbound calls from the RASP probe — it is on-device only.

### Evidence to capture

- Device details: model, OS version, jailbreak tool / root method used.
- Frida version and attachment confirmation (Frida REPL prompt).
- Screenshots of the RASP status in the app: the WARN tier message, or the BLOCK message if browser automation signals were present.
- Network monitor capture showing no egress from the RASP probe.
- Description of which signals Frida did or did not set in the WebView context.
- Explicit note: "Native RASP OS-level plugin not implemented; native probe correctly fails closed to INTEGRITY_UNAVAILABLE (WARN)."

---

## What must be documented in the F-09 closure criteria

F-09 is NOT closed by this verification. It remains OPEN until:

1. The native Swift plugin (`ios/App/App/RaspIntegrityPlugin.swift`) is written and implements `checkIntegrity()` with jailbreak path checks, Frida port scan, and sandbox escape test.
2. The native Kotlin plugin (`android/app/src/main/java/com/veyrnox/app/RaspIntegrityPlugin.kt`) is written with root (su/Magisk/busybox) detection, Frida/Xposed maps scan, and emulator fingerprinting.
3. Both plugins are verified on real hostile devices (this test package, re-run after the plugins exist) and confirmed to return the correct condition (`ROOTED`, `HOOKED`, or `TAMPERED`) for each signal.
4. The result is reviewed in an independent audit (Phase 5 per roadmap).

This test package produces evidence for the current honest state (fail-closed, no fabricated CLEAN) and records the gap for the native implementation.
