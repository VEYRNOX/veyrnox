// src/wallet-core/keystore/__tests__/hardware.plugin-rejection.test.js
//
// Step 2 — getHardwareFactor() must classify raw Kotlin bridge rejections into STABLE
// machine codes so upstream (WalletEntry) can branch WITHOUT parsing prose:
//   - "KEK_KEY_PERMANENTLY_INVALIDATED: ..." → .code === KEY_PERMANENTLY_INVALIDATED
//   - "User cancelled"                       → .code === USER_CANCELLED (user-initiated)
//   - anything else                          → .code === NO_HARDWARE_FACTOR (fail-closed)
//
// Root cause: line 209's `await plugin.getHardwareFactor(pluginOpts)` had NO try/catch,
// so a raw invalidation string propagated unclassified and WalletEntry counted it as a
// wrong PIN → panic wipe after 10 retries.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const getHFFn = vi.fn(async () => ({ h: btoa('x'.repeat(32)) }));
const pluginMock = {
  enroll: vi.fn(async () => ({ securityLevel: 2, securityLevelName: 'STRONGBOX' })),
  isEnrolled: vi.fn(async () => ({ enrolled: false })),
  getHardwareFactor: getHFFn,
  clearCredential: vi.fn(async () => {}),
};
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
  registerPlugin: () => pluginMock,
}));

const { getHardwareFactor } = await import('../hardware.js');
const { KEK_ERR } = await import('../kek.js');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getHardwareFactor — bridge rejection classification (fail-closed, stable codes)', () => {
  it('maps a KEK_KEY_PERMANENTLY_INVALIDATED bridge rejection to the stable code', async () => {
    getHFFn.mockRejectedValueOnce(
      new Error('KEK_KEY_PERMANENTLY_INVALIDATED: Hardware key invalidated — biometric enrollment changed'),
    );
    await expect(getHardwareFactor()).rejects.toMatchObject({
      code: KEK_ERR.KEY_PERMANENTLY_INVALIDATED,
    });
  });

  it('maps a "User cancelled" rejection to the stable USER_CANCELLED code (NOT a wrong PIN)', async () => {
    // A raw re-throw carries no .code, so WalletEntry's KEK exemptions miss it and the
    // cancel falls through to the wrong-PIN counter → panic wipe. Classify it instead.
    getHFFn.mockRejectedValueOnce(new Error('User cancelled'));
    await expect(getHardwareFactor()).rejects.toMatchObject({
      code: KEK_ERR.USER_CANCELLED,
    });
  });

  it('maps any other bridge rejection to NO_HARDWARE_FACTOR (fail-closed)', async () => {
    getHFFn.mockRejectedValueOnce(new Error('KEK_BIOMETRIC_ERROR:7: Too many attempts'));
    await expect(getHardwareFactor()).rejects.toMatchObject({
      code: KEK_ERR.NO_HARDWARE_FACTOR,
    });
  });
});

// Codex P1 (2026-07-11, second finding): malformed SUCCESS responses (bad h) must ALSO
// carry .code — WalletEntry's counter exemption matches e.code, and a message-only throw
// from a bridge/plugin output regression would be miscounted as a wrong PIN (panic-wipe
// leak, same class as the cancel bug).
describe('getHardwareFactor — malformed bridge output carries .code (never counts as wrong PIN)', () => {
  it('missing h → .code === NO_HARDWARE_FACTOR', async () => {
    getHFFn.mockResolvedValueOnce({});
    await expect(getHardwareFactor()).rejects.toMatchObject({
      code: KEK_ERR.NO_HARDWARE_FACTOR,
    });
  });

  it('non-string h → .code === NO_HARDWARE_FACTOR', async () => {
    getHFFn.mockResolvedValueOnce({ h: 12345 });
    await expect(getHardwareFactor()).rejects.toMatchObject({
      code: KEK_ERR.NO_HARDWARE_FACTOR,
    });
  });

  it('invalid base64 h → .code === NO_HARDWARE_FACTOR', async () => {
    getHFFn.mockResolvedValueOnce({ h: '!!!not-base64!!!' });
    await expect(getHardwareFactor()).rejects.toMatchObject({
      code: KEK_ERR.NO_HARDWARE_FACTOR,
    });
  });

  it('wrong-length h → .code === NO_HARDWARE_FACTOR', async () => {
    // 8 bytes, valid base64 — fails the 32-byte length gate.
    getHFFn.mockResolvedValueOnce({ h: 'AAAAAAAAAAE=' });
    await expect(getHardwareFactor()).rejects.toMatchObject({
      code: KEK_ERR.NO_HARDWARE_FACTOR,
    });
  });
});
