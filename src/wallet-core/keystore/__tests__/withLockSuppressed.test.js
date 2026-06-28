// src/wallet-core/keystore/__tests__/withLockSuppressed.test.js
//
// Pins the public contract for the file-picker lock-suppression escape hatch.
//
// WHY: the Capacitor `pause` event fires whenever a native Activity (the system
// file picker / document picker) comes to the foreground, which would otherwise
// fire the lock hook and lock the wallet mid backup/restore. The fix exposes
// `withLockSuppressed` so the file-picker call sites can wrap their native call.
//
// On web the keystore exposes a transparent no-op that simply runs the fn — the
// `<input type="file">` path never pauses the app, so no suppression is needed.
import { describe, it, expect } from 'vitest';
import { withLockSuppressed } from '../index.js';

describe('keystore index withLockSuppressed (web no-op)', () => {
  it('is an exported function', () => {
    expect(typeof withLockSuppressed).toBe('function');
  });

  it('runs the wrapped fn and returns its resolved value', async () => {
    const out = await withLockSuppressed(() => 'picked');
    expect(out).toBe('picked');
  });

  it('awaits an async wrapped fn', async () => {
    const out = await withLockSuppressed(async () => 42);
    expect(out).toBe(42);
  });

  it('propagates a thrown error (fail honest, fail closed)', async () => {
    await expect(
      withLockSuppressed(() => { throw new Error('boom'); }),
    ).rejects.toThrow('boom');
  });
});
