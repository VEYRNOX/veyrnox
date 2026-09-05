// The pre-submission IPA check is only as good as its flag list, and the list
// is a checklist a human has to remember to edit.
//
// It shipped covering 3 of the 6 ship-unsafe flags that existed in src/:
// VITE_BYPASS_RASP, VITE_DEV_UNGATE_SEND and VITE_DEMO_MODE were listed;
// VITE_DEV_BYPASS_WALLET_GATE, VITE_SIM_BYPASS_BALANCE and VITE_FORCE_TIER were
// not. The first of those landed on the SAME DAY as the lane. The list was
// copied from CLAUDE.md's hand-run snippet and never re-derived from the code.
//
// This is the same failure shape as the panic-wipe residue list (a new
// localStorage key must be added to ALL_RESIDUE_KEYS, and three times it was
// not) and the release-cert guard (four regressions). The fix that works is not
// "remember harder" — it is a test that fails when the two artifacts disagree.
//
// So: enumerate ship-unsafe flags from src/, and require each to be handled by
// ios/fastlane/Fastfile. A new flag whose name matches the shape rule fails this
// test until someone either adds it to the lane or explicitly classifies it as
// safe below.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const ROOT = process.cwd();
const FASTFILE = resolve(ROOT, 'ios/fastlane/Fastfile');
const SRC = resolve(ROOT, 'src');

/**
 * A flag is ship-unsafe by NAME SHAPE. Deliberately broad: a false positive
 * costs one line of classification below, a false negative ships a bypass.
 */
const SHIP_UNSAFE_SHAPE = /^VITE_(.*BYPASS.*|.*UNGATE.*|DEMO_MODE|FORCE_.*|DEV_.*)$/;

/**
 * Flags matching the shape that are deliberately NOT checked by verify_ipa.
 * Empty today. Adding an entry is a security decision — say why in a comment,
 * and do not use this to silence a flag that simply has not been wired up.
 */
const CLASSIFIED_SAFE = Object.freeze([]);

/**
 * VITE_FORCE_TIER is value-shaped rather than boolean ("safety_plus", not "1"),
 * so the lane matches it with its own regex instead of listing it in
 * SHIP_UNSAFE_BOOLEAN_FLAGS. Handled, just not in the array.
 */
const HANDLED_OUTSIDE_THE_ARRAY = Object.freeze(['VITE_FORCE_TIER']);

function sourceFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      // i18n locale JSON quotes flag names in user-facing copy — not code.
      if (name === 'locales' || name === 'node_modules') continue;
      out.push(...sourceFiles(p));
    } else if (/\.jsx?$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

function shipUnsafeFlagsInSrc() {
  const found = new Set();
  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/VITE_[A-Z0-9_]+/g)) {
      if (SHIP_UNSAFE_SHAPE.test(m[0])) found.add(m[0]);
    }
  }
  return [...found].sort();
}

/**
 * The lane's boolean list, parsed STRUCTURALLY out of the `%w[...]` block
 * rather than by searching the file text.
 *
 * Text search would match the Fastfile's own comments, which name the flags it
 * previously missed — a file that fixes something is the same file that then
 * documents what it fixed, and asserting on raw source text is how two pins on
 * 2026-09-03 ended up passing against a comment.
 */
function laneBooleanFlags() {
  const src = readFileSync(FASTFILE, 'utf8');
  const block = src.match(/SHIP_UNSAFE_BOOLEAN_FLAGS\s*=\s*%w\[([^\]]*)\]/);
  if (!block) return null;
  return block[1].trim().split(/\s+/).filter(Boolean).map((f) => `VITE_${f}`).sort();
}

describe('verify_ipa covers every ship-unsafe build flag', () => {
  it('finds both artifacts and a plausible flag set (guards a vacuous pass)', () => {
    // Without this, a broken path or regex yields two empty sets that trivially
    // agree, and the suite goes green having compared nothing.
    expect(existsSync(FASTFILE), `Fastfile not found at ${FASTFILE}`).toBe(true);
    expect(laneBooleanFlags(), 'SHIP_UNSAFE_BOOLEAN_FLAGS %w[] block not parseable').not.toBeNull();
    expect(laneBooleanFlags().length).toBeGreaterThanOrEqual(5);
    const inSrc = shipUnsafeFlagsInSrc();
    expect(inSrc.length).toBeGreaterThanOrEqual(6);
    expect(inSrc).toContain('VITE_BYPASS_RASP');
  });

  it('every ship-unsafe flag in src/ is handled by the lane', () => {
    // The original defect as an assertion. Mutation defence: delete
    // DEV_BYPASS_WALLET_GATE from the Fastfile array and this goes red.
    const handled = new Set([
      ...laneBooleanFlags(),
      ...HANDLED_OUTSIDE_THE_ARRAY,
      ...CLASSIFIED_SAFE,
    ]);
    for (const flag of shipUnsafeFlagsInSrc()) {
      expect(
        handled.has(flag),
        `${flag} is a ship-unsafe flag in src/ but verify_ipa does not check it — ` +
          `add it to SHIP_UNSAFE_BOOLEAN_FLAGS in ios/fastlane/Fastfile, or classify it in this test`
      ).toBe(true);
    }
  });

  it('the lane matches flag VALUES, not bare names', () => {
    // Vite inlines the whole env object, so every key is present in a clean
    // build. A bare-name grep would fail every release. The old lane got this
    // right and it must stay right.
    const src = readFileSync(FASTFILE, 'utf8');
    expect(src).toContain('%(#{f}:"1")');
    expect(src).toMatch(/VITE_FORCE_TIER:"\(\[\^"\]\+\)"/);
  });

  it('the lane refuses to report clean on an empty bundle read', () => {
    // If the asset glob stops matching, unzip prints nothing and every check
    // finds nothing. Without this guard the lane would pass having read no
    // bytes — a green result that means the opposite of what it says.
    const src = readFileSync(FASTFILE, 'utf8');
    expect(src).toMatch(/bundle\.length < 10_000/);
    expect(src).toContain('Refusing to call the IPA clean');
  });

  it('VITE_BUG_REPORT_ENABLED is gated on the store disclosure, not treated as a dev flag', () => {
    // It is a real ship flag Slice 3 flips on purpose, so it must NOT be in the
    // dev-flag list (that would make an intended release fail). It must still be
    // blocked while the screen-recording disclosure is absent from the listings.
    expect(laneBooleanFlags()).not.toContain('VITE_BUG_REPORT_ENABLED');
    const src = readFileSync(FASTFILE, 'utf8');
    expect(src).toContain('VITE_BUG_REPORT_ENABLED:"1"');
    expect(src).toContain('ALLOW_BUG_REPORT_FLAG');
  });
});
