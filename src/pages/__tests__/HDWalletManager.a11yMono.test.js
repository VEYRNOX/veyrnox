// Design-system + accessibility guards for the asset-row balance UI.
//
// Covers four findings from the 2026-07-19 branch review of eaf7361a:
//
//  F4 (design-system) — balance AMOUNTS rendered in the default sans face.
//     index.css:211-213 states verifiable values ("addresses, amounts, fees,
//     chain IDs, hashes") render in IBM Plex Mono via `.mono-value` or
//     Tailwind `font-mono`. The adjacent address line already complies;
//     the amounts did not.
//
//  F6 (a11y) — the error state carried its meaning ONLY in a `title` on a
//     non-focusable, non-interactive <span>. `title` there is not reliably
//     announced by screen readers and cannot be surfaced by keyboard, so AT
//     users got nothing and sighted mouse users saw a bare em-dash.
//     (WCAG 1.1.1 / 4.1.2)
//
//  F7 (a11y) — loading/error transitions had no live region and the "…"
//     glyph had no accessible name, so the async resolve was silent.
//     NOTE: these balances refetch every 20-30s, so the live region is scoped
//     to the loading/error states ONLY. Putting aria-live on the resolved
//     value would re-announce the balance on every poll.
//
//  F8 (a11y) — the asset disclosure button had no aria-expanded/aria-controls;
//     open/closed state was conveyed solely by a chevron icon carrying neither
//     aria-hidden nor an accessible name.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, '../HDWalletManager.jsx'), 'utf8');

// The three live-balance components whose amount spans are verifiable values.
const AMOUNT_RENDERERS = ['AssetLiveBalance', 'BtcLiveBalance', 'SolLiveBalance'];

/**
 * Body of a top-level `function Name(...) { ... }` block.
 * Skips the parameter list first — these components destructure their props
 * (`function BtcLiveBalance({ address, networkKey })`), so the first `{` after
 * the name is the PARAMETER brace, not the body.
 */
function componentBody(name) {
  const start = src.indexOf(`function ${name}(`);
  if (start === -1) return '';
  // Walk the parameter list to its matching ')'.
  let p = src.indexOf('(', start);
  let pd = 0;
  let i = -1;
  for (let j = p; j < src.length; j++) {
    if (src[j] === '(') pd++;
    else if (src[j] === ')') { pd--; if (pd === 0) { i = src.indexOf('{', j); break; } }
  }
  if (i === -1) return '';
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(i, j + 1); }
  }
  return '';
}

describe('F4 — balance amounts render in IBM Plex Mono', () => {
  it.each(AMOUNT_RENDERERS)('%s renders its amount with font-mono', (name) => {
    const body = componentBody(name);
    expect(body, `component ${name} not found`).not.toBe('');
    // The success return is the one interpolating a formatted number.
    const successLine = body
      .split('\n')
      .find(l => l.includes('toLocaleString'));
    expect(successLine, `${name} has no toLocaleString amount line`).toBeTruthy();
    expect(successLine).toMatch(/font-mono|mono-value/);
  });

  it('does not regress the address line, which was already mono', () => {
    expect(src).toMatch(/text-xs text-muted-foreground font-mono truncate/);
  });
});

describe('F6/F7 — balance loading + error states are accessible', () => {
  it('exposes a shared pending state with an accessible name, not a bare glyph', () => {
    expect(src).toMatch(/Loading balance/);
  });

  it('exposes the error meaning as real text, not only a title attribute', () => {
    expect(src).toMatch(/Balance unavailable/);
  });

  it('scopes a live region to the transient states', () => {
    expect(src).toMatch(/role="status"/);
  });

  it('marks the decorative glyphs aria-hidden', () => {
    // The … and — are decorative once an sr-only label carries the meaning.
    expect(src).toMatch(/aria-hidden="true">…/);
    expect(src).toMatch(/aria-hidden="true">—/);
  });

  it('does NOT put a live region on the resolved amount (would re-announce every poll)', () => {
    for (const name of AMOUNT_RENDERERS) {
      const successLine = componentBody(name)
        .split('\n')
        .find(l => l.includes('toLocaleString')) || '';
      expect(successLine).not.toMatch(/aria-live|role="status"/);
    }
  });

  it('keeps the three balance components free of duplicated inline state markup', () => {
    // The loading/error markup is shared, so the a11y attributes cannot drift
    // between the EVM, BTC and SOL paths the way they would if triplicated.
    const occurrences = (src.match(/Loading balance/g) || []).length;
    expect(occurrences).toBe(1);
  });
});

describe('F8 — asset disclosure button announces its state', () => {
  it('sets aria-expanded from the open state', () => {
    expect(src).toMatch(/aria-expanded=\{[^}]*exp[^}]*\}/);
  });

  it('associates the button with the panel it controls', () => {
    expect(src).toMatch(/aria-controls=/);
    // The panel must actually carry the id the button points at.
    expect(src).toMatch(/id=\{`asset-panel-\$\{asset\.symbol\}`\}/);
  });

  it('hides the decorative chevrons from assistive tech', () => {
    const chevrons = src.match(/<Chevron(?:Down|Right)[^/]*\/>/g) || [];
    const inRow = chevrons.filter(c => c.includes('text-muted-foreground'));
    expect(inRow.length).toBeGreaterThan(0);
    for (const c of inRow) {
      expect(c, `chevron missing aria-hidden: ${c}`).toMatch(/aria-hidden/);
    }
  });
});
