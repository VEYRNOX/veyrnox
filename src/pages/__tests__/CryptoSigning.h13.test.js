// Structural regression guard for audit finding H13 in CryptoSigning.jsx.
//
// H13 has two parts:
//  (1) Secrets (BIP-39 mnemonic, private key) were copied to the OS clipboard via
//      a bare navigator.clipboard.writeText(), bypassing copySecret()'s 30s wipe.
//      On Android the clipboard/keyboard history retains secrets indefinitely.
//  (2) The signing operations (signMessage / signTransaction) ran with NO RASP
//      pre-sign gate — automation/WebDriver could drive signing unchecked.
//
// This codebase pins send-flow / signing-path wiring STRUCTURALLY (it reads the
// page source) rather than mounting the full signer stack — see
// SendCrypto.confirmation.test.js. We follow that established pattern here.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, '../CryptoSigning.jsx'), 'utf8');

describe('CryptoSigning — H13: secrets use the wiping copySecret(), never a bare clipboard write', () => {
  it('imports copySecret from lib/copySecret', () => {
    expect(src).toMatch(/import\s*\{\s*copySecret\s*\}\s*from\s*["']@\/lib\/copySecret["']/);
  });

  it('does not write to the clipboard directly (no bare navigator.clipboard.writeText)', () => {
    expect(src).not.toMatch(/navigator\.clipboard\.writeText/);
  });

  it('routes the mnemonic copy through copySecret', () => {
    expect(src).toMatch(/copySecret\(\s*mnemonic/);
  });

  it('routes the private key copy through copySecret', () => {
    expect(src).toMatch(/copySecret\(\s*wallet\.privateKey/);
  });
});

describe('CryptoSigning — H13: RASP pre-sign gate guards signing', () => {
  it('imports presignGate from the sign-gate module', () => {
    expect(src).toMatch(/import\s*\{\s*presignGate\s*\}\s*from\s*["']@\/sign-gate\/presign["']/);
  });

  it('imports the RASP detect/degrade primitives', () => {
    expect(src).toMatch(/from\s*["']@\/rasp["']/);
    expect(src).toMatch(/\bdetect\b/);
    expect(src).toMatch(/\bdegrade\b/);
    expect(src).toMatch(/browserProbeSource/);
  });

  it('calls presignGate and refuses to sign when the gate does not allow proceeding', () => {
    expect(src).toMatch(/presignGate\(/);
    expect(src).toMatch(/proceedAllowed|signerReachable/);
  });
});
