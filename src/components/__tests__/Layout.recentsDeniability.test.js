// src/components/__tests__/Layout.recentsDeniability.test.js
//
// C-1 render-side guard (source scan — the codebase pattern for render gates,
// cf. useBasketPrices.deniability.test.js). The hook already resolves recents to
// [] in a deniability/demo session, but the More-drawer "Recent" block is a
// coercion-visible surface, so Layout carries its own belt-and-braces gate: the
// tiles must never render when isDeniabilityOrDemoActive() is true.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, '../Layout.jsx'), 'utf8');
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const code = stripComments(src);

describe('Layout — More-drawer recents I3 gate (C-1)', () => {
  it('imports the LIVE isDeniabilityOrDemoActive helper', () => {
    expect(code).toMatch(
      /import\s*\{[^}]*\bisDeniabilityOrDemoActive\b[^}]*\}\s*from\s*['"]@\/wallet-core\/deniabilitySession['"]/,
    );
  });

  it('does NOT use the session-marker-only isDeniabilitySessionActive for this gate', () => {
    expect(code).not.toMatch(/\bisDeniabilitySessionActive\b/);
  });

  it('gates the recents render on the live check, fail-closed', () => {
    // A single boolean computed fail-closed (catch → suppress) and folded into
    // the recents render condition.
    expect(code).toMatch(/recentsAllowed/);
    expect(code).toMatch(/recentsAllowed\s*&&\s*recents\.length\s*>\s*0/);
  });
});
