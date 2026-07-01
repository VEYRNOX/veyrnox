// kek.honesty.test.js — H-NEW-D/H15 honesty source-scan (I4: fail honest, no fake security).
//
// These tests pin the HONESTY CONTRACT, not crypto behaviour. They read the native
// KEK plugins and the user-facing KEK status string as TEXT and assert they do NOT
// overstate the hardware protection actually delivered:
//   H-NEW-D (iOS): Secure Enclave P-256 ECIES with non-extractable key + biometric ACL.
//   H15 (Android): setIsStrongBoxBacked is best-effort; StrongBox is NOT enforced.
//
// Copy can change; the contract is "document mechanisms accurately, qualify all claims".

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../..');

function read(rel) {
  return readFileSync(resolve(repoRoot, rel), 'utf8');
}

const SWIFT = 'ios/App/App/HardwareKekPlugin.swift'; // may not exist (see ObjC path below)
const OBJC = 'ios/App/App/HardwareKekPlugin.m';    // ObjC implementation (current)
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

describe('H-NEW-D — iOS HardwareKekPlugin is honest about SE-ECIES implementation status', () => {
  // Use the ObjC .m if present (current); fall back to .swift if it exists.
  const iosPath = existsSync(resolve(repoRoot, OBJC)) ? OBJC
    : existsSync(resolve(repoRoot, SWIFT)) ? SWIFT
    : null;

  if (!iosPath) {
    it.skip('skipped: neither HardwareKekPlugin.m nor .swift found (Phase 2)', () => {});
    return;
  }
  const src = read(iosPath);

  // When the real SE-ECIES implementation is not present, the plugin MUST be
  // honest-disabled (I4) and must NOT pretend to deliver hardware binding.
  // Real ECIES: Swift uses sharedSecretFromKeyAgreement/AES.GCM.seal;
  // ObjC/Apple uses SecKeyCreateEncryptedData/SecKeyCreateDecryptedData.
  const hasRealEcies = (
    /sharedSecretFromKeyAgreement|AES\.GCM\.seal|SecKeyCreateEncryptedData|SecKeyCreateDecryptedData/i.test(src)
  ) && !/NOT_IMPLEMENTED|HONEST.DISABLED/i.test(src);

  if (hasRealEcies) {
    // Real implementation path — verify full ECIES honesty contract.
    it('documents that the SE private key is non-extractable (I4)', () => {
      expect(src).toMatch(/non-extractable|never leaves/i);
      expect(src).toMatch(/Secure Enclave|coprocessor/i);
    });
    it('documents biometric ACL requirement (.biometryCurrentSet)', () => {
      expect(src).toMatch(/biometric|Face ID|Touch ID/i);
      expect(src).toMatch(/ACL|access.?control/i);
    });
    it('documents UNAUDITED-PROVISIONAL status', () => {
      expect(src).toMatch(/UNAUDITED-PROVISIONAL|awaiting.*audit/i);
      expect(src).toMatch(/H-NEW-D/);
    });
    it('documents ECIES encryption scheme (ephemeral ECDH + HKDF + AES-GCM)', () => {
      expect(src).toMatch(/ECIES|ephemeral|ECDH|AES-GCM/i);
    });
  } else {
    // Stub / honest-disable path — verify the file is NOT pretending to be real SE-ECIES.
    it('is honest-disabled (enroll/getHardwareFactor reject with NOT_IMPLEMENTED)', () => {
      expect(src).toMatch(/NOT_IMPLEMENTED|HONEST.DISABLED/i);
    });
    it('documents the H-NEW-D audit gate', () => {
      expect(src).toMatch(/H-NEW-D/);
    });
    it('does not falsely claim H is SE-ECIES-wrapped while storing it in plaintext', () => {
      // Match any storeKeychainItem call for KEY_ENC_H regardless of local variable name
      // (encH, hData, etc.) — the old regex used "hData" and missed "encH".
      const storesH = /storeKeychainItem[^;]*KEY_ENC_H/i.test(src);
      const hasEciesBeforeStore = /SecKeyCreateEncryptedData|AES\.GCM\.seal|sharedSecretFromKeyAgreement/i.test(src);
      if (storesH && !hasEciesBeforeStore) {
        // Storing H without ECIES is only acceptable if the method is honest-disabled.
        expect(src).toMatch(/NOT_IMPLEMENTED|HONEST.DISABLED/i);
      }
    });
  }
});

describe('H15 — Android HardwareKekPlugin.kt does not claim enforced StrongBox/hardware backing', () => {
  // Phase 2: native plugins not yet implemented. Skip this test if the file doesn't exist.
  if (!existsSync(resolve(repoRoot, KT))) {
    it.skip('skipped: HardwareKekPlugin.kt not yet implemented (Phase 2)', () => {});
    return;
  }
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
