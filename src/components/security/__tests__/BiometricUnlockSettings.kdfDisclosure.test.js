import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';

// Read the component source file to verify the disclosure is present
const componentPath = join(dirname(import.meta.url.replace('file:///', '')), '../BiometricUnlockSettings.jsx');
const componentSource = readFileSync(componentPath, 'utf-8');

describe('BiometricUnlockSettings KDF-bypass disclosure (VULN-1 + VULN-2)', () => {
  it('renders a KDF-bypass disclosure element', () => {
    expect(componentSource).toContain('data-testid="kdf-bypass-disclosure"');
  });

  it('disclosure mentions that the vault password is stored in Keychain', () => {
    expect(componentSource).toMatch(/vault password/i);
    expect(componentSource).toMatch(/keychain|keystore/i);
  });

  it('disclosure mentions that Argon2id / offline brute-force protection is reduced', () => {
    expect(componentSource).toMatch(/Argon2id/);
    expect(componentSource).toMatch(/offline/i);
  });
});
