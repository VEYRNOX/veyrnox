import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const mixedSrc = readFileSync(resolve(here, '../hw-send.js'), 'utf8');
const trezorOnlySrc = readFileSync(resolve(here, '../hw-send-trezor.js'), 'utf8');

describe('sol hardware-send route isolation', () => {
  it('keeps the Trezor-only module free of the Ledger Solana package', () => {
    expect(trezorOnlySrc).not.toMatch(/^import .*@ledgerhq\/hw-app-solana.*$/m);
    expect(trezorOnlySrc).not.toMatch(/await import\('@ledgerhq\/hw-app-solana'\)/);
  });

  it('lazy-loads the Ledger Solana package inside the Ledger entrypoint', () => {
    expect(mixedSrc).not.toMatch(/^import AppSolana from '@ledgerhq\/hw-app-solana';/m);
    expect(mixedSrc).toMatch(/const \{ default: AppSolana \} = await import\('@ledgerhq\/hw-app-solana'\);/);
  });
});
