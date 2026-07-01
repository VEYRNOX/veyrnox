// src/wallet-core/keystore/__tests__/hardware.factor-io-validation.test.js
//
// QA I/O-validation (MED) — getHardwareFactor() passes the native plugin's { h }
// straight into b64ToUint8Array(h) with no shape check. A plugin that returns {},
// { h: undefined }, { h: 123 } or a wrong-length base64 must FAIL CLOSED with a
// STABLE machine code (KEK_ERR.NO_HARDWARE_FACTOR), never fabricate/return garbage
// bytes and never surface a raw TypeError/InvalidCharacterError.
//
// The native plugin is mocked (established JS-orchestration-only pattern).

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

describe('getHardwareFactor — plugin output validation (fail-closed, stable code)', () => {
  it('throws NO_HARDWARE_FACTOR when the plugin returns {} (no h)', async () => {
    getHFFn.mockResolvedValueOnce({});
    await expect(getHardwareFactor()).rejects.toThrow(KEK_ERR.NO_HARDWARE_FACTOR);
  });

  it('throws NO_HARDWARE_FACTOR when h is undefined', async () => {
    getHFFn.mockResolvedValueOnce({ h: undefined });
    await expect(getHardwareFactor()).rejects.toThrow(KEK_ERR.NO_HARDWARE_FACTOR);
  });

  it('throws NO_HARDWARE_FACTOR when h is a non-string (number)', async () => {
    getHFFn.mockResolvedValueOnce({ h: 123 });
    await expect(getHardwareFactor()).rejects.toThrow(KEK_ERR.NO_HARDWARE_FACTOR);
  });

  it('throws NO_HARDWARE_FACTOR when h is an empty string', async () => {
    getHFFn.mockResolvedValueOnce({ h: '' });
    await expect(getHardwareFactor()).rejects.toThrow(KEK_ERR.NO_HARDWARE_FACTOR);
  });

  it('throws a STABLE code (not a raw length string) when h decodes to the wrong length', async () => {
    getHFFn.mockResolvedValueOnce({ h: 'AA' }); // decodes to 1 byte, not 32
    await expect(getHardwareFactor()).rejects.toThrow(KEK_ERR.NO_HARDWARE_FACTOR);
  });

  it('returns a 32-byte Uint8Array on a valid plugin result', async () => {
    getHFFn.mockResolvedValueOnce({ h: btoa('y'.repeat(32)) });
    const h = await getHardwareFactor();
    expect(h).toBeInstanceOf(Uint8Array);
    expect(h.length).toBe(32);
  });
});
