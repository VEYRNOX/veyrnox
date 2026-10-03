# OTA web-bundle updates

**Status: BUILT, INTERNAL.** Verified end to end on a **physical iPhone** against a
staging release (2026-10-02, development build; see "Staging: physical iPhone result"),
and earlier on the iOS simulator. **A production release now reaches iOS and Android
1.0.3.** Android OTA does not work in the 1.0.2 binary (see "Android: the `.well-known`
asset bug"); the fix (#2816) shipped in 1.0.3, live on Google Play at 100% since
2026-10-02 (`docs/RELEASE-v1.0.3.md`). That fix is emulator-verified only: **no physical
Android phone has taken an OTA update yet**, so the first production publish is also the
first real-device test of the Android path (a failure leaves the phone on its embedded
bundle). Android installs still on 1.0.2 cannot update. A
**no-change canary is live on the production channel** (bundle `202610011706`, see
"Production canary published"). Not verified end to end with a store-signed binary:
an App Store iPhone was seen fetching the production manifest and signature, but the
swap itself was not observed on it.

**Signing keys are provisioned (2026-09-18).** Two YubiKey 5C NFC tokens, each
holding a non-extractable P-256 key generated on-token in PIV slot 9c, with
touch required per signature:

| Token | Serial | Pinned |
|---|---|---|
| A | 39744850 | `OtaConfig` on both platforms, first in the list |
| B | 39744871 | `OtaConfig` on both platforms, second in the list |

Both were proven end to end against a real 1066-file bundle: each token's
signature verified under its own pinned key and under no other. That is tooling
evidence, not device evidence.

## Staging canary published (2026-10-01)

The first real release went to the **staging** channel, as a harmless canary. It is
the first bundle ever on `updates.veyrnox.com`; at that time production had none
(`production/latest.json` was a 404; see "Production canary published").

| | |
|---|---|
| Channel / version | `staging` / `202610010509` |
| Built from | `main` at `209d8cd3`, `npm run build:staging` |
| Signed with | token B (39744871), sealed and verified against the pinned keys |
| Files | 1071 files, all fetched back from the live host and matched to the manifest sha256 before `latest.json` went up |
| Pointer | `staging/latest.json`, uploaded last, `Cache-Control: no-cache` |

**Picked up by one iOS simulator, and nothing else** (see the next section). It is
`channel: staging`, so the store apps (production channel) refuse it by design; only
a `--mode staging` build whose own version is older than the release can take it.
Everything outside that one run is still tooling evidence.

What the canary taught, each fixed in the procedure below:

- `pkcs11-tool` needs `--login` with current OpenSC (see "Releasing a fix").
- Cloudflare rewrote one HTML file in transit and its sha256 stopped matching (see
  "What it does NOT guarantee").
- Neither PIN was recorded where it was needed, and two tokens came within one wrong
  guess of locking (see "If a PIN is lost").

## Staging canary: iOS simulator result (2026-10-01)

**The canary downloaded, booted and was promoted on an iOS simulator.** The whole
chain ran: the signature check, the per-file sha256 check, promotion on first render,
and the version floor moving up. No PIN was entered and no wallet was created during
the test itself: both cold starts landed on the welcome screen, and the state was read
from the app's files.
A wallet was created in that simulator by hand afterwards, once the canary was already
active, so that simulator is no longer a clean first-run state. To repeat the
first-run case, use a fresh simulator or erase this one (detach the live panel first,
or the shutdown and erase silently do nothing).

| | |
|---|---|
| Device | iPhone 17 Pro simulator, iOS 26.5, Xcode 27.0 |
| Binary | web code identical to `main` at `c086d1fd`; `OTA_BUNDLE_VERSION=202610010000 npm run build:staging`, then `npx cap sync ios`, then a signed simulator build (`DEVELOPMENT_TEAM=R54268MWFV`) |
| Embedded manifest | `staging` / `202610010000`, no dev flags set |
| First cold start | the app fetched the release into `Library/VeyrnoxOTA/202610010509`: 1073 files, the 1071 bundle files plus the manifest and signature. State: `pending = 202610010509` |
| Second cold start | `active = 202610010509`, `floor = 202610010509`, `pending = 0` |

The update check ran on the very first cold start, on the welcome screen, before any
wallet existed, which is what the design says (see the I3 and I2 bullet under "What it does NOT
guarantee", below).

**Test procedure, in case you repeat it:**

1. **Pin the test binary's version below the release's.** A binary's embedded version
   is its build time, and a store build newer than an OTA bundle wins and deletes
   it. A binary built *after* the canary would therefore carry a newer version and
   ignore the canary. Build the test binary with `OTA_BUNDLE_VERSION` set to a value
   older than the release. (This follows the "a store update newer than the OTA bundle
   wins" row in the table under "Why this is dangerous"; the ignored-canary case
   itself was avoided, not run.)
2. Build with `--mode staging`, since a staging bundle is refused by a production
   binary. Run `npx cap sync ios` immediately before the build, because
   `ios/App/App/public` is gitignored and `xcodebuild` does not rebuild it.
3. Cold start the app twice: terminate it, then launch it again. The first start
   stages the update; the second boots it.
4. Read the result without touching the wallet. Find the data folder with
   `xcrun simctl get_app_container <udid> com.veyrnox.app data`, list
   `Library/VeyrnoxOTA`, and read `veyrnoxOta.active`, `.pending`, `.pendingBooted`
   and `.floor` from `Library/Preferences/com.veyrnox.app.plist` with `plutil -p`.
   The plist can lag the app by a few seconds, because UserDefaults are written
   behind a cache: a read taken right after the second launch still showed
   `pending`, and a read a few seconds later showed `active`. `simctl spawn ...
   defaults read` cannot see this app's domain, so read the file.

**What this does not show:**

- **A physical device or Android.** Nothing here runs on Android, and the simulator is
  not hardware.
- **The production channel or a store-signed binary.** At that point production had no release, and
  the simulator ran a debug build, so the pinned-key and channel checks ran against a
  staging manifest only.
- **Any failure path.** A bad signature, a hash mismatch, a bundle that boots but never
  reports ready, and the rollback were not exercised on a device; they are covered
  by unit tests.
- **That the new code is what rendered.** The canary's web code was built from an
  older commit than the binary's, so after promotion the simulator is running that
  older code. The proof is the state values above, not anything on screen.

## Staging canary: Android emulator result (2026-10-01)

**The canary was never downloaded on Android.** The update check was blocked at the
host. This is the only Android run so far, and it was on an emulator, not a phone, so
it does not say whether real Android devices are blocked too.

| | |
|---|---|
| Device | fresh emulator, Android 14 (API 34, `google_apis`, arm64), WebView Chrome 113 |
| Binary | the exact shipped 1.0.2 web code (`a4559997`; iOS build 8 `dbb7f135` differs only in a Gradle file and a test), `OTA_BUNDLE_VERSION=202610010000 npm run build:staging`, `npx cap sync android`, then `assembleGoogleDebug` (`com.veyrnox.app.debug`) |
| Native side | fine. The OTA plugin reported `enabled: true`, channel `staging`, `nativeApi: 1`, `runningVersion` and `newestKnownVersion` both `202610010000`, and wrote its state file with all zeros |
| Web side | **blocked.** Every request from the WebView to `updates.veyrnox.com` (`latest.json` on both channels, a file under a release) returned **HTTP 403, the Cloudflare "Sorry, you have been blocked" page**. The same WebView read `www.veyrnox.com/robots.txt` with 200, so the zone is not blocking it wholesale |
| Result | `VeyrnoxOTA` never appeared in the app's data, so there was no second cold start to run |

**What Cloudflare says** (Security, Events, zone `veyrnox.com`, last 24 hours, filtered
to host `updates.veyrnox.com` and action Block): 19 blocks, all by **managed rules**,
none by a custom rule.

- **Ruleset:** Cloudflare OWASP Core Ruleset.
- **Rule:** `920274: Invalid character in request headers (outside of very strict set)`,
  rule id `ac090cd641d742b3adba4ece7f4d7e64`, 15 of the 19.
- Seven of the 19 came from the test machine, with the emulator WebView's exact user
  agent and `Referer: localhost`, on `/staging/latest.json` (5) and
  `/production/latest.json` (3). The event shows `HTTP/1.1` and method `GET`.
- The other four blocks were by different managed rules (`Drupal - Anomaly:Header:X-Forwarded-For`
  twice, a missing or empty `Accept`, and a non-GET/POST method, which was a `HEAD`).
  They were not attributed to any source here.
- The zone's nine custom rules are all about `tip.veyrnox.com` and `tip-staging.veyrnox.com`.
  None mentions the updates host, so the managed OWASP rules apply to it in full.
- The event list also accepts filters in the URL, for example
  `.../security/analytics/events?action=block&host=updates.veyrnox.com`.

**What is NOT known.** Which header trips rule 920274. Plain `curl` to the same URL gets
200 with each of these tried on its own: `Origin: https://localhost` and
`capacitor://localhost`, the emulator's exact user agent, a modern Pixel user agent,
`X-Requested-With: com.veyrnox.app.debug`, browser-style `Sec-Fetch-*` and `Referer`,
and a quoted `sec-ch-ua`. It also is not known whether a real phone, whose WebView is
current, sends anything that trips the rule. The emulator image's WebView is Chrome 113
from 2023.

**Failure mode.** A blocked update check fails closed: the app stays on its current
bundle and nothing unsafe happens. But if real Android devices are blocked the same
way, **Android OTA would silently never apply**, and a production release would reach
iOS only.

**A fix has been considered and NOT applied.** A custom rule on the `veyrnox.com` zone
with the expression `(http.host eq "updates.veyrnox.com")`, action Skip, scoped to rule
`920274` of the OWASP ruleset only. It matches the zone's existing "Skip WAF on staging"
pattern. It was started and deliberately not saved: it lowers protection on that hostname,
so it needs an explicit owner decision, and the physical-phone result may show it is
unnecessary. The reasoning for it, if it is made: the host serves public, signed files
that the app verifies against pinned keys and per-file hashes, so its security does not
depend on the WAF. If skipping that single rule is not enough, other OWASP rules may
also trip, and the next step would be skipping managed rules for the host. The cost of
either is less generic scanning protection on `updates.veyrnox.com`.

**Consequence for releasing.** Superseded: the rule was skipped for the host (see
"Cloudflare: the managed-rule exception") and a second, separate Android failure was
found (see "Android: the `.well-known` asset bug").

**Android test procedure and traps**, so the next run does not repeat them:

1. **Use Java 21 for Gradle**, to match CI. The default `openjdk` formula is Java 25 and
   Gradle 8.14 fails at once with `Unsupported class file major version 69`.
2. **A locked emulator cannot launch the app.** One existing AVD had a device lock; its
   user stayed `RUNNING_LOCKED`, the app was "partially direct-boot aware", and
   `am start` returned `-92` (`START_CLASS_NOT_FOUND`) with `monkey` finding no launcher.
   Check `dumpsys user` for `RUNNING_UNLOCKED`, or create a fresh AVD
   (`avdmanager create avd -n <name> -k "system-images;android-34;google_apis;arm64-v8a" -d pixel_7`).
   Do not wipe an AVD that holds other installs.
3. **Launch with** `am start -n com.veyrnox.app.debug/com.veyrnox.app.MainActivity`.
4. **Screenshots come back empty**: the wallet blocks screen capture (`FLAG_SECURE`).
   Debug builds expose the WebView over DevTools instead:
   `adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>`, then
   `curl localhost:9222/json` lists the page and its websocket, and a `Runtime.evaluate`
   over that websocket can run `fetch(...)` or call
   `Capacitor.Plugins.VeyrnoxOta.status()`. It touches no wallet state.
5. **Read the OTA state** with `adb shell run-as com.veyrnox.app.debug cat shared_prefs/VeyrnoxOta.xml`
   (`active`, `pending`, `pendingBooted`, `floor`) and
   `... ls files/VeyrnoxOTA` for the staged versions.

## Cloudflare: the managed-rule exception (2026-10-01)

After the finding above, the owner added a **Managed rules exception** (Security, Security
rules, Create rule, Managed rules exception) on zone `veyrnox.com`:

- **Expression:** `(http.host eq "updates.veyrnox.com")`
- **Skip:** the OWASP Core Ruleset rule `920274` only (the form allows a per-rule skip;
  the custom-rule form only offers broad skips, so use this one).
- **Order matters: it must be FIRST.** Managed-rule exceptions run before the
  Execute rows that apply the managed rulesets. The first deploy was placed after them
  and changed nothing (36 of 46 requests still blocked). Use Place at, First, then re-test.

After that the emulator and a Pixel WebView got 200s from `updates.veyrnox.com`, and
Security Events showed no new blocks for the emulator. Other managed rules and the
host's `HEAD` / empty-`Accept` blocks are unchanged. The host serves public, signed
files verified against pinned keys and per-file hashes, so its security does not depend
on the WAF; the cost is less generic scanning protection on that hostname.

## Android: the `.well-known` asset bug (2026-10-01)

With the network path open, the Android emulator downloaded `ota-manifest.json` and
`ota-manifest.sig` and then stopped: no bundle file, no `pending`, no error shown.

**Root cause.** The embedded manifest lists 1070 files, including
`.well-known/README.md`, `.well-known/apple-app-site-association` and
`.well-known/assetlinks.json`. Android's asset packaging drops files whose names start
with a dot, so the debug APK has **zero** entries under `assets/public/.well-known/`
(1070 `assets/public/` entries in all, counted with `unzip -l`).
`OtaUpdatePlugin.kt` `prepare()` reuses an unchanged file by opening it from
`context.assets`; that open throws for the first `.well-known` file, `prepare` fails
with `OTA_IO`, and `src/lib/otaUpdate.js` swallows the error outside DEV.

**Consequences.**

- **Android OTA is broken in every shipped 1.0.2 binary**, in a way OTA itself cannot
  fix: the code that fails is native. It fails closed and silently; the app stays on its
  embedded bundle.
- It needs a store release (Android 1.0.3): either make `prepare()` treat an asset it
  cannot open as `missing` so it is downloaded, or stop dot-files being dropped
  (`androidResources.ignoreAssetsPattern`) or exclude them from the manifest.
- **Not checked:** whether the underscore-prefixed manifest entries (`_headers`,
  `_redirects`, `assets/_esm-*.js`, `assets/_u64-*.js`) are in the APK. Check with
  `unzip -l` before assuming the fix above is complete.
- iOS is not affected: it reads the file straight from the app bundle.

**Fix (this branch, ships with the next Android release; not in 1.0.2).**
`OtaBundleVerifier.prefill` now reports a held file whose source cannot be opened as
`missing` instead of throwing, so it is downloaded and sha256-checked by `stage` like
any other file (nothing is trusted without its hash). Pinned by four JVM tests;
reintroducing the throw turns two of them red. **Verified on the emulator** against the
staging canary: manifest, `.well-known/*` and every other file downloaded, `stage`
accepted it, the second cold start promoted it, and `status()` reported
`runningVersion 202610010509`. Not yet verified on a physical phone.

**A second Android-only failure, found while verifying the fix.** After `prepare` passed,
`stage` returned `OTA_VERIFY_FAILED`: Cloudflare had injected its Web Analytics beacon
into `index.html` (22325 bytes, not the signed 21964). Android's HTTP client sends
`Accept: text/html, ...`, and the staging canary's HTML files were served as
`text/html`, so Cloudflare rewrote them; `curl` (`Accept: */*`) and iOS never saw it.
Re-uploading `index.html` as `application/octet-stream` fixed it. **Production was not
affected**, because every object there was uploaded as `octet-stream`. Check it with
`curl -H 'Accept: text/html'` as well as plain `curl`. `verify-live` now does this itself:
it requests every object a second time with Android's `Accept`, so a rewrite that only
Android would receive fails the check (reported as `[android client]`).

## Production canary published (2026-10-01)

A **no-change canary** went to the production channel: the exact shipped 1.0.2 web
code, rebuilt with a newer version number, so it changes nothing a user sees. It is not
built from `main`.

| | |
|---|---|
| Source | `a4559997`, in a clean worktree (`.env.production` is tracked, so no `.env.local` and no dev flags) |
| Build | `OTA_BUNDLE_VERSION=202610011706 npm run build` |
| Channel / version | `production` / `202610011706` |
| Files | 1070 in the manifest; 1072 objects including the manifest and signature |
| Manifest sha256 | `e116e6e206faebc27d00ebd63289405302576ee5bd6aaec2a69d1f7e69befaf9` |
| Signed with | token B (39744871), PIN and touch by the owner; `seal` and `verify` passed against the pinned keys |
| Upload order | files, manifest and signature, `verify-live`, then `latest.json` last with `no-cache` |

**Caught by `verify-live`:** the parallel upload reported two lines containing
"error"/"fail" and `_redirects` was missing from the host (HTTP 404). It was re-uploaded
and `verify-live` re-run (`live copy OK: 1072 objects match`) before `latest.json` was
published. Do not trust the exit code of the `xargs` upload; run `verify-live` every time.

**Reach.** iOS 1.0.2 installs only. **What has been seen from real devices** (Cloudflare
Security Analytics, sampled):

- **An App Store iPhone** (the owner's, 1.0.2 build 8) fetched `production/latest.json`,
  then `production/202610011706/ota-manifest.json` and `ota-manifest.sig`, at 06:26 BST
  on 2026-10-02, right after a cold start. It fetched no files, which is expected for a
  no-change bundle: every file hash matches the embedded bundle, so `prepare` returns
  nothing missing. Whether it then staged and booted the bundle cannot be seen from the
  host, and 1.0.2 has no screen that shows it.
- **A real Android 1.0.2 phone** (Android 11, TECNO) fetched the production manifest at
  22:47 BST on 2026-10-01 and no files after it: the first real-device sighting of the
  `.well-known` bug.
- Traffic is low: about 300 `production/latest.json` requests in the 7 days to
  2026-10-02, many of them from Microsoft-owned addresses with an iPhone WebView user
  agent. Request volume is far below the subscriber count; the reason is not known.

**To roll back,** see "Rolling back".

## Staging: physical iPhone result (2026-10-02)

**OTA works end to end on a real iPhone.** The running web bundle changed on screen from
the embedded `202610020000` to the downloaded `202610020712`.

| | |
|---|---|
| Device | iPhone 17 Pro Max (the owner's; its Veyrnox held no funds), cabled, Developer Mode on |
| Binary | `main` at `efd1063f`, which includes the Settings "Web bundle" row (#2818). `OTA_BUNDLE_VERSION=202610020000 npm run build:staging`, `npx cap sync ios`, `xcodebuild -configuration Debug` signed for team `R54268MWFV`, installed with `xcrun devicectl device install app` |
| Release | staging `202610020712`, the same code rebuilt, 1072 files, signed with token B, `seal` and `verify` passed, `verify-live` (both client profiles) `1074 objects match` before `latest.json` |
| Production | untouched (`production/latest.json` stayed `202610011706`) |

What the owner saw in Settings, "Web bundle":

1. Before `latest.json` changed: `202610020000`, "The app code this device is running".
2. After a full close and reopen: `202610020000`, "An update is staged and applies after
   you fully close and reopen the app".
3. After a second full close and reopen: **`202610020712`**.

**What this proves and what it does not.** Real hardware ran the whole flow on the
staging channel: the update check, download, signature check against the pinned keys,
per-file hashes, staging and the swap on a cold start. It was a **development-signed**
build, so it says nothing new about the App Store binary; that build's update check is
covered only by the 06:26 host log above.

**Traps from this run:**

- **A development build replaces the App Store app.** Debug and Release share the app ID
  `com.veyrnox.app`, so installing from Xcode overwrites the store install, and the
  wallet's Keychain items (including the hardware KEK) may not be readable afterwards.
  Use a phone with no real funds, or one whose seed is backed up. To go back, delete the
  app and reinstall it from the App Store.
- **A staging device build needs `.env.staging.local`.** The tracked `.env.staging` has
  no `VITE_EDGE_BASE`, so on a phone every `/api/*` call fails closed: market news, for
  one, does not load. This run built from a clean checkout on purpose and lost those
  features; it did not affect the update, which only talks to `updates.veyrnox.com`.
- **Uploading 1072 files with `xargs -P 8` took over 20 minutes** for a quarter of them,
  because every file starts a new `npx wrangler` (13–25 s each). `-P 24` finished the
  rest in about 15 minutes. `verify-live` is what proves the upload complete, whatever
  the concurrency.


## ARMED for 1.0.2 (2026-09-19, owner decision — reverses the #2627 disarm)

Both keys are pinned again. OTA is live for installs built from 1.0.2 onward.

**Why the reversal.** The goal is to stop shipping an App Store submission for
every JS-level fix. That works — but only from 1.0.2 forward, and the reasons
are worth writing down because they bound what OTA can be used for:

- **Every install in the field has an empty key list.** App Store 1.0.1 build 59
  and Play versionCode 49 were built before #2612 pinned the keys, so `enabled`
  is false on all of them and they will never accept an OTA bundle. 1.0.2 is the
  carrier release that arms the mechanism; that submission is unavoidable.
- **Native code never ships over the air.** 1.0.2's Theft Protection step-up,
  referral universal links and the OTA loader itself are Swift and Kotlin.
- **Apple Guideline 2.5.2 / DPLA 3.3.1(B).** Downloaded code must not add or
  change features. OTA is for bug and security fixes; features go through
  review. 1.0.2 is feature-bearing, so it needs review regardless.

### Prerequisite 1 — privacy disclosure: DONE

`src/pages/TermsLegal.jsx` gains privacy section 12, "Security Update Checks",
disclosing: that the check runs on every cold start before unlock; that it sends
no identifier, wallet data, address or session information; that the server
nonetheless sees the request's IP and time; that it is **not optional** and runs
in decoy and demo sessions identically, with the reason stated rather than
glossed; and what the device verifies before accepting a bundle. Sections 0 and
11 were amended so neither reads as contradicting it — §11's "those sessions make
no calls of this kind whatsoever" now points at §12 explicitly.

Still to do: mirror this onto veyrnox.com/privacy. The site source is not in this
repo — see `docs/veyrnox-com-privacy-corrections-2026-07-26.md` for the standing
problem of finding its CMS.

### Prerequisite 2 — I3 ruling: STILL OPEN

Arming went ahead on the owner's decision without this. Recording it as open
rather than treating the decision to arm as having answered it, because it was
not put that way.

I3 reads "deniability mode makes zero backend calls". The check runs once per
cold start, **before unlock**, byte-identical in real, decoy and demo sessions.

- **Against a violation:** the call precedes session selection and cannot differ
  by session, so it leaks nothing about which session is open. The coercion
  property I3 exists to protect is intact.
- **For a violation:** the wording is absolute, and an absolute is load-bearing
  precisely because it is cheap to check. Once it reads "zero backend calls
  except the ones we decided were fine", it stops being greppable and rots.
- **I2 is separate and was the binding one.** The check shows the updates host
  every install's IP and launch cadence, and I2 ("no silent data egress") has no
  session-type carve-out. That is why the disclosure above was required
  regardless of how I3 is read, and why it is done while this stays open.

Suggested ruling: restate I3 as what it actually protects — no egress that
differs by session type, and none after a session is chosen — naming this
pre-unlock check as the single explicit exception. Better than either declaring
no conflict or leaving an absolute the code contradicts.

---

OTA stays **inert on every install already out there**, and now on 1.0.2 as
well. It only becomes live for installs from a store release built with a
non-empty key list, and nothing has been published to `updates.veyrnox.com`.

Ships fixes to the web bundle (`dist/`) without a store submission. Native code
(Swift, Kotlin, Capacitor plugins) still ships only through the stores.

## Why this is dangerous, and what stops it

The web bundle *is* the wallet: derivation, signing, the RASP gates and the KEK
flow all run as JS. An OTA bundle can therefore execute code on every install,
without Apple or Google review. The design keeps the update host and CI
**untrusted**. Only the offline signing key can ship code.

| Guarantee | Where |
|---|---|
| The manifest carries an ECDSA P-256 signature from an **offline** key held on a hardware token. The public half of every token's key is compiled into the store binary, and a signature from any one of them is accepted. An OTA bundle cannot change the pinned keys. | `OtaConfig` in `VeyrnoxOta.swift` / `OtaBundleVerifier.kt` |
| Every file matches its sha256, and **no extra files** are allowed. This is re-checked natively on **every cold start**, not just at download. | `verifyFiles` |
| Versions only move forward. A replayed older (validly signed) bundle is refused. | `canAccept`, `floor` |
| A bundle that boots but never reports ready is rolled back, and that version is never accepted again. | `resolveLaunch`, `OtaBootSignal` in `main.jsx` |
| A bundle that needs newer native code (`minNativeApi`) is refused. So is one from the other channel. | `readVerifiedManifest` |
| A store update newer than the OTA bundle wins, and the OTA bundle is deleted. | `resolveLaunch` |
| An empty pinned key list, or a missing embedded manifest, disables OTA completely (I4). | `resolveLaunchDir` |
| Capacitor's own `serverBasePath` persistence loads code **with no verification**. It is switched off with `DisableDeploy` in `capacitor.config.json`, and also cleared on every Activity/VC creation, including warm relaunches. This closes a pre-existing path where XSS could persist code across restarts. | `capacitor.config.json`, `resolveLaunchDir` |
| A bundle built with `VITE_BYPASS_RASP`, `VITE_DEV_UNGATE_SEND` or `VITE_DEMO_MODE` set to `1` is refused at release time. The check reads the build's recorded flag values (`ota-build-flags.json`), because obfuscated store builds hide the inlined string. | `scripts/ota/release.mjs` |

### What it does NOT guarantee (read before enabling)

- **Key compromise means every wallet is exposed.** The whole design rests on the
  offline keys. Each lives on its own YubiKey and cannot be extracted; keep the two
  tokens in separate places. Never put a signing key in CI, GitHub Secrets,
  Cloudflare or a laptop keychain. **Any pinned key can ship code**, so a stolen
  token is as dangerous as a stolen key: if one goes missing, treat it as
  compromised, drop it from the list and ship a store release.
- **Freeze attacks.** Whoever controls the host or network can withhold updates. They
  cannot downgrade, but they can keep a user on the current bundle. `latest.json`
  is unsigned by design, since every accepted version is signed.
- **Forced move to an old, vulnerable bundle.** Every signed bundle stays valid
  forever, and `latest.json` is unsigned. So an attacker controlling the host or
  network can point a device at *any* signed version newer than what the device
  already has. For example: a fresh install of an older store binary gets pushed
  bundle V1, which was fixed in V2. The downgrade guard only protects devices that
  already have V2. Planned mitigation, not built: a signed, expiring
  `latest.json`, or a minimum version compiled into each store binary. Until then,
  a release that fixes a **security** bug should also ship a store binary.
- **One interrupted first boot blocks a good bundle.** If the app is killed
  (by the user or the OS) before the new bundle's first render, that version is
  treated as failed and never retried. Ship a newer version to recover.
- **Version order is build time, not code order.** A store binary built *later*
  from an *older* commit (for example a resubmission) outranks, and deletes, a newer
  OTA fix. Before a store build, check it contains every OTA fix already shipped.
- **Staging and production share the same keys**; only the signed `channel` differs.
  Every staging release therefore needs a token in hand. Don't let that convenience
  pull a key online. Use a separate staging token if staging releases are frequent.
- **Cloudflare can rewrite a file in transit, and the device then refuses the
  bundle.** Found on 2026-10-01: Email Address Obfuscation rewrites any `text/html`
  response that contains an email address. It replaced `support@veyrnox.com` in
  `veyrnox-docs.html` with a `[email protected]` stub and appended a script, 230 bytes
  larger, so its sha256 no longer matched. The loader checks every file's sha256, so
  one rewritten file fails the whole update closed. Nothing unsafe happens, but the
  release never installs. Two fixes, either is enough: upload everything as
  `application/octet-stream` (done above, and it needs no zone change), or add a
  Cloudflare configuration rule for `updates.veyrnox.com` that turns off Email Address
  Obfuscation and any other response rewriting. The configuration rule has not been
  made; the zone is untouched. The "Verify the live copy" step is what catches this.
- **Attestation does not cover OTA code.** App Attest and Play Integrity attest the
  store binary, not JS loaded afterwards.
- **"Ready" is a first-render heuristic.** A bundle that renders but breaks later
  (for example unlock) gets promoted. The fix is a newer bundle, not a rollback.
- **Rooted or jailbroken devices** with write access to app storage can reset the
  version floor. That is already outside the RASP threat model.
- **I3 and I2.** The update check runs once per cold start, **before unlock**, and
  behaves identically in real, decoy and demo sessions, so it reveals nothing about
  which session is open. It is still a network request that shows the updates host
  the device IP and that the app launched. **This needs owner sign-off against
  I3's "zero backend calls" wording, and a privacy-policy disclosure, before a key
  is provisioned.**
- **Apple Guideline 2.5.2 / DPLA 3.3.1(B).** Downloaded code must not add or change
  features. Use OTA for **bug and security fixes**. New features go through review.
  Play allows JS updates that run in a WebView.

## One-time setup

1. **Generate one key per YubiKey — the key never leaves the token.** Do this on a
   machine that is offline, and repeat it on the second token so each has its own key.
   Install the tools first (`brew install ykman yubico-piv-tool opensc`), then, with
   one token plugged in:

   ```bash
   ykman piv access change-pin && ykman piv access change-puk && ykman piv access change-management-key --generate --protect
   ```

   That replaces the factory PIN (`123456`), PUK (`12345678`) and management key.

   **Save the PIN and PUK before the next command, not after.** One password-manager
   entry per token, named `Veyrnox OTA token A` / `Veyrnox OTA token B`, holding the
   serial, the PIN **and** the PUK. Give each token its own PIN. A PIN is 6 to 8
   characters (letters and digits are allowed; 8 is the hard maximum), and so is the
   PUK. The prompts do not echo, so a typo here is silent: prove the saved value
   works by signing a test bundle (see "Releasing a fix") before you pin anything.
   The management key is stored on the token and guarded by the PIN, so there is
   nothing to save for it.

   ```bash
   ykman piv keys generate --algorithm eccp256 --pin-policy once --touch-policy always 9c pubkey-token-a.pem
   ```

   The private key is generated **inside** the token and cannot be exported, which is
   the point. `--touch-policy ALWAYS` means every signature needs a physical tap, so
   malware on the signing machine cannot sign silently.

   ```bash
   ykman piv certificates generate --subject "CN=Veyrnox OTA token A" 9c pubkey-token-a.pem
   ```

   PIV needs a certificate in the slot alongside the key; this self-signed one is
   never verified by the app, which pins the raw public key.

   ```bash
   openssl ec -pubin -in pubkey-token-a.pem -pubout -outform DER | base64
   ```

   That prints the SPKI base64 to pin. Repeat everything for token B
   (`pubkey-token-b.pem`, `CN=Veyrnox OTA token B`).

   **Losing a token is recoverable, losing both is not.** With both keys pinned, a
   lost token costs nothing: keep signing with the other and drop the lost key in the
   next store release. If both are lost, OTA stops until a store release pins new
   keys. Neither case ever risks funds.

   ### If a PIN is lost

   Each token allows **3 wrong PIN tries**, then the PIN is blocked, and the PUK has
   its own 3. Read the counters first. This costs no try:

   ```bash
   ykman piv info | head -3
   ```

   - **Do not keep guessing.** A wrong PIN is spent for good until a correct one
     resets the counter. On 2026-10-01 a lost PIN took token B to one try left.
   - **PIN blocked, PUK known:** `ykman piv access unblock-pin` keeps the key.
   - **PIN and PUK both unknown:** the only way back in is `ykman piv reset`, which
     refuses to run until both are blocked and then **wipes the slot 9c key**. The
     pinned public key then matches nothing on that token. Existing installs can
     only be given a replacement key by a store release.
   - Resetting one token while the other still signs is cheap; resetting both stops
     OTA until a store release pins new keys. A reset does not touch FIDO2, OTP or
     passkeys on the token.
2. **Pin both public keys.** Put them into `OtaConfig.publicKeysSpkiB64` (iOS) and
   `OtaConfig.PUBLIC_KEYS_SPKI_B64` (Android), same keys in the same order;
   `ota-manifest.test.js` fails if the two lists differ. Before the store release,
   prove the pasted keys are right: prepare any bundle, sign it with **each** token
   in turn, and run `release.mjs verify <releaseDir>` with no key argument after
   each — it reads the pinned keys from source and passes if any matches. A typo
   only disables that key (fail closed), but you would not find out until a release.
3. **Hosting.** Create an R2 bucket with public read, served at
   `https://updates.veyrnox.com` (already in CSP `connect-src`). Give `latest.json`
   `Cache-Control: no-cache`. Everything else is immutable. Cloudflare must not
   rewrite what this host serves; see the email-obfuscation note under "What it does
   NOT guarantee".
4. **Ship a store release** that carries the key. Installs on older binaries never
   take OTA updates.

## Releasing a fix

Build from the exact commit being shipped. Store builds and OTA bundles share a
version space: `bundleVersion` is the UTC build time (`yyyyMMddHHmm`), or
`OTA_BUNDLE_VERSION` if set.

```bash
npm run build
```

Use `npm run build:staging` for the staging channel.

```bash
node scripts/ota/release.mjs prepare dist ota-release
```

This refuses the release if `dist` changed after the build or if it carries a dev
flag. It writes `ota-release/<channel>/<version>/…` and
`ota-release/<channel>/latest.json`.

**Sign with a YubiKey.** Plug in either token; both are equally valid. Neither
`ykman` nor `yubico-piv-tool` can sign arbitrary data, so signing goes through
PKCS#11. The token asks for your PIN and a physical tap:

```bash
pkcs11-tool --module /opt/homebrew/lib/libykcs11.dylib --login --sign --mechanism ECDSA-SHA256 --id 02 --input-file ota-release/production/<version>/ota-manifest.json --output-file /tmp/ota-manifest.rawsig
```

`--id 02` is PIV slot 9c. Check the id on your token with
`pkcs11-tool --module /opt/homebrew/lib/libykcs11.dylib --list-objects --type privkey`.

**`--login` is required** with the current OpenSC (0.27.1). Without it the PIN is
accepted and the sign step then fails with
`C_SignFinal failed: rv = CKR_USER_NOT_LOGGED_IN`, which looks like a bad PIN or a
missed touch and is neither. The PIN counter stays at 3 of 3 in that case, which is
how to tell. Tap the token as soon as its light flashes; an unanswered touch times
out after about 15 seconds. Each token has its own PIN, and the prompt does not echo.

Store the signature with `seal`. PKCS#11 emits a raw signature while the app
verifies DER, so this converts it and refuses to write anything that does not
verify under a pinned key — which is also what proves the signature and the pinned
keys agree:

```bash
node scripts/ota/release.mjs seal ota-release/production/<version> /tmp/ota-manifest.rawsig
```

`seal` already verified it. Run `verify` too if you want the check on its own, for
example on a signature someone handed you:

```bash
node scripts/ota/release.mjs verify ota-release/production/<version>
```

**Upload in this order: files first, then the manifest and signature, then
`latest.json` last.** Clients never see a pointer to a partial release.

Upload every object as `application/octet-stream`, **not** by file type. The native
loader reads raw bytes and ignores the content type, and Cloudflare only rewrites
`text/html` (see "What it does NOT guarantee"). `rclone` was not installed for the
2026-10-01 canary, so this is the `wrangler` route that was actually used. It needs
a Cloudflare login with R2 write access (`npx wrangler whoami` shows it):

```bash
cd ota-release/<channel>/<version> && find files -type f -print0 | xargs -0 -P 8 -I{} npx wrangler r2 object put "veyrnox-updates/<channel>/<version>/{}" --file "{}" --content-type application/octet-stream --remote
```

```bash
npx wrangler r2 object put veyrnox-updates/<channel>/<version>/ota-manifest.json --file ota-release/<channel>/<version>/ota-manifest.json --content-type application/octet-stream --remote
```

```bash
npx wrangler r2 object put veyrnox-updates/<channel>/<version>/ota-manifest.sig --file ota-release/<channel>/<version>/ota-manifest.sig --content-type application/octet-stream --remote
```

Run all of these from the repo root. The first block changes into the release
directory inside its own command, so it leaves your shell where it was.

**Verify the live copy before you upload `latest.json`.** A mismatch means the device
will refuse the whole bundle, so find it now:

```bash
node scripts/ota/verify-live.mjs ota-release/<channel>/<version>
```

It fetches every object back from the public host and compares it with what was
signed: the live `ota-manifest.json` and `ota-manifest.sig` must be byte-identical to
your local, sealed copies, and every file in the manifest must hash to its manifest
sha256. It requests the exact URLs a device does (`<base>/<channel>/<version>/files/<path>`,
raw path, `cache: 'no-store'`), with the channel and version taken from the manifest
itself, so it cannot check the wrong release. Each object is fetched twice: once with
a plain request (what iOS and `fetch` send) and once with Android's `Accept: text/html,
…` and a Dalvik user agent. Cloudflare rewrites a `text/html` response only for the
second kind, which is how an injected analytics script reached Android alone (see
"Android: the `.well-known` asset bug"). The base URL defaults to
`https://updates.veyrnox.com`; pass another as a second argument. Plain `http` is
refused except to `localhost`.

- **Pass:** exit 0 and `live copy OK: <n> objects match the signed manifest — safe to
  upload latest.json`.
- **Fail:** exit 1, `do NOT upload latest.json`, and each failing path with its reason
  (`hash mismatch`, `http 404`, `unreachable`). A hash mismatch also shows the live and
  local byte counts: a live copy a few bytes larger than local is a host rewriting the
  file, which is how the Cloudflare email-obfuscation problem showed up. Fix it by
  re-uploading the file (as `application/octet-stream`) or by finding what rewrote it,
  then run the check again.
- Network errors and 5xx answers are retried twice; a 4xx is final.
- **It checks the files, the manifest and the signature, not the pointer.** After
  go-live, `latest.json` is still checked with the `curl` below.

It was run against the 2026-10-01 staging canary on the live host: 1073 objects, all
matching (the 1071 files plus the manifest and the signature).

Only then publish the pointer, with the no-cache header the hosting step calls for:

```bash
npx wrangler r2 object put veyrnox-updates/<channel>/latest.json --file ota-release/<channel>/latest.json --content-type application/json --cache-control no-cache --remote
```

Confirm it with `curl -sI https://updates.veyrnox.com/<channel>/latest.json`, which
should show `cache-control: no-cache`. `rclone copy` to the same keys also works if
it is installed; the order and the content-type rule still apply.

Devices download the update on their next cold start and boot it on the cold start
after that. Only files whose sha256 is not already on the device are downloaded.

## Rolling back

Downgrades are refused by design, so **rolling back means publishing a newer
version** built from the good commit. There is no remote kill switch. Adding one
would give the update host control the design deliberately withholds.

## Needs a store release instead

- Any Swift, Kotlin, Capacitor plugin or native dependency change.
- A web change that calls native code older binaries lack. Bump `NATIVE_API` in
  `scripts/ota/manifest.mjs` and both native `OtaConfig`s together.
- Anything Apple would consider a new or changed feature.
