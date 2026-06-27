// src/lib/__tests__/copySecret.harden.test.js
//
// H-NEW-3 — harden copySecret clipboard wipe.
// Source-scan tests (same pattern as useReceiveDetector.test.js): we assert the
// hardening is present in the source, not just behaviourally inferable.
//   (1) The wipe does NOT write an empty string (clipboard-history dedup defeat).
//   (2) The replacement string is non-empty (length > 0).
//   (3) A .catch handler follows the wipe writeText (focus-lost is swallowed safely).
//   (4) A visibilitychange listener is registered (early wipe on page hide).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, '../copySecret.js'), 'utf8');
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const code = stripComments(src);

describe('copySecret — H-NEW-3 wipe hardening', () => {
  it('does not wipe with an empty string', () => {
    expect(code).not.toMatch(/writeText\(\s*''\s*\)/);
    expect(code).not.toMatch(/writeText\(\s*""\s*\)/);
    expect(code).not.toMatch(/writeText\(\s*``\s*\)/);
  });

  it('defines a non-empty wipe replacement', () => {
    const m = code.match(/WIPE_REPLACEMENT\s*=\s*(.+)/);
    expect(m).toBeTruthy();
    // The replacement must produce a string of length > 0.
    expect(m[1]).toMatch(/repeat\(\s*([1-9]\d*)\s*\)/);
  });

  it('catches a rejected wipe write (focus lost)', () => {
    // A .catch must directly follow a wipe writeText call.
    expect(code).toMatch(/writeText\(\s*WIPE_REPLACEMENT\s*\)\s*\.catch\(/);
  });

  it('registers a visibilitychange listener for early wipe', () => {
    expect(code).toMatch(/addEventListener\(\s*['"]visibilitychange['"]/);
  });
});
