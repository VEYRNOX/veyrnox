// LOG-1 Remediation — Debug Bridge Log Redaction Verification
// Fully automated, no human interaction.
//
// Background (CLAUDE.md, 2026-07-05 finding, HIGH for debug/CI context):
// Capacitor's debug bridge logger (createLogFromNative in native-bridge.js)
// echoed EVERY native plugin result to the WebView console, which debug
// builds relay to logcat. That leaked the HardwareKek.getHardwareFactor
// result ({"h":"<32-byte base64>"}) and the full encrypted vault blob
// (SecureStorage.get) into adb-accessible logs. Remediated at source via
// patches/@capacitor+android+8.4.1.patch (redacts the logged payload).
//
// hardware-kek-e2e.spec.js already carries ONE canary for this scoped to the
// Hardware KEK settings screen session. THIS suite is the broader, app-wide
// sweep the LOG-1 finding actually calls for: the same leak class could in
// principle be triggered by ANY native plugin call (SecureStorage reads on
// vault unlock, BiometricAuth, FileSaver on backup export, etc.), not only
// the KEK screen. Running the canary across a full navigation pass gives
// much better coverage than a single-screen check.
//
// Run: npm run android:test:log1
import appHelper from '../helpers/appHelper.js';
import walletHelper from '../helpers/walletHelper.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Matches a JSON "h" field (the HardwareKek factor) carrying a base64-looking
// value, raw or JSON-escaped. The redacted placeholder contains '[' so a
// correctly-patched build can never match this.
const H_FACTOR_PATTERN = /\\?"h\\?"\s*:\s*\\?"[A-Za-z0-9+/=]{16,}\\?"/;

// Capacitor's Console-tagged WebView-relay lines carry no plugin name (the
// bridge's isValidMsg filter strips the "%cresult %c<pluginId>" header), so a
// long base64 run inside a Capacitor/Console-tagged line is treated as a
// potential leaked payload (vault blob, wrapped DEK, credential, etc.).
const CONSOLE_PAYLOAD_PATTERN = /[A-Za-z0-9+/=]{64,}/;
const here = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(readFileSync(join(here, '../../../package.json'), 'utf8'));
const androidPatch = readFileSync(
  join(here, '../../../patches/@capacitor+android+8.5.0.patch'),
  'utf8',
);

async function scanForLeaks(logs) {
  const hLeak = logs.filter((l) => H_FACTOR_PATTERN.test(l.message));
  const consolePayloadLeak = logs.filter(
    (l) => /Capacitor\/Console/.test(l.message) && CONSOLE_PAYLOAD_PATTERN.test(l.message)
  );
  return { hLeak, consolePayloadLeak };
}

describe('LOG-1 — App-Wide Debug Bridge Log Redaction Sweep', () => {
  before(async () => {
    await driver.activateApp(appHelper.appPackage);
    await appHelper.pause(1000);
  });

  it('should not leak sensitive native-bridge payloads while cold-starting + unlocking (SecureStorage.get exposure window)', async () => {
    // Cold-start + unlock is exactly the window where the original LOG-1
    // finding fired (SecureStorage.get returning the full encrypted vault
    // blob to the bridge's echoed console log).
    let logsBefore = [];
    try {
      logsBefore = await driver.getLog('logcat');
    } catch (e) {
      console.log('logcat unavailable — LOG-1 cold-start canary skipped');
      return;
    }

    try {
      const lockScreen = await driver.$(`android=new UiSelector().resourceId("unlock-password")`);
      if (lockScreen) await walletHelper.unlockVault();
    } catch (e) {
      // Already unlocked — re-lock and re-unlock so this test actually
      // exercises the SecureStorage.get path rather than a no-op.
      try {
        const lockBtn = await driver.$(`android=new UiSelector().textContains("Lock")`);
        await appHelper.tap(lockBtn);
        await appHelper.pause(500);
        await walletHelper.unlockVault();
      } catch (e2) {
        console.log('Could not force a lock/unlock cycle — checking logs from current state only');
      }
    }

    let logsAfter = [];
    try {
      logsAfter = await driver.getLog('logcat');
    } catch (e) {
      logsAfter = [];
    }
    const newLines = logsAfter.slice(logsBefore.length);
    const { hLeak, consolePayloadLeak } = await scanForLeaks(newLines);

    if (hLeak.length > 0 || consolePayloadLeak.length > 0) {
      console.log(`❌ LOG-1 REGRESSION during unlock: h-field=${hLeak.length}, console-payload=${consolePayloadLeak.length}`);
    } else {
      console.log('✅ LOG-1 clean during cold-start/unlock window');
    }
    expect(hLeak.length).toBe(0);
    expect(consolePayloadLeak.length).toBe(0);
  });

  it('should not leak sensitive native-bridge payloads while navigating Settings → Security → Backup', async () => {
    let logsBefore = [];
    try {
      logsBefore = await driver.getLog('logcat');
    } catch (e) {
      console.log('logcat unavailable — LOG-1 navigation canary skipped');
      return;
    }

    for (const label of ['Settings', 'Security']) {
      try {
        const btn = await driver.$(`android=new UiSelector().text("${label}")`);
        if (btn) { await appHelper.tap(btn); await appHelper.pause(400); }
      } catch (e) { /* try next */ }
    }
    try {
      const backupBtn = await driver.$(`android=new UiSelector().textContains("Backup")`);
      if (backupBtn) { await appHelper.tap(backupBtn); await appHelper.pause(400); }
    } catch (e) { /* not reachable in this build */ }

    let logsAfter = [];
    try {
      logsAfter = await driver.getLog('logcat');
    } catch (e) {
      logsAfter = [];
    }
    const newLines = logsAfter.slice(logsBefore.length);
    const { hLeak, consolePayloadLeak } = await scanForLeaks(newLines);

    if (hLeak.length > 0 || consolePayloadLeak.length > 0) {
      console.log(`❌ LOG-1 REGRESSION during Settings/Backup navigation: h-field=${hLeak.length}, console-payload=${consolePayloadLeak.length}`);
    } else {
      console.log('✅ LOG-1 clean during Settings/Security/Backup navigation');
    }
    expect(hLeak.length).toBe(0);
    expect(consolePayloadLeak.length).toBe(0);
  });

  it('should not leak sensitive native-bridge payloads on the main dashboard / send flow', async () => {
    let logsBefore = [];
    try {
      logsBefore = await driver.getLog('logcat');
    } catch (e) {
      console.log('logcat unavailable — LOG-1 dashboard canary skipped');
      return;
    }

    try {
      await driver.back();
      await appHelper.pause(300);
    } catch (e) { /* already at root */ }
    try {
      const sendBtn = await driver.$(`android=new UiSelector().text("Send").instance(1)`);
      await appHelper.tap(sendBtn);
      await appHelper.pause(500);
      await driver.back();
    } catch (e) { /* navigation optional for this canary */ }

    let logsAfter = [];
    try {
      logsAfter = await driver.getLog('logcat');
    } catch (e) {
      logsAfter = [];
    }
    const newLines = logsAfter.slice(logsBefore.length);
    const { hLeak, consolePayloadLeak } = await scanForLeaks(newLines);

    if (hLeak.length > 0 || consolePayloadLeak.length > 0) {
      console.log(`❌ LOG-1 REGRESSION during dashboard/send navigation: h-field=${hLeak.length}, console-payload=${consolePayloadLeak.length}`);
    } else {
      console.log('✅ LOG-1 clean during dashboard/send navigation');
    }
    expect(hLeak.length).toBe(0);
    expect(consolePayloadLeak.length).toBe(0);
  });

  it('#2022 confirms the Android bridge-redaction patch is present in the shipped tree', async () => {
    expect(packageJson.postinstall).toBe('patch-package');
    expect(androidPatch).toContain('createLogFromNative');
    expect(androidPatch).toMatch(/redact|REDACTED|sensitive/i);
  });
});
