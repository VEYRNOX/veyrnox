// Slice I — Have flow uses SeedInputGrid, not a raw textarea.
//
// Bug: `WalletEntry.jsx:1741` renders `<textarea id="wallet-seed-import-pin">`
// for seed import — inconsistent with the per-word grid the rest of the app
// uses, and no paste-split.
//
// Fix: swap in `<SeedInputGrid>` whose `onSubmit(mnemonic)` closure preserves
// the existing referral side-effect (`setPendingReferral` on non-empty input)
// and calls `doImportWallet(mnemonicOverride)`.
//
// Source-scan tests are the exact RED/GREEN contract here. Mount-based
// coverage would require the full PIN-first walk (see kek-gate.test.jsx for
// the mock surface). The source-scan asserts on the shape of the Have branch,
// which is unambiguous.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(resolve(here, '..', 'WalletEntry.jsx'), 'utf8');

// The Have-branch import sub-form is anchored on the amber
// "Never type your seed phrase anywhere..." warning. Take a 3 KB window after
// the anchor so we can grep the Have-form region without matching unrelated
// occurrences elsewhere in the file.
function haveBranchSlice() {
  const anchor = SRC.indexOf("Never type your seed phrase");
  if (anchor === -1) return '';
  return SRC.slice(anchor, anchor + 3000);
}

describe('WalletEntry — Have flow uses <SeedInputGrid> (Slice I)', () => {
  it('imports SeedInputGrid', () => {
    expect(SRC).toMatch(/from\s+['"]@\/components\/SeedInputGrid['"]/);
  });

  it('the Have import sub-form renders <SeedInputGrid ...>', () => {
    const slice = haveBranchSlice();
    expect(slice.length).toBeGreaterThan(0);
    expect(slice).toMatch(/<SeedInputGrid\b/);
  });

  it('the Have import sub-form no longer renders the raw <textarea id="wallet-seed-import-pin">', () => {
    const slice = haveBranchSlice();
    expect(slice).not.toMatch(/textarea[^>]*id=["']wallet-seed-import-pin["']/);
  });

  it('the Have onSubmit closure passes the mnemonic to doImportWallet (override signature)', () => {
    const slice = haveBranchSlice();
    // The onSubmit closure receives the mnemonic from SeedInputGrid and passes
    // it forward. Match either `doImportWallet(mnemonic)` or an explicit await
    // call — both preserve the override.
    expect(slice).toMatch(/doImportWallet\s*\(\s*mnemonic\b/);
  });

  it('the Have onSubmit closure preserves the setPendingReferral side-effect on non-empty invite input', () => {
    const slice = haveBranchSlice();
    // Same shape as the pre-Slice-I inline handler:
    //   if (referralInput.trim()) setPendingReferral(referralInput.trim().toUpperCase());
    expect(slice).toMatch(/referralInput\.trim\(\)\s*\)\s*setPendingReferral/);
  });

  it('doImportWallet accepts a mnemonic override parameter', () => {
    // Currently `doImportWallet = async () => { ... importPhrasePin ... }` —
    // the fix adds `(mnemonicOverride)` matching doCreateWallet's pattern.
    expect(SRC).toMatch(/doImportWallet\s*=\s*async\s*\(\s*mnemonicOverride\s*\)/);
  });
});
