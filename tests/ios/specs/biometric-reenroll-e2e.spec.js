// Biometric re-enrollment invalidation — iOS (H-2 / iOS-F11).
// Run: npm run ios:test:biometric-reenroll  (UNRESTRICTED iPhone, supervised)
//
// This is the iOS half of H-2/iOS-F11. The Android half is RESOLVED / device-
// verified (PR #516/#518: re-enroll fingerprint → KeyPermanentlyInvalidatedException
// → fail-closed → PIN recovery). The iOS half is DEVICE-BLOCKED: the SE key ACL
// flag kSecAccessControlBiometryCurrentSet is set at HardwareKekPlugin.m:96, but
// the runtime re-enroll test needs an iPhone where Face ID enrollment is NOT
// restricted (the test iPhone 17 Pro Max is restricted).
//
// This spec CANNOT re-enroll Face ID for you (that is a native Settings action,
// out of XCUITest scope for a third-party app). It drives the app side of the
// procedure and asserts the fail-closed behaviour + PIN recovery once the
// operator has done the manual Settings step. Steps requiring the human are
// gated behind REENROLL_DONE=1.
import appHelper from '../helpers/appHelper.js';
import walletHelper from '../helpers/walletHelper.js';

describe('Biometric Re-enrollment Invalidation — iOS (H-2/iOS-F11)', () => {
  before(async () => {
    await driver.execute('mobile: launchApp', { bundleId: appHelper.bundleId });
    await appHelper.pause(1500);
  });

  it('should print the supervised re-enrollment procedure', async () => {
    console.log(`
🧪 H-2/iOS-F11 iOS runtime procedure (mirrors the passed Android test):

  1. On an UNRESTRICTED iPhone, enroll the SE KEK (Face ID + PIN) from a clean vault.
  2. iOS Settings → Face ID & Passcode → remove and re-enroll Face ID.
  3. Force-close and cold restart Veyrnox.
  4. Attempt a KEK unlock — kSecAccessControlBiometryCurrentSet must invalidate
     the SE key.
  5. App must FAIL CLOSED: "Hardware key invalidated — re-enrollment required"
     (or equivalent), NOT silently open.
  6. PIN fallback must still recover the vault (I4 recovery path intact).

Acceptance: fail-closed message shown AND PIN fallback decrypts the vault.
Record device model, iOS version, date as a META key in
docs/verified-evidence.json (mirrors _hardware_kek_biometric_reenroll_invalidation).`);
    expect(true).toBe(true);
  });

  it('should assert fail-closed + PIN recovery after re-enroll (REENROLL_DONE=1)', async () => {
    if (process.env.REENROLL_DONE !== '1') {
      console.log(
        '⚠️ REENROLL_DONE != 1 — skipping the assertion half. Complete Settings steps ' +
          '1-3 above (enroll KEK, re-enroll Face ID, cold restart), then re-run this ' +
          'spec with REENROLL_DONE=1 to assert the fail-closed + recovery behaviour.'
      );
      return;
    }

    // After a real Face ID re-enrollment + cold restart, the SE key is invalidated.
    // The app should present a fail-closed invalidation notice rather than unlock.
    await appHelper.pause(1000);
    const source = await driver.getPageSource();
    const failedClosed = /invalidated|re-?enroll|hardware key/i.test(source);

    console.log(`
🔒 Post-re-enroll app state
  Fail-closed invalidation notice present: ${failedClosed}
  (If false: the SE key was NOT invalidated — this is an I4 failure and a real bug.)`);
    expect(failedClosed).toBe(true);

    // PIN fallback must recover the vault.
    let recovered = false;
    try {
      await walletHelper.unlockVault(); // password/PIN recovery path
      recovered = !(await walletHelper.isLocked());
    } catch (e) {
      console.log(`PIN recovery attempt errored: ${e.message}`);
    }

    console.log(`  PIN fallback recovered the vault: ${recovered}`);
    expect(recovered).toBe(true);
  });
});
