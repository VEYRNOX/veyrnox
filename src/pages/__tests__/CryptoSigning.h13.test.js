// Structural regression guard for audit finding H13 in CryptoSigning.jsx.
//
// After the real-wallet rewrite, H13 part (1) is moot in the STRONGEST way: the
// page copies NO secret at all (no mnemonic, no private key), so there is no
// clipboard-leak surface to wipe. What remains to pin:
//  (1) No secret is ever copied — makeCopy only handles PUBLIC values (address,
//      signature), and no mnemonic/privateKey copy call exists.
//  (2) The signing operation still runs behind a RASP pre-sign gate —
//      automation/WebDriver must not drive signing unchecked.
//
// Structural source-scan, matching SendCrypto.confirmation.test.js.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, '../CryptoSigning.jsx'), 'utf8');

describe('CryptoSigning — H13: no secret is ever copied to the clipboard', () => {
  it('does not import or call the wiping copySecret (no secret to wipe)', () => {
    // The module path @/lib/copySecret is fine; what must be absent is the
    // copySecret binding itself (named import + any call).
    expect(src).not.toMatch(/\{\s*copySecret\b/);
    expect(src).not.toMatch(/\bcopySecret\s*\(/);
  });

  it('makes no mnemonic or private-key copy call', () => {
    expect(src).not.toMatch(/mnemonicRef/);
    expect(src).not.toMatch(/walletRef/);
    expect(src).not.toMatch(/privateKey/);
  });

  it('does not write to the clipboard directly (no bare navigator.clipboard.writeText)', () => {
    expect(src).not.toMatch(/navigator\.clipboard\.writeText/);
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
