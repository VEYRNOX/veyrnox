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

  it('does not promise an in-app QR restore path that is not built', () => {
    expect(src).toContain('Seed Key QR unavailable');
    expect(src).toContain('In-app QR restore is not built yet');
    expect(src).toContain('Use Personal Backup for an encrypted export with a restore path');
    expect(src).not.toContain('Generate Seed Key QR');
  });
});
