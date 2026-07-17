// Codex ad-hoc review 2026-07-17 P2-#1: deleteWrappingKey() was ungated so any in-page
// JS (injected script, XSS gadget, dev-tools) could reach the native cleanup path.
// While M2c is dormant that only mints/erases orphan keys, but once M2C_ENABLED=true
// and real users have Enclave-wrapped vaults, an unauthenticated call could strand a
// vault (availability hazard). Rather than gate on M2C_ENABLED (which would break the
// clearVault teardown design), the fix requires an explicit `intent` allowlisted
// string — internal callers pass one, injected JS almost certainly won't.
//
// Fail closed at the JS boundary: no intent → throw M2C_DELETE_INTENT_REQUIRED
// WITHOUT touching native.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { nativeCalls, fakePlugin } = vi.hoisted(() => {
  const nativeCalls = { deleteWrappingKey: 0 };
  const fakePlugin = {
    isHardwareKeyAvailable: async () => ({ backing: 'none', biometryEnrolled: false }),
    createWrappingKey: async () => {},
    wrap: async () => ({ ciphertext: 'CT' }),
    unwrap: async () => ({ blob: 'BLOB' }),
    deleteWrappingKey: async () => { nativeCalls.deleteWrappingKey++; },
  };
  return { nativeCalls, fakePlugin };
});

vi.mock('@capacitor/core', () => ({
  registerPlugin: () => fakePlugin,
}));

import { deleteWrappingKey } from '../veyrnoxEnclave.js';

beforeEach(() => {
  nativeCalls.deleteWrappingKey = 0;
});

describe('P2-#1: deleteWrappingKey requires explicit allowlisted intent', () => {
  it('throws M2C_DELETE_INTENT_REQUIRED when called with no argument (native NOT reached)', async () => {
    await expect(deleteWrappingKey()).rejects.toMatchObject({ code: 'M2C_DELETE_INTENT_REQUIRED' });
    expect(nativeCalls.deleteWrappingKey).toBe(0);
  });

  it('throws M2C_DELETE_INTENT_REQUIRED on empty opts (native NOT reached)', async () => {
    await expect(deleteWrappingKey({})).rejects.toMatchObject({ code: 'M2C_DELETE_INTENT_REQUIRED' });
    expect(nativeCalls.deleteWrappingKey).toBe(0);
  });

  it('throws M2C_DELETE_INTENT_REQUIRED on an unknown intent (native NOT reached)', async () => {
    await expect(deleteWrappingKey({ intent: 'anything-else' })).rejects.toMatchObject({
      code: 'M2C_DELETE_INTENT_REQUIRED',
    });
    expect(nativeCalls.deleteWrappingKey).toBe(0);
  });

  it('reaches native when intent is "cleanup"', async () => {
    await expect(deleteWrappingKey({ intent: 'cleanup' })).resolves.toBeUndefined();
    expect(nativeCalls.deleteWrappingKey).toBe(1);
  });

  it('reaches native when intent is "unenroll"', async () => {
    await expect(deleteWrappingKey({ intent: 'unenroll' })).resolves.toBeUndefined();
    expect(nativeCalls.deleteWrappingKey).toBe(1);
  });

  it('reaches native when intent is "wipe"', async () => {
    await expect(deleteWrappingKey({ intent: 'wipe' })).resolves.toBeUndefined();
    expect(nativeCalls.deleteWrappingKey).toBe(1);
  });

  it('rejects non-string intent values (e.g. true, number)', async () => {
    await expect(deleteWrappingKey({ intent: true })).rejects.toMatchObject({
      code: 'M2C_DELETE_INTENT_REQUIRED',
    });
    await expect(deleteWrappingKey({ intent: 1 })).rejects.toMatchObject({
      code: 'M2C_DELETE_INTENT_REQUIRED',
    });
    expect(nativeCalls.deleteWrappingKey).toBe(0);
  });
});
