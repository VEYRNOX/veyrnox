// src/wallet-core/keystore/__tests__/hardware.plugin-rejection.test.js
//
// Step 2 — getHardwareFactor() must classify raw Kotlin bridge rejections into STABLE
// machine codes so upstream (WalletEntry) can branch WITHOUT parsing prose:
//   - "KEK_KEY_PERMANENTLY_INVALIDATED: ..." → .code === KEY_PERMANENTLY_INVALIDATED
//   - "User cancelled"                       → re-thrown unchanged (user-initiated)
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

  it('re-throws a "User cancelled" rejection unchanged (user-initiated)', async () => {
    const cancel = new Error('User cancelled');
    getHFFn.mockRejectedValueOnce(cancel);
    const err = await getHardwareFactor().catch((e) => e);
    expect(err).toBe(cancel); // same object, re-thrown unchanged
    expect(err.code).toBeUndefined(); // NOT reclassified to a KEK code
  });

  it('maps any other bridge rejection to NO_HARDWARE_FACTOR (fail-closed)', async () => {
    getHFFn.mockRejectedValueOnce(new Error('KEK_BIOMETRIC_ERROR:7: Too many attempts'));
    await expect(getHardwareFactor()).rejects.toMatchObject({
      code: KEK_ERR.NO_HARDWARE_FACTOR,
    });
  });
});
