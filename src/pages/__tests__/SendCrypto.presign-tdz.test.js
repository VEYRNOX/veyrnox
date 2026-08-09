// Regression guard for the 2026-08-09 Send-page crash:
//   ReferenceError: Cannot access 'Q3' before initialization
// (Q3 = minified `presign`). A `useEffect` dep array on line 946 read
// `presign` while `const presign = ...` was declared on line 988 — TDZ under
// the iOS Release Rollup minifier, ErrorBoundary swallowed it as "Something
// went wrong". Dev / unminified web didn't trip because /send never mounted
// on a fresh install (onboarding gate redirects first) — so this must be a
// source-order check, not a render test.
//
// PR #1665 introduced the ordering bug while claiming to fix a related TDZ
// (see CLAUDE.md note about #1665 which was inaccurate). Do not weaken this
// guard: the whole point is that a future edit re-ordering these blocks
// fails LOUDLY in CI before another Release build ships broken.
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

describe('SendCrypto.jsx — presign / useEffect ordering', () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, '..', 'SendCrypto.jsx'),
    'utf8'
  );

  it('declares `const presign = ...` before any consumer', () => {
    const declIdx = src.search(/^\s*const presign =/m);
    expect(declIdx).toBeGreaterThan(-1);
    // Every occurrence of the identifier `presign` (as a whole word, not
    // `presignGate` / `presignAtSign`) must come at or after the declaration.
    const usageRe = /\bpresign\b(?!Gate|AtSign|_owner)/g;
    let m;
    while ((m = usageRe.exec(src)) !== null) {
      // Skip the declaration itself and the import.
      const line = src.slice(src.lastIndexOf('\n', m.index) + 1,
                             src.indexOf('\n', m.index));
      if (line.includes("import ") || line.includes("const presign =")) continue;
      expect(m.index).toBeGreaterThan(declIdx);
    }
  });
});
