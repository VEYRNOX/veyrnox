// Codex P1 2026-08-15: _reapplyEnclaveWrapIfNeeded USED to return `undefined`
// and silently drop the outer Enclave wrap when hardware capability flipped
// between read and write during restoreFromPersonalBackupShares (M2c→M2b silent
// downgrade). It now returns a status string ('reapplied' | 'not-enclave' |
// 'downgraded'), and restoreFromPersonalBackupShares returns
// { downgradedFromEnclave: bool } so the UI can surface the honest state (I4).
//
// Pins the two zero-dep branches — the 'reapplied' and full-integration cases
// need SecureStorage + enclave plugin mocks and belong in a plugin-level test.

import { describe, it, expect, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' },
  registerPlugin: () => ({
    get: vi.fn(async () => null),
    set: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    setKeyPrefix: vi.fn(async () => {}),
    setSynchronize: vi.fn(async () => {}),
    setDefaultKeychainAccess: vi.fn(async () => {}),
  }),
}));

vi.mock('../../plugins/veyrnoxEnclave.js', () => ({
  isHardwareKeyAvailable: async () => false,
  createWrappingKey: async () => {},
  hwWrap: async () => 'stub-ct',
  hwUnwrap: async () => 'stub-pt',
}));

import { nativeKeyStore } from '../native.js';

describe('_reapplyEnclaveWrapIfNeeded — fail-honest status (Codex P1 2026-08-15)', () => {
  it("returns 'not-enclave' when the vault was never Enclave-wrapped (zero side effects)", async () => {
    expect(await nativeKeyStore._reapplyEnclaveWrapIfNeeded(false)).toBe('not-enclave');
  });

  it("returns 'downgraded' when the vault was Enclave-wrapped but hardware capability is gone", async () => {
    // enclave plugin mock reports isHardwareKeyAvailable: false, so
    // useHardwareWrap() short-circuits to false and the method reports the
    // honest downgrade without writing anything.
    expect(await nativeKeyStore._reapplyEnclaveWrapIfNeeded(true)).toBe('downgraded');
  });
});
