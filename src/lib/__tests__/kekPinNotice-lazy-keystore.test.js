// src/lib/__tests__/kekPinNotice-lazy-keystore.test.js
// #1106: getKeyStore() must NOT run at module evaluation time.
import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: vi.fn(() => true) } }));
vi.mock('sonner', () => ({ toast: { warning: vi.fn() } }));
const getKeyStoreSpy = vi.fn(() => ({ hasVaultKekWrap: vi.fn(async () => false) }));
vi.mock('@/wallet-core/keystore', () => ({ getKeyStore: (...a) => getKeyStoreSpy(...a) }));
vi.mock('@/wallet-core/deniabilitySession.js', () => ({ isDeniabilityOrDemoActive: vi.fn(() => false) }));
describe('#1106 — kekPinNotice lazy keystore', () => {
  beforeEach(() => { getKeyStoreSpy.mockClear(); localStorage.removeItem('veyrnox-kek-pin-notice'); });
  it('getKeyStore is NOT called at module-load time', async () => {
    const _mod = await import('../kekPinNotice.js');
    expect(getKeyStoreSpy).not.toHaveBeenCalled();
  });
  it('getKeyStore IS called when ensureKekPinNoticeOnNative runs', async () => {
    const { ensureKekPinNoticeOnNative } = await import('../kekPinNotice.js');
    getKeyStoreSpy.mockClear();
    await ensureKekPinNoticeOnNative();
    expect(getKeyStoreSpy).toHaveBeenCalledOnce();
  });
});
