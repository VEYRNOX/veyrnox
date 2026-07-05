// src/validation-sweep/__tests__/check-deniability-strings.test.js
//
// Unit tests for the CI guard scripts/check-deniability-strings.mjs — the
// deniability-string scanner (Brief A). Follows the codebase's established
// idiom (see src/validation-sweep/__tests__/deniability-wallet-count.test.js):
// assert over SOURCE text with inline fixtures, since the scanner itself is a
// pure text-matcher (scanSource(source, filename) → hits[]).
//
// Rule classes under test:
//   1a — JSX-text / template-literal interpolation of a wallet/set-collection
//        count (`{wallets.length}`, `{stealthWallets.length}`,
//        `` `You have ${wallets.length} wallets` ``).
//   1b — count-driven grammatical number (`unbacked.length === 1 ? "" : "s"`).
//   2  — raw-seed clipboard writes (`clipboard.writeText(mnemonic)`), excluding
//        the sanctioned src/lib/secureClipboard.js and src/lib/copySecret.js
//        paths and test files.
//
// Precision requirements (must NOT false-positive): bare logic/conditional
// uses (`=== 0 ?` empty state, `> 0 &&` presence guard, `> 1` boolean prop),
// comments, and non-wallet collections (`transactions.length`).

import { describe, it, expect } from 'vitest';
import { scanSource } from '../../../scripts/check-deniability-strings.mjs';

function rules(hits) {
  return hits.map((h) => h.rule);
}

describe('rule 1a — JSX text / template-literal count interpolation', () => {
  it('flags a JSX header interpolating {wallets.length} next to prose', () => {
    const src = `
      function Header() {
        return <h1>{wallets.length} wallets</h1>;
      }
    `;
    const hits = scanSource(src, 'src/pages/Fixture.jsx');
    expect(hits.length).toBeGreaterThan(0);
    expect(rules(hits)).toContain('D1a-jsx-interp');
  });

  it('flags {stealthWallets.length} interpolation in JSX copy', () => {
    const src = `
      function Panel() {
        return <p>Your visible wallets ({stealthWallets.length}):</p>;
      }
    `;
    const hits = scanSource(src, 'src/pages/Fixture.jsx');
    expect(rules(hits)).toContain('D1a-jsx-interp');
  });

  it('flags the template-literal form `You have ${wallets.length} wallets`', () => {
    const src = `
      const label = \`You have \${wallets.length} wallets\`;
    `;
    const hits = scanSource(src, 'src/pages/Fixture.jsx');
    expect(rules(hits)).toContain('D1a-template-interp');
  });

  it('flags the real fixed-site shape on BOTH 1a and 1b', () => {
    const src = `
      function Banner() {
        return (
          <b>{unbacked.length} wallet{unbacked.length === 1 ? "" : "s"} not backed up.</b>
        );
      }
    `;
    const hits = scanSource(src, 'src/pages/Fixture.jsx');
    expect(rules(hits)).toContain('D1a-jsx-interp');
    expect(rules(hits)).toContain('D1b-plural-ternary');
  });
});

describe('rule 1b — count-driven grammatical number', () => {
  it('flags a plural ternary on a guarded identifier', () => {
    const src = `
      const suffix = wallets.length === 1 ? "" : "s";
    `;
    const hits = scanSource(src, 'src/pages/Fixture.jsx');
    expect(rules(hits)).toContain('D1b-plural-ternary');
  });

  it('flags a > 1 plural ternary form', () => {
    const src = `
      const suffix = decoys.length > 1 ? "s" : "";
    `;
    const hits = scanSource(src, 'src/pages/Fixture.jsx');
    expect(rules(hits)).toContain('D1b-plural-ternary');
  });
});

describe('precision requirements — must NOT false-positive', () => {
  it('misses a bare empty-state guard: wallets.length === 0 && <Empty/>', () => {
    const src = `
      function List() {
        return wallets.length === 0 && <Empty/>;
      }
    `;
    const hits = scanSource(src, 'src/pages/Fixture.jsx');
    expect(hits).toEqual([]);
  });

  it('misses a bare boolean prop: canRemove={wallets.length > 1}', () => {
    const src = `
      function Row() {
        return <Item canRemove={wallets.length > 1} />;
      }
    `;
    const hits = scanSource(src, 'src/pages/Fixture.jsx');
    expect(hits).toEqual([]);
  });

  it('misses a commented-out reference: // wallets.length', () => {
    const src = `
      // wallets.length
      function Noop() {}
    `;
    const hits = scanSource(src, 'src/pages/Fixture.jsx');
    expect(hits).toEqual([]);
  });

  it('misses a block-commented reference: /* {wallets.length} wallets */', () => {
    const src = `
      /* {wallets.length} wallets */
      function Noop() {}
    `;
    const hits = scanSource(src, 'src/pages/Fixture.jsx');
    expect(hits).toEqual([]);
  });

  it('misses transactions.length (not a wallet/set collection)', () => {
    const src = `
      function Header() {
        return <h1>{transactions.length} transactions</h1>;
      }
    `;
    const hits = scanSource(src, 'src/pages/Fixture.jsx');
    expect(hits).toEqual([]);
  });

  it('misses a presence guard: wallets.length > 0 && <List/>', () => {
    const src = `
      function List() {
        return wallets.length > 0 && <List/>;
      }
    `;
    const hits = scanSource(src, 'src/pages/Fixture.jsx');
    expect(hits).toEqual([]);
  });
});

describe('rule 2 — raw seed clipboard writes', () => {
  it('flags navigator.clipboard.writeText(mnemonic)', () => {
    const src = `
      function copy() {
        navigator.clipboard.writeText(mnemonic);
      }
    `;
    const hits = scanSource(src, 'src/pages/Fixture.jsx');
    expect(rules(hits)).toContain('D-seed-clipboard');
  });

  it('misses navigator.clipboard.writeText(address)', () => {
    const src = `
      function copy() {
        navigator.clipboard.writeText(address);
      }
    `;
    const hits = scanSource(src, 'src/pages/Fixture.jsx');
    expect(hits).toEqual([]);
  });

  it('misses the same code when the file is the sanctioned copySecret.js path', () => {
    const src = `
      export async function copySecret(mnemonic) {
        await navigator.clipboard.writeText(mnemonic);
      }
    `;
    const hits = scanSource(src, 'src/lib/copySecret.js');
    expect(hits).toEqual([]);
  });

  it('misses the same code when the file is the sanctioned secureClipboard.js path', () => {
    const src = `
      export async function copySensitive(mnemonic) {
        await navigator.clipboard.writeText(mnemonic);
      }
    `;
    const hits = scanSource(src, 'src/lib/secureClipboard.js');
    expect(hits).toEqual([]);
  });

  it('flags other seed-identifier aliases (seedPhrase, recoveryPhrase, generatedSeed, savedPhrase)', () => {
    expect(rules(scanSource('clipboard.writeText(seedPhrase);', 'src/pages/Fixture.jsx'))).toContain('D-seed-clipboard');
    expect(rules(scanSource('clipboard.writeText(recoveryPhrase);', 'src/pages/Fixture.jsx'))).toContain('D-seed-clipboard');
    expect(rules(scanSource('clipboard.writeText(generatedSeed);', 'src/pages/Fixture.jsx'))).toContain('D-seed-clipboard');
    expect(rules(scanSource('clipboard.writeText(savedPhrase);', 'src/pages/Fixture.jsx'))).toContain('D-seed-clipboard');
  });
});
