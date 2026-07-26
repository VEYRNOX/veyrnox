// wallet-core/__tests__/panic-residue-telemetry-markers.test.js
//
// I-3 residue-completeness for the telemetry/funnel keys added by PR #1344 (and
// the device id from PR #1321). None is key material, but each proves a real
// Veyrnox install reached a given milestone on this device — the same class as
// 'veyrnox-kek-pin-notice' and 'veyrnox-live-prices', which are already swept.
//
// Before this was fixed, none of these keys was in ALL_RESIDUE_KEYS and the
// only wildcard prefix was 'veyrnox-snapshots-'. So they survived a panic wipe
// AND inspectKeyMaterial() did not account for them — meaning the post-wipe
// report said clean:true while a forensic dump still showed the device had run
// a real wallet, which telemetry id it reported under, and (via the old
// per-wallet seed-verify keys) how many wallets existed.
//
// The seed-verify legacy keys are covered by the 'veyrnox-seed-verify-' prefix
// sweep; the current single-blob key 'veyrnox-seed-verify' is an exact match.

import { describe, it, expect, beforeEach } from 'vitest';
import { panicWipeLocal, inspectKeyMaterial, clearWipeMarker } from '../panic.js';
import { webKeyStore } from '../keystore/web.js';
import { generateMnemonic } from '../mnemonic.js';
import { clearVault } from '../evm/vaultStore.js';

const REAL_PW = 'telemetry-residue-pw-1234';

// Exact-match keys that must be enumerated and wiped.
const EXACT_KEYS = [
  'veyrnox-device-id',
  'veyrnox-telemetry-consent',
  'veyrnox-holdout',
  'veyrnox-first-open-fired',
  'veyrnox-wallet-ready-fired',
  'veyrnox-first-inbound-fired',
  'veyrnox-first-send-fired',
  'veyrnox-seed-verify',
];

// Legacy per-wallet seed-verify keys — the ones whose sheer COUNT leaked how
// many wallets the device held. Swept by prefix.
const LEGACY_PREFIXED_KEYS = [
  'veyrnox-seed-verify-cp-wallet1',
  'veyrnox-seed-verify-verified-wallet1',
  'veyrnox-seed-verify-deferred-wallet2',
];

function seedAllKeys() {
  for (const k of EXACT_KEYS) localStorage.setItem(k, '1');
  for (const k of LEGACY_PREFIXED_KEYS) localStorage.setItem(k, '1');
}

describe('panic wipe — telemetry/funnel residue (I-3)', () => {
  beforeEach(async () => {
    try { await clearVault(); } catch { /* noop */ }
    try { await panicWipeLocal(); } catch { /* noop */ }
    try { clearWipeMarker(); } catch { /* noop */ }
    for (const k of [...EXACT_KEYS, ...LEGACY_PREFIXED_KEYS]) localStorage.removeItem(k);
  });

  it('enumerates every telemetry marker pre-wipe and refuses to call it clean', async () => {
    await webKeyStore.createVault(generateMnemonic(128), REAL_PW);
    seedAllKeys();

    const before = await inspectKeyMaterial();

    for (const k of EXACT_KEYS) expect(before.localStorageResidue).toContain(k);
    for (const k of LEGACY_PREFIXED_KEYS) expect(before.localStorageResidue).toContain(k);
    expect(before.clean).toBe(false);
  });

  it('panicWipeLocal() clears them all and only then reports clean', async () => {
    await webKeyStore.createVault(generateMnemonic(128), REAL_PW);
    seedAllKeys();

    const report = await panicWipeLocal();

    for (const k of [...EXACT_KEYS, ...LEGACY_PREFIXED_KEYS]) {
      expect(localStorage.getItem(k)).toBeNull();
      expect(report.localStorageResidue).not.toContain(k);
    }
    expect(report.clean).toBe(true);
    expect((await inspectKeyMaterial()).clean).toBe(true);
  });

  // The specific pre-fix failure: the wipe ran, removed nothing here, and the
  // report still claimed nothing recoverable remained.
  it('never reports clean while a telemetry marker survives', async () => {
    await webKeyStore.createVault(generateMnemonic(128), REAL_PW);
    await panicWipeLocal();
    clearWipeMarker();

    localStorage.setItem('veyrnox-device-id', 'aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee');

    const after = await inspectKeyMaterial();
    expect(after.localStorageResidue).toContain('veyrnox-device-id');
    expect(after.clean).toBe(false);
  });
});
