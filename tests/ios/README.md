# Veyrnox iOS Automated Testing

Automated E2E suite for the Veyrnox wallet iOS app using **Appium** (XCUITest) and
**WebdriverIO** — the iOS counterpart of [`tests/android/`](../android/README.md).

> **Status: SCAFFOLD (BUILT, not device-run).** These specs are written and wired but
> have **never been executed on a device** from this repo — iOS device automation
> requires macOS + Xcode + a real iPhone, none of which are available on the Windows dev
> machine (see `CLAUDE.md` → Environment). Nothing here is "verified." Every gate below is
> closed only by a real device run + (for sends) an owner-supplied on-chain txid.

## Why this can't run on Windows or a simulator

- **macOS + Xcode required.** Appium's XCUITest driver builds and code-signs
  WebDriverAgent through Xcode. There is no Windows/Linux path.
- **Real iPhone required.** The iOS Simulator has **no Secure Enclave**, so every
  Hardware KEK / SE / Face ID spec is meaningless on a simulator.
- **iOS 26 NSLog caveat.** The app's own `NSLog` lines are **not** streamable via Appium's
  `syslog` buffer on iOS 26 (project memory
  `ios26-nslog-not-capturable-se-daemon-evidence.md`). The authoritative SE-unlock trace
  (iOS-F9) must be captured on the Mac with `log stream` — the KEK spec prints the exact
  command.

## Prerequisites

- macOS with Xcode + command-line tools
- Node.js v24+, Appium 3.x, WebdriverIO (already a devDependency)
- Appium XCUITest driver: `appium driver install xcuitest`
- A real, USB-attached, developer-provisioned iPhone
- For H-2/iOS-F11: an iPhone whose **Face ID enrollment is NOT restricted** (the test
  iPhone 17 Pro Max is restricted and cannot run the re-enroll test)

## Configuration

Local Appium only (BrowserStack removed 2026-07-08 — LOG-1 H exposure risk):

| File | Target | Entry |
|---|---|---|
| `wdio.conf.js` | Local Mac + real iPhone via local Appium | `npm run ios:test*` |

### Local run env vars (`wdio.conf.js`)

| Var | Required | Default | Notes |
|---|---|---|---|
| `IOS_UDID` | ✅ | — | `xcrun xctrace list devices` |
| `IOS_TEAM_ID` | ✅ | — | Apple Developer Team ID (signs WebDriverAgent) |
| `IOS_APP_PATH` | — | (reuse installed) | Path to a built `.app`/`.ipa` to install |
| `IOS_PLATFORM_VER` | — | `18.0` | iOS version string |
| `VEYRNOX_IOS_BUNDLE_ID` | — | `com.veyrnox.app` | Override if the debug scheme suffixes the id |

## Running

```bash
# Terminal 1 — Appium (local)
appium

# Terminal 2 — with device env set
IOS_UDID=<udid> IOS_TEAM_ID=<team> npm run ios:test:vault
IOS_UDID=<udid> IOS_TEAM_ID=<team> npm run ios:test:hardware-kek
```

Supervised specs (real send, KEK-gated send, re-enroll assertions) are **gated behind
env flags** so they never run unattended:

- `SUPERVISED_SEND=1` — arm the real on-chain send in `send.spec.js` / `hardware-kek-e2e.spec.js`
  (mirrors the repo's `RUN_SUPERVISED_E2E` discipline for funded, human-in-the-loop sends)
- `REENROLL_DONE=1` — assert the fail-closed + PIN-recovery half of the re-enroll test
  after you've done the manual Settings re-enrollment

## Test suites and the gates they drive

| Spec | npm script | Open gate (docs/hardware-audit-handoff.md) |
|---|---|---|
| `vault.spec.js` | `ios:test:vault` | Baseline: create/unlock/persistence, ≥12-char min (H-A) |
| `send.spec.js` | `ios:test:send` | iOS in-app UI send has **no txid yet** (Android has one) |
| `hardware-kek-e2e.spec.js` | `ios:test:hardware-kek` | **iOS-F9** SE-unlock `os_log` trace + PARTIAL→full promotion; SE leak canary |
| `biometric-reenroll-e2e.spec.js` | `ios:test:biometric-reenroll` | **H-2/iOS-F11** Face ID re-enroll invalidation (needs unrestricted iPhone) |

### What these specs can and cannot do

- **Can:** drive the WKWebView UI (create/unlock/send/settings), read the tier badge,
  assert fail-closed behaviour and PIN recovery, run a leak canary over Appium-reachable
  logs, and print the exact Mac-side `log stream` command.
- **Cannot (needs a human/Mac):** approve the native Face ID sheet, re-enroll Face ID in
  iOS Settings, or capture the app's own `os_log(public)` SE-unlock line (that's the Mac
  `log stream` step). These are honest limitations, not stubs — the specs assert around
  them rather than faking evidence.

## iOS-F9 capture (the promotion path)

1. Build a **DEBUG iOS build compiled with `os_log(public)`** (not `NSLog`) on the Mac.
2. In a second Mac terminal:
   ```bash
   log stream --style syslog --predicate 'process == "Veyrnox" && eventMessage CONTAINS "getHardwareFactor"'
   ```
3. `SUPERVISED_SEND=1 npm run ios:test:hardware-kek`, approve the Face ID sheet on-device.
4. Pair the `getHardwareFactor` SUCCESS line with the send's txid.
5. Owner records **both** in `docs/verified-evidence.json` → advances iOS KEK from
   device-verified **PARTIAL** to **full**.

## Still device-blocked (unchanged by this scaffold)

- **iOS-F5 / iOS-F3** — need a Mac + Xcode compile of `HardwareKekPlugin.m` (heap-zeroing
  / `LAContext`). Not a WDIO concern; verified with Instruments / device console.
- **Independent audit** — the 2026-07-01 KEK pass was INTERNAL. iOS SE KEK has never been
  independently audited.

## Adding new specs

```javascript
import appHelper from '../helpers/appHelper.js';
import walletHelper from '../helpers/walletHelper.js';

describe('My iOS Feature', () => {
  it('should do something', async () => { /* ... */ });
});
```

Then add an `ios:test:<feature>` script to `package.json`.

## References

- [`tests/android/README.md`](../android/README.md) — the sibling suite this mirrors
- [`docs/hardware-audit-handoff.md`](../../docs/hardware-audit-handoff.md) — the iOS gate list
- [Appium XCUITest](https://appium.github.io/appium-xcuitest-driver/latest/)
- [`CLAUDE.md`](../../CLAUDE.md) — Hardware KEK phase plan, verify-don't-assert rule
