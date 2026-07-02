// src/wallet-core/keystore/__tests__/hardware.js-guards.test.js
//
// H-4 / iOS-F8 — a degenerate all-zero hardware factor H (valid length, zero entropy)
//   must be rejected. 32 zero bytes reduces the KEK to a deterministic HKDF of 0^32 || C,
//   i.e. C-only protection (I6 hardware binding silently lost). Fail closed (I4).
//
// iOS-F6 (JS layer) — enrollHardwareCredential() must NOT call the destructive native
//   enroll() when a credential already exists. On iOS/Android enroll() rotates the SE/
//   Keystore key, permanently invalidating the existing kekWrap. Guard, fail closed (I4).
//
// Codes are the contract (copy may change): HARDWARE_FACTOR_DEGENERATE,
// HARDWARE_KEK_ALREADY_ENROLLED, KEK_DEGENERATE_INPUT.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const plugin = {
  isEnrolled: vi.fn(),
  enroll: vi.fn(),
  getHardwareFactor: vi.fn(),
  clearCredential: vi.fn(),
};

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
  registerPlugin: () => plugin,
}));

import {
  getHardwareFactor,
  enrollHardwareCredential,
} from '../hardware.js';
import { combineKek, KEK_ERR } from '../kek.js';

function b64(u8) {
  let s = '';
  for (const b of u8) s += String.fromCharCode(b);
  return btoa(s);
}

beforeEach(() => {
  plugin.isEnrolled.mockReset();
  plugin.enroll.mockReset();
  plugin.getHardwareFactor.mockReset();
  plugin.clearCredential.mockReset();
});

describe('H-4 / iOS-F8 — degenerate all-zero hardware factor', () => {
  it('getHardwareFactor throws HARDWARE_FACTOR_DEGENERATE for 32 zero bytes', async () => {
    plugin.getHardwareFactor.mockResolvedValue({ h: b64(new Uint8Array(32)) });
    await expect(getHardwareFactor()).rejects.toMatchObject({
      code: 'HARDWARE_FACTOR_DEGENERATE',
    });
  });

  it('getHardwareFactor accepts a non-zero 32-byte factor', async () => {
    const good = new Uint8Array(32).fill(7);
    plugin.getHardwareFactor.mockResolvedValue({ h: b64(good) });
    const result = await getHardwareFactor();
    expect(result).toEqual(good);
  });
});

describe('H-4 / iOS-F8 — combineKek defence in depth', () => {
  it('rejects all-zero H with KEK_DEGENERATE_INPUT', async () => {
    const H = new Uint8Array(32); // all zero
    const C = new Uint8Array(32).fill(9);
    await expect(combineKek(H, C)).rejects.toMatchObject({
      code: 'KEK_DEGENERATE_INPUT',
    });
  });

  it('rejects all-zero C with KEK_DEGENERATE_INPUT', async () => {
    const H = new Uint8Array(32).fill(9);
    const C = new Uint8Array(32); // all zero
    await expect(combineKek(H, C)).rejects.toMatchObject({
      code: 'KEK_DEGENERATE_INPUT',
    });
  });

  it('still combines two non-zero factors', async () => {
    const H = new Uint8Array(32).fill(1);
    const C = new Uint8Array(32).fill(2);
    const kek = await combineKek(H, C);
    expect(kek).toBeInstanceOf(Uint8Array);
    expect(kek.length).toBe(32);
  });

  it('length guards still fire before degeneracy check', async () => {
    await expect(combineKek(new Uint8Array(16), new Uint8Array(32).fill(1)))
      .rejects.toThrow(KEK_ERR.NO_HARDWARE_FACTOR);
  });
});

describe('iOS-F6 (JS layer) — double-enrollment guard', () => {
  it('throws HARDWARE_KEK_ALREADY_ENROLLED without calling native enroll()', async () => {
    plugin.isEnrolled.mockResolvedValue({ enrolled: true });
    await expect(enrollHardwareCredential()).rejects.toMatchObject({
      code: 'HARDWARE_KEK_ALREADY_ENROLLED',
    });
    expect(plugin.enroll).not.toHaveBeenCalled();
  });

  it('calls native enroll() when not already enrolled', async () => {
    plugin.isEnrolled.mockResolvedValue({ enrolled: false });
    // enroll() returns the tier response; must be an accepted hardware tier so the
    // INSECURE_TIER gate passes (combined guard: double-enrollment check first, then tier).
    plugin.enroll.mockResolvedValue({ securityLevelName: 'STRONGBOX', securityLevel: 2 });
    const tier = await enrollHardwareCredential();
    expect(plugin.enroll).toHaveBeenCalledTimes(1);
    expect(tier.securityLevelName).toBe('STRONGBOX');
  });

  // Regression (was PR #521): the guard keyed on native-alias presence ALONE. The iOS
  // Keychain SE key / Android Keystore alias SURVIVE an app uninstall, so a stale alias
  // over a BARE (unwrapped) vault wrongly blocked a fresh enroll → generic "Something
  // went wrong". The real iOS-F6 invariant is the VAULT kekWrap, not alias presence.
  it('STALE alias over a BARE vault: does NOT block — clears alias and enrolls', async () => {
    plugin.isEnrolled.mockResolvedValue({ enrolled: true });   // alias present…
    plugin.clearCredential.mockResolvedValue({});
    plugin.enroll.mockResolvedValue({ securityLevelName: 'SecureEnclave', securityLevel: 2 });
    // …but the vault is bare (no kekWrap) → alias is stale, not real enrollment.
    const tier = await enrollHardwareCredential({ isVaultWrapped: () => Promise.resolve(false) });
    expect(plugin.clearCredential).toHaveBeenCalledTimes(1); // stale alias cleared
    expect(plugin.enroll).toHaveBeenCalledTimes(1);          // fresh enroll proceeds
    expect(tier.securityLevelName).toBe('SecureEnclave');
  });

  it('GENUINE enrollment (alias + wrapped vault): still blocks, never rotates the key', async () => {
    plugin.isEnrolled.mockResolvedValue({ enrolled: true });
    await expect(
      enrollHardwareCredential({ isVaultWrapped: () => Promise.resolve(true) }),
    ).rejects.toMatchObject({ code: 'HARDWARE_KEK_ALREADY_ENROLLED' });
    expect(plugin.enroll).not.toHaveBeenCalled();
  });
});
