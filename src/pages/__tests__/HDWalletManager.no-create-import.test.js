// Security regression guard (HIGH silent-vault-overwrite + PIN-cohort lockout, I4).
// HDWalletManager must NOT expose vault-creating "Generate New" or "Import Recovery
// Phrase" surfaces. Those handlers called the raw single-vault createWallet/importWallet
// (→ keyStore.createVault) with NO overwrite guard and NO setAuthModel / deniability-chaff
// provisioning. The correct flows live in WalletEntry (provisionPinWallet) and
// WalletPortfolioPage (addWallet / importAdditionalWallet). This surface is redundant and
// dangerous, so it is removed. The read-only "My Wallets" list + unlock surface stay.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, '../HDWalletManager.jsx'), 'utf8');

describe('HDWalletManager — no vault-creating create/import surface', () => {
  it('has no "Generate New" tab trigger', () => {
    expect(src).not.toMatch(/Generate New/);
  });

  it('has no "Import Recovery Phrase" tab trigger', () => {
    expect(src).not.toMatch(/Import Recovery Phrase/);
  });

  it('does not render create/import "Vault Password" free-text inputs', () => {
    expect(src).not.toMatch(/id="hd-gen-password"/);
    expect(src).not.toMatch(/id="hd-import-password"/);
    expect(src).not.toMatch(/id="hd-import-phrase"/);
  });

  it('no longer calls the raw single-vault createWallet / importWallet', () => {
    expect(src).not.toMatch(/\bcreateWallet\s*\(/);
    expect(src).not.toMatch(/\bimportWallet\s*\(/);
  });

  it('removes the handleGenerate / handleImport handlers', () => {
    expect(src).not.toMatch(/handleGenerate/);
    expect(src).not.toMatch(/handleImport/);
  });

  it('keeps the read-only account/asset list surface and the unlock PinPad', () => {
    // The read-only surface: the derived EVM account card + the status-gated
    // ASSETS list, plus the cohort-correct unlock PinPad, all remain.
    expect(src).toMatch(/Ethereum-compatible Account/);
    expect(src).toMatch(/ASSETS\.map/);
    expect(src).toMatch(/<PinPad[\s\S]*onComplete=\{handleUnlock\}/);
  });
});
