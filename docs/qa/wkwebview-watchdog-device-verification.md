# Boot watchdog — physical-device verification (#2595)

Runbook for the outstanding half of #2595 DoD 1: proving `public/boot-watchdog.js`
actually executes inside the Capacitor WKWebView under the app's own CSP, on real
hardware. The browser half (`vite preview`, forced 404, fallback rendered) is already
recorded in the issue; it does not substitute, because the WKWebView and the web build
share the policy but not the runtime.

Target device: physical iPad (the original Apple 1.0.1 rejection #3 came from an
iPad Air 11-inch M3, iPadOS 26.6.1).

## What this run proves, and what it does not

Proves: the watchdog file loads and its code runs under `script-src 'self'
'wasm-unsafe-eval'` in the shipped WKWebView, and its fallback UI plus the Reload
handler work when the app bundle never loads.

Does not prove: that the watchdog fires for a *mounted but blank* tree. That is
[#2628](https://github.com/VEYRNOX/veyrnox/issues/2628) — `boot-watchdog.js:26`
returns healthy on `root.firstChild`, so a tree that mounts and renders nothing
never reaches the 5s fallback. Same device session may cover both; they stay
separate closure claims.

## Before you start

> **Warning — this can destroy wallet data on the iPad.** A locally-signed build
> and the App Store / TestFlight build share bundle id `com.veyrnox.app` but not
> the signing identity. Installing one over the other replaces the app and wipes
> its container, including any vault, KEK enrolment and Keychain items. Use an
> iPad with no real wallet on it, or export/accept the loss deliberately first.

Also note `capacitor.config.json` ships `loggingBehavior: "none"`, so webview console
output does not reach the macOS device log. This runbook therefore does not depend on
reading a console — the fallback card itself is the evidence.

## Run A — forced bundle failure (do this one FIRST)

Order matters. Run A is the positive signal; if you do the normal boot first and see
nothing, you have learned nothing — a dormant watchdog and a dead one look identical,
which is the whole reason #2595 exists.

```bash
npm run build && npx cap sync ios
```

Then break only the bundle reference, leaving `boot-watchdog.js` present and the CSP
untouched:

```bash
sed -i '' 's#src="/assets/index-#src="/assets/MISSING-index-#' ios/App/App/public/index.html
```

Confirm the three required conditions before building — the first must print a
`MISSING-index-` src, the second must print the watchdog tag, the third must print
the unchanged `script-src 'self' 'wasm-unsafe-eval'`:

```bash
grep -o 'src="/assets/[^"]*"' ios/App/App/public/index.html; grep -c 'boot-watchdog.js' ios/App/App/public/index.html; ls ios/App/App/public/boot-watchdog.js; grep -o "script-src [^;]*" ios/App/App/public/index.html
```

Build and install to the iPad from Xcode (`ios/App/App.xcodeproj`, scheme `App`,
configuration Release, destination the connected iPad). Cold-launch the app.

Expected, within ~5–6 seconds of launch:
- heading **Veyrnox couldn't start**
- button **Reload Veyrnox**
- tapping Reload reloads — the screen redraws and the same fallback returns (the
  bundle is still missing, so returning to the same card is the correct outcome and
  proves the `addEventListener` handler fired, not an inert inline `onclick`)

If the fallback does NOT appear, #2595 is not fixed on device and must stay open —
record that outcome; it is a finding, not a failed test run.

## Run B — normal bundle (negative control)

```bash
npx cap sync ios
```

That restores `ios/App/App/public/` wholesale from `dist/`, undoing the `sed`. Verify
the src no longer carries `MISSING-`:

```bash
grep -o 'src="/assets/[^"]*"' ios/App/App/public/index.html
```

Rebuild, reinstall, cold-launch. Expected: the app reaches its first usable screen and
**no** fallback card appears — wait at least 15 seconds past first paint to be sure the
5s timer has passed and not fired.

## Evidence to capture

For each run: device model, iPadOS version, app version + build number, Xcode
configuration, and a screenshot or screen recording. Run A's recording should include
the Reload tap. Attach all of it to #2595.

Build number to quote — read it, do not assume:

```bash
grep -A1 CFBundleVersion ios/App/App/Info.plist
```

## Optional — Safari Web Inspector

Wanted in the original plan, kept optional because it is not needed for the claim and
its availability here is unverified either way: since iOS 16.4 a WKWebView is
inspectable only when the host app sets `isInspectable`, and Capacitor 8 ships as a
binary xcframework in this project, so what it sets per configuration could not be
read from source. If you want the console, try a **Debug** build first — that is where
Capacitor is most likely to opt in — and treat a webview that never appears under
Safari's Develop menu as a tooling limit, not as evidence about the watchdog. The CSP
is identical in either configuration, because it lives in the HTML, not the build
settings.

Then: iPad Settings → Safari → Advanced → Web Inspector ON; macOS Safari → Develop →
[iPad] → the Veyrnox webview. Confirm `/boot-watchdog.js` appears in the network list
with a 200 and that no `Executing inline script violates...` / `Refused to load` line
names it. The one console error that is expected and pre-existing is
`frame-ancestors is ignored when delivered via a <meta> element`.

Do not ship a build with webview debugging forced on.

## Closure

#2595 closes when Run A shows the fallback and a working Reload, and Run B shows a
clean boot with no fallback, both on the physical iPad, with the artifacts attached.
