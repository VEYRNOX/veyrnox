// src/wallet-core/keystore/__tests__/hardware.kek-salt-bridge-encoding.test.js
//
// C-1 regression (2026-07-05): getHardwareFactor(opts) passed { kekSalt } as a RAW
// Uint8Array to the native plugin. The Capacitor Android bridge JSON.stringify's plugin
// options, so a Uint8Array becomes {"0":86,"1":101,...}; Kotlin's call.getString("kekSalt")
// then returns null (indistinguishable from absent) and the plugin silently fell back to
// the fixed v1 PRF_EVAL_SALT — the v2 binding was cryptographically inert on device.
//
// FIX: hardware.js base64-encodes kekSalt to a STRING before the plugin call, which the
// bridge carries losslessly and Kotlin's getString reads intact.
//
// These tests assert the CONTRACT the real bridge enforces:
//   (i)  the mock plugin receives kekSalt as a base64 STRING (never a Uint8Array/object);
//   (ii) the plugin args survive JSON.parse(JSON.stringify(...)) with kekSalt unchanged.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const getHFFn = vi.fn(async () => ({ h: btoa('y'.repeat(32)) }));
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

// base64(no-wrap) → Uint8Array, matching hardware.js's internal decoder.
const b64ToBytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

beforeEach(() => {
  vi.clearAllMocks();
  getHFFn.mockResolvedValue({ h: btoa('y'.repeat(32)) });
});

describe('getHardwareFactor — bridge-safe kekSalt encoding (C-1)', () => {
  it('(i) passes kekSalt to the plugin as a base64 STRING, not a Uint8Array', async () => {
    const saltBytes = new Uint8Array(32).fill(0x2a);
    await getHardwareFactor({ kekSalt: saltBytes });

    expect(getHFFn).toHaveBeenCalledTimes(1);
    const arg = getHFFn.mock.calls[0][0];
    expect(arg).toBeTruthy();
    expect(typeof arg.kekSalt).toBe('string');
    // …and it must round-trip back to the exact salt bytes the caller supplied.
    expect(Array.from(b64ToBytes(arg.kekSalt))).toEqual(Array.from(saltBytes));
  });

  it('(ii) plugin args survive the Capacitor bridge JSON round-trip unchanged', async () => {
    const saltBytes = new Uint8Array(32).fill(0x91);
    await getHardwareFactor({ kekSalt: saltBytes });

    const pluginArgs = getHFFn.mock.calls[0][0];
    // Emulate exactly what the Capacitor bridge does to plugin options.
    const roundTripped = JSON.parse(JSON.stringify(pluginArgs));
    expect(roundTripped.kekSalt).toBe(pluginArgs.kekSalt); // still the same base64 string
    expect(typeof roundTripped.kekSalt).toBe('string');
    expect(Array.from(b64ToBytes(roundTripped.kekSalt))).toEqual(Array.from(saltBytes));
  });

  it('a RAW Uint8Array would NOT survive the bridge — proves why the string encoding matters', () => {
    // Documentation guard: a Uint8Array serialises to a keyed object and cannot be read
    // by Kotlin call.getString (this is the exact failure the fix removes).
    const saltBytes = new Uint8Array(32).fill(1);
    const naive = JSON.parse(JSON.stringify({ kekSalt: saltBytes }));
    expect(typeof naive.kekSalt).not.toBe('string');
    expect(naive.kekSalt).toMatchObject({ 0: 1 }); // {"0":1,"1":1,...}
  });

  it('omits kekSalt entirely (undefined opts) for the v1 legacy path', async () => {
    await getHardwareFactor();
    expect(getHFFn).toHaveBeenCalledWith(undefined);
  });

  it('omits kekSalt when opts has no kekSalt (defensive)', async () => {
    await getHardwareFactor({});
    expect(getHFFn).toHaveBeenCalledWith(undefined);
  });
});
