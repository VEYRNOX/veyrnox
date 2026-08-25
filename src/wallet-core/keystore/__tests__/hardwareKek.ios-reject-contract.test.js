// src/wallet-core/keystore/__tests__/hardwareKek.ios-reject-contract.test.js
//
// Weekly audit 2026-08-25, L-7 + L-8 (iOS KEK bridge error contract).
//
// L-7 — Capacitor's ObjC selector is `reject:(message):(code):(error):(data)`. Every
//       reject site in HardwareKekPlugin.m passed (code, message), so JS saw
//       `err.code === "Secure Enclave key not found — …"` and
//       `err.message === "SE_KEY_MISSING"`. The Android sibling was corrected to the
//       right order (HardwareKekPlugin.kt:310-312, Codex P2 2026-08-16); iOS was not.
//       Not exploitable — everything landed in the wipe-EXEMPT NO_HARDWARE_FACTOR
//       branch — but `e.code` on iOS was never the intended value, so any policy that
//       keys on the code (WalletEntry.jsx:965/981/991 all do) missed on iOS.
//
// L-8 — iOS flattened permanent Secure-Enclave invalidation into SE_KEY_MISSING /
//       DECRYPT_FAILED → NO_HARDWARE_FACTOR, so the user whose biometrics changed got
//       "hardware unavailable" plus a burned device-credential prompt against a key
//       that no longer exists, never "your biometric changed, restore from seed".
//       Android has routed this to KEK_KEY_PERMANENTLY_INVALIDATED since #1835.
//
// Objective-C is not compiled or unit-tested in this JS project, so the L-7 half is a
// structural source-scan guard over HardwareKekPlugin.m — the same pattern used by
// hardwareKek.ios-oslog.test.js and hardwareKek.android.test.js. The L-8 half is a real
// behavioural test of the JS classifier, which is where the routing decision is made.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const M_PATH = resolve(here, '../../../../ios/App/App/HardwareKekPlugin.m');
const raw = readFileSync(M_PATH, 'utf8');

// Strip block and line comments so the assertions pin executable Objective-C, not the
// honesty comments that legitimately quote reject codes as prose.
const code = raw
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

// Every `[call reject: … ];` invocation, captured as its raw argument list.
const rejectSites = [...code.matchAll(/\[call reject:([\s\S]*?)\];/g)].map((m) => m[1].trim());

describe('HardwareKekPlugin.m — L-7: Capacitor reject: argument order is (message, code)', () => {
  it('has reject sites to check (guards against the scan silently matching nothing)', () => {
    expect(rejectSites.length).toBeGreaterThanOrEqual(15);
  });

  it('never puts a bare machine code in the MESSAGE slot (first argument)', () => {
    // A first argument of exactly @"UPPER_SNAKE" is the swapped shape. A message that
    // merely STARTS with the code word and continues in prose (the Android
    // "KEK_KEY_PERMANENTLY_INVALIDATED: …" contract) is deliberately allowed.
    const swapped = rejectSites.filter((site) => /^@"[A-Z0-9_]+"\s*:/.test(site));
    expect(swapped).toEqual([]);
  });

  it('passes a machine code in the CODE slot (second argument) at every site', () => {
    const missingCode = rejectSites.filter((site) => !/\s:@"[A-Z0-9_]+"\s*:/.test(site));
    expect(missingCode).toEqual([]);
  });
});

describe('HardwareKekPlugin.m — L-8: permanent SE invalidation routes to seed recovery', () => {
  it('rejects with the KEK_KEY_PERMANENTLY_INVALIDATED code', () => {
    expect(code).toMatch(/:@"KEK_KEY_PERMANENTLY_INVALIDATED"/);
  });

  it('gates that code on errSecItemNotFound only — a transient status stays generic', () => {
    // errSecInteractionNotAllowed (locked device), errSecAuthFailed, etc. are NOT
    // evidence the key is gone forever. Only "the item is no longer in the keychain"
    // while the ciphertext IS still present means the SE key was destroyed and seed
    // restore is the sole recovery. The generic branch must survive.
    expect(code).toMatch(/errSecItemNotFound/);
    expect(code).toMatch(/:@"SE_KEY_MISSING"/);
  });
});

// ---------------------------------------------------------------------------
// JS classifier — the routing decision itself.
// ---------------------------------------------------------------------------

const getHFFn = vi.fn(async () => ({ h: btoa('x'.repeat(32)) }));
const pluginMock = {
  enroll: vi.fn(async () => ({ keyTier: 'SecureEnclave' })),
  isEnrolled: vi.fn(async () => ({ enrolled: true })),
  getHardwareFactor: getHFFn,
  clearCredential: vi.fn(async () => {}),
};
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
  registerPlugin: () => pluginMock,
}));

const { getHardwareFactor } = await import('../hardware.js');
const { KEK_ERR } = await import('../kek.js');

/** Shape Capacitor produces from `reject:(message):(code)` — code on the error object. */
function bridgeError(message, errCode) {
  return Object.assign(new Error(message), { code: errCode });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getHardwareFactor — classifies on the CODE slot, not only the message', () => {
  it('L-8: iOS permanent SE invalidation → KEY_PERMANENTLY_INVALIDATED (seed recovery)', async () => {
    getHFFn.mockRejectedValueOnce(
      bridgeError(
        'KEK_KEY_PERMANENTLY_INVALIDATED: Hardware key invalidated — biometric enrollment changed',
        'KEK_KEY_PERMANENTLY_INVALIDATED',
      ),
    );
    await expect(getHardwareFactor()).rejects.toMatchObject({
      code: KEK_ERR.KEY_PERMANENTLY_INVALIDATED,
    });
  });

  it('L-8: classifies from .code alone, even if the message carries no code word', async () => {
    // Defence in depth: the native message prose is honesty copy and may be reworded.
    // The code is the contract, so a reworded message must not change the routing.
    getHFFn.mockRejectedValueOnce(
      bridgeError('Your Face ID has changed. Restore from your recovery phrase.',
        'KEK_KEY_PERMANENTLY_INVALIDATED'),
    );
    await expect(getHardwareFactor()).rejects.toMatchObject({
      code: KEK_ERR.KEY_PERMANENTLY_INVALIDATED,
    });
  });

  it('Android legacy message-prefix contract still classifies (no .code on the error)', async () => {
    getHFFn.mockRejectedValueOnce(
      new Error('KEK_KEY_PERMANENTLY_INVALIDATED: Hardware key invalidated — biometric enrollment changed'),
    );
    await expect(getHardwareFactor()).rejects.toMatchObject({
      code: KEK_ERR.KEY_PERMANENTLY_INVALIDATED,
    });
  });

  it('L-7: post-swap iOS errors still land in the wipe-EXEMPT NO_HARDWARE_FACTOR branch', async () => {
    // The whole point of re-checking hardware.js after the swap: the errors that used
    // to arrive as message=CODE now arrive as message=prose, code=CODE. None of them
    // may start incrementing the wrong-PIN wipe counter.
    const iosErrors = [
      ['Device integrity check failed — hardware key access refused (I4)', 'RASP_BLOCK'],
      ['No hardware key enrolled — call enroll() first', 'NOT_ENROLLED'],
      ['Secure Enclave key not found — re-enrollment required', 'SE_KEY_MISSING'],
      ['Face ID authentication failed or was cancelled', 'DECRYPT_FAILED'],
      ['ECIES decrypt not supported on this device', 'ALGO_UNSUPPORTED'],
      ['getHardwareFactor failed: boom', 'GETHF_EXCEPTION'],
    ];
    for (const [message, errCode] of iosErrors) {
      getHFFn.mockRejectedValueOnce(bridgeError(message, errCode));
      await expect(getHardwareFactor()).rejects.toMatchObject({
        code: KEK_ERR.NO_HARDWARE_FACTOR,
      });
    }
  });

  it('a user cancel is still USER_CANCELLED, never a wrong PIN', async () => {
    getHFFn.mockRejectedValueOnce(new Error('User cancelled'));
    await expect(getHardwareFactor()).rejects.toMatchObject({
      code: KEK_ERR.USER_CANCELLED,
    });
  });
});
