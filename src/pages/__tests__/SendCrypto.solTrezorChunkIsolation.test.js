import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, '../SendCrypto.jsx'), 'utf8');

describe('SendCrypto — SOL Trezor chunk isolation', () => {
  it('loads the Trezor SOL helper from the isolated module', () => {
    expect(src).toMatch(/async function loadTrezorSolSender\(\)/);
    expect(src).toMatch(/import\('\.\.\/wallet-core\/sol\/hw-send-trezor\.js'\)/);
  });

  it('does not route the SOL Trezor helper through the mixed Ledger+Trezor module', () => {
    const loaderIdx = src.indexOf('async function loadTrezorSolSender()');
    expect(loaderIdx).toBeGreaterThan(-1);
    const loaderRegion = src.slice(loaderIdx, loaderIdx + 300);
    expect(loaderRegion).not.toMatch(/hw-send\.js'\)/);
  });
});
