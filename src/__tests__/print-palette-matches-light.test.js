// src/__tests__/print-palette-matches-light.test.js
//
// The @media print block redefines the semantic colour tokens so that every
// descendant using bg-background / bg-card / text-foreground / etc. flips to a
// paper palette. It cannot reuse the `.light` block directly — CSS has no way
// to apply a class from inside a media query — so the values are duplicated.
//
// Duplication is only acceptable with a guard, and this is it: every token the
// print block declares must hold exactly the value `.light` gives it. Without
// this, someone retunes a light-theme colour for contrast and print silently
// keeps the old one.
//
// Also pins the security property the print block is built around: hiding is
// opt-in. Several full-viewport `fixed` overlays exist to CONCEAL (see
// LockSealingOverlay), so a rule that hides by shape would print the content
// underneath a curtain.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(here, '../index.css'), 'utf8');

/** Return the body of the first block whose header matches `startRe`. */
function blockBody(startRe) {
  const m = css.match(startRe);
  if (!m) return null;
  const open = css.indexOf('{', m.index + m[0].length - 1);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  return null;
}

function tokensIn(body) {
  const out = {};
  for (const m of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    out[m[1]] = m[2].replace(/\/\*.*?\*\//gs, '').trim();
  }
  return out;
}

const printBlock = blockBody(/@media\s+print\s*\{/);
const lightBlock = blockBody(/\n\s*\.light\s*\{/);

describe('print stylesheet', () => {
  it('parsed both the @media print and .light blocks', () => {
    // Sentinel: without this, every comparison below passes vacuously if the
    // file is restructured and a regex stops matching.
    expect(printBlock).toBeTruthy();
    expect(lightBlock).toBeTruthy();
  });

  it('declares a paper palette at all (not just html/body colours)', () => {
    const printRoot = blockBody(/@media\s+print\s*\{\s*\/\*[\s\S]*?\*\/\s*:root\s*\{/)
      ?? printBlock;
    expect(Object.keys(tokensIn(printRoot)).length).toBeGreaterThan(8);
  });

  it('every token the print block declares matches the .light value', () => {
    const printTokens = tokensIn(printBlock);
    const lightTokens = tokensIn(lightBlock);
    const drifted = Object.entries(printTokens)
      .filter(([name]) => name in lightTokens)
      .filter(([name, value]) => value !== lightTokens[name])
      .map(([name, value]) => `${name}: print=${value} light=${lightTokens[name]}`);
    expect(drifted).toEqual([]);
  });

  it('declares no token that .light does not define (typo guard)', () => {
    const lightTokens = tokensIn(lightBlock);
    const unknown = Object.keys(tokensIn(printBlock)).filter((n) => !(n in lightTokens));
    expect(unknown).toEqual([]);
  });

  it('never hides by shape — hiding is opt-in, so curtains stay put', () => {
    // A blanket `.fixed { display: none }` printed the wallet page underneath
    // LockSealingOverlay. Shape does not distinguish chrome from a curtain.
    const hideByShape = [
      /\.fixed\s*\{[^}]*display\s*:\s*none/,
      /\[class\*=["']z-["']\]\s*\{[^}]*display\s*:\s*none/,
      /\[aria-hidden\]\s*\{[^}]*display\s*:\s*none/,
    ].filter((re) => re.test(printBlock));
    expect(hideByShape).toEqual([]);
  });

  it('resets .app-shell, whose fixed/overflow-hidden clips print on mobile', () => {
    expect(printBlock).toMatch(/\.app-shell\s*\{[^}]*position\s*:\s*static/);
    expect(printBlock).toMatch(/\.app-shell\s*\{[^}]*overflow\s*:\s*visible/);
  });
});
