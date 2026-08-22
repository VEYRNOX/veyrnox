// Structural regression guard for the Digital Shield import surface on the
// Hardware Wallet page. This follows the existing source-pin style used for the
// large Send screen and other integration-heavy routes.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, '../HardwareWalletPage.jsx'), 'utf8');

describe('HardwareWalletPage — Digital Shield import surface', () => {
  it('reads Digital Shield state from the shared context', () => {
    expect(src).toMatch(/useDigitalShield/);
    expect(src).toMatch(/importProfile/);
    expect(src).toMatch(/clearProfile/);
  });

  it('offers a dedicated import flow and a generic UR scanner path', () => {
    expect(src).toContain('Import Digital Shield');
    expect(src).toMatch(/Scan Digital Shield QR/);
    expect(src).toMatch(/normalizeUrScan/);
    expect(src).toMatch(/<QRScanner/);
  });

  it('describes the public-only import model and shows the three supported account families', () => {
    expect(src).toContain('Imported public account data only');
    expect(src).toMatch(/label="EVM"/);
    expect(src).toMatch(/label="BTC"/);
    expect(src).toMatch(/label="SOL"/);
  });
});
