// kek.doc-accuracy.test.js — L5 (ECC Hardware KEK audit): doc comments describe the
// SHIPPED cross-platform facade accurately.
//
// The shipped iOS plugin (HardwareKekPlugin.m) uses a NON-EXTRACTABLE Secure Enclave
// P-256 key; only the ECIES *ciphertext* of H sits in the generic Keychain, and the
// decrypting private key never leaves the Secure Enclave. Two internal comments
// previously described an OLD model ("iOS = generic Keychain, NOT the Secure Enclave"
// and an Android-only header referencing a nonexistent HardwareKekPlugin.swift). L5
// corrects them.
//
// This guard is NARROW: it pins that the INTERNAL developer comments in kek.js /
// hardware.js are technically accurate about iOS SE-ECIES. It deliberately does NOT
// touch the USER-FACING overclaim guard (kek.honesty.test.js asserts the settings UI
// must not present "Secure Enclave" to users) — accurate internal docs and honest
// user-facing copy are separate contracts.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(here, rel), 'utf8');

describe('L5 — kek.js H-factor comment matches the shipped iOS SE-ECIES model', () => {
  const src = read('../kek.js');

  it('does NOT repeat the false "iOS = standard Keychain, NOT the Secure Enclave" claim', () => {
    // The exact false phrases from the old comment must be gone.
    expect(src).not.toMatch(/kSecClassGenericPassword\)?,?\s*NOT the Secure Enclave/i);
    expect(src).not.toMatch(/lives in the\s+standard Keychain[\s\S]{0,60}NOT the Secure Enclave/i);
  });

  it('accurately states the iOS wrapping key is a non-extractable Secure Enclave key', () => {
    expect(src).toMatch(/Secure Enclave/);
    expect(src).toMatch(/non-extractable/i);
  });

  it('states only the ECIES ciphertext of H sits in the Keychain (not the key)', () => {
    expect(src).toMatch(/ciphertext/i);
    expect(src).toMatch(/ECIES/i);
  });

  it('still describes Android as AndroidKeyStore with StrongBox preferred not enforced', () => {
    expect(src).toMatch(/AndroidKeyStore/);
    expect(src).toMatch(/StrongBox[\s\S]{0,40}not\s+enforced/i);
  });
});

describe('L5 — hardware.js header describes the cross-platform facade (no .swift ghost)', () => {
  const src = read('../hardware.js');

  it('does NOT reference the nonexistent HardwareKekPlugin.swift', () => {
    expect(src).not.toMatch(/HardwareKekPlugin\.swift/);
  });

  it('references the shipped native impls (Android .kt HMAC + iOS .m SE-ECIES)', () => {
    expect(src).toMatch(/HardwareKekPlugin\.kt/);
    expect(src).toMatch(/HardwareKekPlugin\.m/);
  });

  it('describes iOS Secure Enclave ECIES, not an Android-only facade', () => {
    expect(src).toMatch(/Secure Enclave/);
    expect(src).toMatch(/ECIES/i);
  });
});
