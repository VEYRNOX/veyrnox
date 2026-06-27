// kek.honesty.test.js — H14/H15 honesty source-scan (I4: fail honest, no fake security).
//
// These tests pin the HONESTY CONTRACT, not crypto behaviour. They read the native
// KEK plugins and the user-facing KEK status string as TEXT and assert they do NOT
// overstate the hardware protection actually delivered:
//   H14 (iOS): kSecClassGenericPassword is regular Keychain, NOT the Secure Enclave.
//   H15 (Android): setIsStrongBoxBacked is best-effort; StrongBox is NOT enforced.
//
// Copy can change; the contract is "no unqualified SE/hardware-backed/StrongBox claim".

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../..');

function read(rel) {
  return readFileSync(resolve(repoRoot, rel), 'utf8');
}

const SWIFT = 'ios/App/App/HardwareKekPlugin.swift';
const KT = 'android/app/src/main/java/com/veyrnox/app/HardwareKekPlugin.kt';
const SETTINGS_UI = 'src/components/security/HardwareKekSettings.jsx';

// A "Secure Enclave" mention is only honest if it is explicitly a NOT-claim
// (e.g. "not Secure Enclave", "not the Secure Enclave"). Any other mention is a
// storage claim the plugin does not deliver.
function hasMisleadingSecureEnclave(text) {
  const re = /Secure Enclave/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const before = text.slice(Math.max(0, m.index - 24), m.index).toLowerCase();
    if (!/not\s+(the\s+)?$/.test(before)) return true; // a mention that is NOT a not-claim
  }
  return false;
}

describe('H14 — iOS HardwareKekPlugin.swift does not claim Secure Enclave storage', () => {
  const swift = read(SWIFT);

  it('contains no Secure Enclave storage claim (only allowed as a "not Secure Enclave" caveat)', () => {
    expect(hasMisleadingSecureEnclave(swift)).toBe(false);
  });

  it('documents that storage is standard Keychain, not the Secure Enclave (H14)', () => {
    expect(swift).toMatch(/not\s+(the\s+)?Secure Enclave/i);
    expect(swift).toMatch(/H14/);
  });

  it('does not use an unqualified "hardware-backed" claim', () => {
    expect(swift).not.toMatch(/hardware-backed/i);
  });
});

describe('H15 — Android HardwareKekPlugin.kt does not claim enforced StrongBox/hardware backing', () => {
  const kt = read(KT);

  it('does not use an unqualified "hardware-backed" or "StrongBox-backed" claim', () => {
    expect(kt).not.toMatch(/hardware-backed/i);
    expect(kt).not.toMatch(/StrongBox-backed/i);
  });

  it('documents that StrongBox is NOT enforced (TEE-or-software fallback) — H15', () => {
    expect(kt).toMatch(/StrongBox[^\n]*not enforced/i);
    expect(kt).toMatch(/H15/);
  });
});

describe('H14/H15 — user-facing KEK status string uses honest device-bound language', () => {
  const ui = read(SETTINGS_UI);

  it('does not present "Secure Enclave" as the storage mechanism to users', () => {
    expect(hasMisleadingSecureEnclave(ui)).toBe(false);
  });
});
