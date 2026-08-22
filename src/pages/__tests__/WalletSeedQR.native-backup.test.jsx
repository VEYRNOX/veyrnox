import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, '../WalletSeedQR.jsx'), 'utf8');

describe('WalletSeedQR native backup hardening', () => {
  it('does not write a plaintext PDF to Capacitor Filesystem cache', () => {
    expect(src).not.toMatch(/Filesystem\.writeFile/);
    expect(src).not.toContain('Directory.Cache');
  });

  it('does not hand the recovery phrase PDF to the OS share sheet', () => {
    expect(src).not.toMatch(/Share\.share/);
  });

  it('requires a minimum backup-password length before generating the QR', () => {
    expect(src).toMatch(/backupPassword\.length\s*<\s*MIN_PASSWORD_LENGTH/);
  });
});
