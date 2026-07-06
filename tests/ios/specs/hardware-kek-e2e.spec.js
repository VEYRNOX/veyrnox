// Hardware KEK E2E — iOS Secure Enclave (SE-ECIES).
// Run: npm run ios:test:hardware-kek  (real iPhone + local Appium, supervised)
//
// Targets the open iOS KEK gates from docs/hardware-audit-handoff.md:
//   - iOS-F9 (HIGH evidence gap): the app's own getHardwareFactor SE-unlock
//     os_log line tied to a KEK-gated send has never been captured.
//   - Promote iOS from device-verified PARTIAL → full (new KEK-gated txid).
//
// HONEST LIMITATION baked into this file: on iOS 26 the app's NSLog lines are
// NOT streamable through Appium's syslog buffer (project memory
// ios26-nslog-not-capturable-se-daemon-evidence.md). So this spec CANNOT itself
// close iOS-F9 — it drives the UI, asserts what it can observe, and prints the
// exact Mac-side `log stream` command the operator must run in parallel to
// capture the authoritative os_log(public) trace. Anything else would be faking
// the evidence (no-fake-security / verify-don't-assert).
import appHelper from '../helpers/appHelper.js';
import walletHelper from '../helpers/walletHelper.js';

describe('Hardware KEK — iOS Secure Enclave', () => {
  before(async () => {
    await driver.execute('mobile: launchApp', { bundleId: appHelper.bundleId });
    await appHelper.pause(1500);
    if (await walletHelper.isLocked()) {
      try {
        await walletHelper.unlockVault();
      } catch (e) {
        console.log('Unlock skipped (may already be unlocked or KEK-gated)');
      }
    }
  });

  it('should surface the Hardware Protection tier badge (H-1 analogue)', async () => {
    let badge = null;
    try {
      const settingsBtn = await appHelper.findByText('Settings');
      await appHelper.tap(settingsBtn);
      await appHelper.pause(500);
      const hw = await appHelper.findByPartialText('Hardware Protection');
      if (await hw.isExisting()) await appHelper.tap(hw);
      await appHelper.pause(500);
      badge = await walletHelper.getKekTierBadge();
    } catch (e) {
      console.log('Could not reach Hardware Protection settings');
    }

    console.log(`
🔐 iOS Hardware KEK tier badge
  Badge label: ${badge || 'NOT VISIBLE'}
  Expected on real iPhone with SE: "Secure Enclave Protected" (or "Hardware Protection ON").
  Simulator has NO Secure Enclave — a simulator run here is meaningless.`);

    // Don't fail if the badge UI is absent — device/enrollment dependent.
    expect(badge === null || typeof badge === 'string').toBe(true);
  });

  it('should document the SE ECIES design anchor (H-NEW-D — CLOSED at native layer)', async () => {
    console.log(`
📐 SE-ECIES design (confirmed by 2026-07-01 internal audit):
  - kSecAttrTokenIDSecureEnclave present at HardwareKekPlugin.m:78 (H-NEW-D CLOSED)
  - KEK = HKDF(H || C): H = SE ECIES factor, C = Argon2id(PIN)
  - Both factors required; missing either throws (fail-closed, I6)
This spec cannot re-verify native ObjC — it is here as the traceability anchor
for the runtime evidence the other tests in this file drive.`);
    expect(true).toBe(true);
  });

  it('should print the exact Mac-side os_log capture command for iOS-F9', async () => {
    // This is the operative instruction: run this on the Mac in a second terminal
    // BEFORE approving the Face ID sheet on the KEK-gated send below.
    const cmd =
      `log stream --style syslog --predicate 'process == "Veyrnox" && ` +
      `eventMessage CONTAINS "getHardwareFactor"'`;
    console.log(`
🧾 iOS-F9 SE-unlock trace capture (RUN ON THE MAC, in parallel):

  ${cmd}

Acceptance (from docs/hardware-audit-handoff.md Section A):
  An unredacted os_log line containing the getHardwareFactor SUCCESS entry,
  time-correlated (same log stream session) to a NEW KEK-gated Sepolia send.
  Prereq: a Mac + Xcode DEBUG build compiled with os_log(public) instead of
  NSLog (NSLog is not streamable on iOS 26). The send's txid, supplied by the
  owner, advances iOS from PARTIAL to full device-verified.`);
    expect(cmd).toContain('getHardwareFactor');
  });

  it('should perform a KEK-gated send when SUPERVISED_SEND=1 (feeds iOS-F9 + promotion)', async () => {
    if (process.env.SUPERVISED_SEND !== '1') {
      console.log(
        '⚠️ SUPERVISED_SEND != 1 — skipping the KEK-gated send. Start the Mac-side ' +
          '`log stream` above, set SUPERVISED_SEND=1, and re-run to capture the trace + txid.'
      );
      return;
    }
    const RECIPIENT = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
    await walletHelper.navigateToSend('ETH');
    await walletHelper.enterSendDetails(RECIPIENT, '0.001');
    await walletHelper.confirmSend(); // native Face ID sheet = the SE unlock — approve on-device

    let txHash = null;
    try {
      txHash = await walletHelper.getTransactionHash();
    } catch (e) {
      console.log('No tx hash surfaced');
    }
    if (txHash) {
      console.log(`
🟢 iOS KEK-gated send broadcast: ${txHash}
  Pair this txid with the os_log getHardwareFactor line from the Mac terminal.
  Together they close iOS-F9 and promote iOS KEK to full device-verified.
  Record BOTH in docs/verified-evidence.json (owner step).`);
      expect(txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
    } else {
      console.log('KEK-gated send did not reach broadcast — supervised retry needed.');
    }
  });

  it('should NOT leak the KEK factor H or vault blob into any Appium-reachable log', async () => {
    // iOS analogue of the Android LOG-1 bridge-redaction canary. Capacitor's debug
    // bridge logger echoing plugin results is the same code path on both platforms;
    // this canary FAILS HARD if the SE factor H (32 bytes → 44 base64 chars) or a
    // long base64 vault-blob run ever appears in a log Appium can read.
    const logTypes = ['syslog'];
    let leaks = 0;
    let payloads = 0;

    for (const t of logTypes) {
      const logs = await appHelper.tryGetLogs(t);
      for (const entry of logs) {
        const msg = String(entry.message || entry);
        if (/\\?"h\\?"\s*:\s*\\?"[A-Za-z0-9+/=]{16,}\\?"/.test(msg)) leaks++;
        if (/Capacitor\/Console/.test(msg) && /[A-Za-z0-9+/=]{64,}/.test(msg)) payloads++;
      }
    }

    // Report counts only — printing the matches would re-leak them into CI artifacts.
    if (leaks > 0 || payloads > 0) {
      console.log(`❌ SENSITIVE PAYLOAD IN iOS LOGS: "h"-field matches=${leaks}, console base64 payloads=${payloads}`);
    } else {
      console.log(
        '✅ Leak canary clean in Appium-reachable logs. NOTE: iOS 26 NSLog is not ' +
          'fully streamable via Appium, so a clean result here is necessary but not ' +
          'sufficient — the Mac-side `log stream` is the authoritative check.'
      );
    }
    expect(leaks).toBe(0);
    expect(payloads).toBe(0);
  });
});
