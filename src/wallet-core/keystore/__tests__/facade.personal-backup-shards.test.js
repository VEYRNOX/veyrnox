// Regression pin: the native KeyStore facade in keystore/index.js MUST forward
// exportPersonalBackupShares to nativeKeyStore.exportPersonalBackupShares.
//
// Codex second-pass review (2026-08-09) caught the original Phase 1 landing
// missing this forwarder: the method existed on nativeKeyStore itself but the
// facade returned by makeNativeFacade() only surfaces methods it explicitly
// wraps, so WalletProvider's `typeof keyStore.exportPersonalBackupShares ===
// 'function'` gate resolved false and every export died with "Recovery shares
// are not available on this platform yet." Feature dead-on-arrival.
//
// This test loads the module with Capacitor.isNativePlatform() forced true and
// asserts the facade exposes the method as a function. It does NOT invoke it —
// no plugin mocks, no share-sheet mocks — just the shape.

import { describe, it, expect, vi, beforeEach } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.doMock('@capacitor/core', () => ({
    Capacitor: { isNativePlatform: () => true },
  }));
  // Stub native.js so importing keystore/index.js doesn't drag in real
  // Capacitor plugin imports. We just want the facade shape.
  vi.doMock('../native.js', () => ({
    nativeKeyStore: {
      exportPersonalBackupShares: vi.fn(async () => []),
      restoreFromPersonalBackupShares: vi.fn(async () => undefined),
    },
  }));
  vi.doMock('../web.js', () => ({ webKeyStore: {} }));
});

describe('keystore facade — Personal Backup Phase 1', () => {
  it('exposes exportPersonalBackupShares as a function on the native facade', async () => {
    const { getKeyStore } = await import('../index.js');
    const store = getKeyStore();
    expect(typeof store.exportPersonalBackupShares).toBe('function');
  });

  it('forwards exportPersonalBackupShares to nativeKeyStore', async () => {
    const nativeMod = await import('../native.js');
    const { getKeyStore } = await import('../index.js');
    const store = getKeyStore();
    await store.exportPersonalBackupShares('the-password', { getHardwareFactor: () => {} });
    expect(nativeMod.nativeKeyStore.exportPersonalBackupShares).toHaveBeenCalledWith(
      'the-password',
      expect.objectContaining({ getHardwareFactor: expect.any(Function) }),
    );
  });

  it('exposes restoreFromPersonalBackupShares as a function on the native facade', async () => {
    const { getKeyStore } = await import('../index.js');
    const store = getKeyStore();
    expect(typeof store.restoreFromPersonalBackupShares).toBe('function');
  });

  it('forwards restoreFromPersonalBackupShares to nativeKeyStore', async () => {
    const nativeMod = await import('../native.js');
    const { getKeyStore } = await import('../index.js');
    const store = getKeyStore();
    const fakeShares = [new Uint8Array(88), new Uint8Array(88)];
    await store.restoreFromPersonalBackupShares(fakeShares, 'new-pin-9876', { getHardwareFactor: () => {} });
    expect(nativeMod.nativeKeyStore.restoreFromPersonalBackupShares).toHaveBeenCalledWith(
      fakeShares,
      'new-pin-9876',
      expect.objectContaining({ getHardwareFactor: expect.any(Function) }),
    );
  });
});
