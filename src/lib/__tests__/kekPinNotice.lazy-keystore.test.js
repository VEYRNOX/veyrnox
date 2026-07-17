// src/lib/__tests__/kekPinNotice.lazy-keystore.test.js
//
// Issue #1106 (P2): kekPinNotice must not invoke getKeyStore() at module load —
// it forces keystore-singleton instantiation for any importer, and departs from
// the lazy pattern used elsewhere (e.g. WalletProvider.jsx). PRs #1082/#1086
// showed this fragility class already breaks bootstrap ordering.
//
// This test spies the getKeyStore factory and asserts:
//   1. Importing '@/lib/kekPinNotice' does NOT call getKeyStore.
//   2. Only ensureKekPinNoticeOnNative() triggers the call.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: vi.fn(() => true) },
}));

vi.mock('sonner', () => ({
  toast: { warning: vi.fn() },
}));

const mockKeyStore = { hasVaultKekWrap: vi.fn(async () => false) };
const getKeyStoreSpy = vi.fn(() => mockKeyStore);
vi.mock('@/wallet-core/keystore', () => ({
  get getKeyStore() {
    return getKeyStoreSpy;
  },
}));

vi.mock('@/wallet-core/deniabilitySession.js', () => ({
  isDeniabilityOrDemoActive: vi.fn(() => false),
}));

describe('kekPinNotice — lazy keystore access (issue #1106)', () => {
  beforeEach(() => {
    vi.resetModules();
    getKeyStoreSpy.mockClear();
    mockKeyStore.hasVaultKekWrap.mockClear();
    localStorage.removeItem('veyrnox-kek-pin-notice');
  });

  it('does NOT call getKeyStore() at module import time', async () => {
    await import('../kekPinNotice.js');
    expect(getKeyStoreSpy).not.toHaveBeenCalled();
  });

  it('calls getKeyStore() only when ensureKekPinNoticeOnNative() runs', async () => {
    const { ensureKekPinNoticeOnNative } = await import('../kekPinNotice.js');
    expect(getKeyStoreSpy).not.toHaveBeenCalled();
    await ensureKekPinNoticeOnNative();
    expect(getKeyStoreSpy).toHaveBeenCalledTimes(1);
  });
});
