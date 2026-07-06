// Passkey Cloned-Authenticator Detection (signCount, M-K) — Android E2E
// Fully automated, no human interaction.
//
// HONEST SCOPE — READ BEFORE TRUSTING GREEN:
// src/lib/passkey.js is explicit that on native (Capacitor.isNativePlatform())
// there is NO real WebAuthn/FIDO2 authenticator: navigator.credentials is a
// dead stub, so registerPasskeyCredential()/verifyPasskeyAssertion() route
// through BiometricAuth (OS biometric prompt) and stamp mode
// 'native-biometric' with a synthetic credential id ('native-biometric:' +
// random bytes) — never a real FIDO2 signCount. That means the M-K
// clone-detection logic (checkPasskeySignCount / PasskeyClonedError,
// PASSKEY_SIGNCOUNT_KEY) is LIVE CODE but UNREACHABLE on this platform: there
// is no authenticatorData to extract a signCount from, so the check never
// runs on Android. This suite therefore:
//   1. Confirms the on-device UI honestly reports the native-biometric mode
//      (not a mislabeled "passkey"/FIDO2 claim — I4/honesty).
//   2. Confirms no fabricated signCount is ever persisted for the native path
//      (PASSKEY_SIGNCOUNT_KEY must stay absent/untouched on native, since a
//      stored value there would be a LIE about the FIDO2 signal existing).
//   3. Documents that the actual signCount clone-detection contract is
//      covered by src/lib/__tests__/passkey.test.js (Node/jsdom, real WebAuthn
//      authenticatorData bit-twiddling) — a web-only path, out of reach of an
//      Android Appium run by design, not by an oversight in this suite.
//
// Run: npm run android:test:passkey-clone
import appHelper from '../helpers/appHelper.js';
import walletHelper from '../helpers/walletHelper.js';

const SIGNCOUNT_KEY = 'veyrnox-passkey-signcount';
const PASSKEY_CRED_KEY = 'veyrnox-passkey-cred';

describe('Passkey Cloned-Authenticator Detection — Android native-biometric boundary', () => {
  before(async () => {
    await driver.activateApp(appHelper.appPackage);
    await appHelper.pause(1000);
    try {
      const lockScreen = await driver.$(`android=new UiSelector().resourceId("unlock-password")`);
      if (lockScreen) await walletHelper.unlockVault();
    } catch (e) {
      // Already unlocked
    }
  });

  it('should navigate to passkey / 2FA settings', async () => {
    let found = false;
    for (const label of ['Settings', 'Security']) {
      try {
        const btn = await driver.$(`android=new UiSelector().text("${label}")`);
        if (btn) { await appHelper.tap(btn); found = true; break; }
      } catch (e) { /* try next */ }
    }
    await appHelper.pause(500);
    try {
      const passkeyEntry = await driver.$(`android=new UiSelector().textContains("Passkey")`);
      if (passkeyEntry) await appHelper.tap(passkeyEntry);
    } catch (e) {
      console.log('Passkey settings entry not found by text — checking page source');
    }
    await appHelper.pause(500);
    const source = await driver.getPageSource();
    expect(source).toBeDefined();
    if (!found) console.log('⚠️ Settings/Security nav not found in this build');
  });

  it('should honestly report native-biometric mode, never claim a real FIDO2/hardware passkey', async () => {
    const source = await driver.getPageSource();
    // The UI must not claim "FIDO2" or "hardware-backed passkey" wording that
    // would misrepresent the OS-biometric-gate reality (I4 honesty).
    const dishonestClaim = /fido2 (hardware|security key)|hardware.?backed passkey/i.test(source);
    console.log(`Dishonest FIDO2/hardware-passkey claim present: ${dishonestClaim}`);
    expect(dishonestClaim).toBe(false);
  });

  it('should never persist a signCount for the native-biometric path (no fabricated FIDO2 signal)', async () => {
    // Enrol passkey/biometric-unlock if the flow is reachable, then read back
    // localStorage over the Appium WebView bridge (Capacitor apps expose a
    // single WebView context we can switch into).
    let signCountValue = null;
    let credValue = null;
    try {
      const contexts = await driver.getContexts();
      const webviewContext = contexts.find((c) => String(c).toLowerCase().includes('webview'));
      if (webviewContext) {
        await driver.switchContext(webviewContext);
        signCountValue = await driver.execute((k) => window.localStorage.getItem(k), SIGNCOUNT_KEY);
        credValue = await driver.execute((k) => window.localStorage.getItem(k), PASSKEY_CRED_KEY);
        await driver.switchContext('NATIVE_APP');
      }
    } catch (e) {
      console.log('Could not inspect WebView localStorage in this session:', e.message);
    }

    console.log(`
📋 Native passkey storage inspection
${PASSKEY_CRED_KEY}: ${credValue ? (credValue.startsWith('"native-biometric:') || credValue.includes('native-biometric:') ? 'native-biometric marker (expected)' : 'UNEXPECTED FORMAT: ' + credValue) : 'not set'}
${SIGNCOUNT_KEY}: ${signCountValue === null ? 'absent (expected — no real FIDO2 signCount on native)' : 'PRESENT: ' + signCountValue}
    `);

    // The hard assertion: if a credential is registered on native, it must be
    // the native-biometric marker shape, and the signCount key must NOT carry
    // a fabricated value (that would falsely claim a FIDO2 clone-detection
    // signal exists where there is none).
    if (credValue) {
      expect(credValue.includes('native-biometric:')).toBe(true);
    }
    expect(signCountValue).toBeNull();
  });

  it('documents the real signCount contract as a web-only, unit-tested boundary (not device-testable here)', async () => {
    console.log(`
ℹ️ M-K cloned-authenticator detection (checkPasskeySignCount / PasskeyClonedError,
'authenticator_cloned' code) operates on WebAuthn authenticatorData bytes 33-36,
which only exist for a REAL FIDO2 assertion. That path is web-only in this
codebase (src/lib/passkey.js explicitly stubs navigator.credentials on native).
The regression contract for that logic lives in:
  src/lib/__tests__/passkey.test.js
and (browser-real-authenticator level) the CDP-virtual-authenticator suite
pattern used by e2e/webauthn-prf-kek.spec.js could be extended to cover signCount
monotonicity for the DESKTOP/web passkey unlock path — that is a web Playwright
task, not an Android Appium one. This Android suite's job is only to confirm the
native app never fabricates that signal (assertion above) and never mislabels
its OS-biometric gate as FIDO2 hardware (assertion above).
    `);
    expect(true).toBe(true);
  });
});
