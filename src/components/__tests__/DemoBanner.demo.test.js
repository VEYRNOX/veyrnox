// src/components/__tests__/DemoBanner.demo.test.js
//
// DemoBanner must render for a RUNTIME demo session, not only a build-flag demo.
//
// The bug: gating on `import.meta.env.VITE_DEMO_MODE !== '1'` means a dev server
// opened at `?demo=1` (runtime demo, persisted as localStorage `veyrnox-demo=1`
// and resolved by the `DEMO` export in src/api/demoClient.js) NEVER shows the
// "simulated balances, no real transactions" disclosure — exactly when a real
// tester is looking at fake seeded balances and most needs to be told so.
//
// Fix: gate on the runtime `DEMO` export instead (`if (!DEMO) return null;`).
// Release behaviour is preserved by demoClient.js itself: in a VITE_RELEASE=1
// build the localStorage/query-param path is statically dead-code-eliminated, so
// DEMO is false (unless VITE_DEMO_MODE was explicitly set) → banner still never
// renders in release. Source-scan house style (readFileSync + regex), no render
// harness in this project — mirrors notify/__tests__/useReceiveDetector.test.js.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, '../DemoBanner.jsx'), 'utf8');
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const code = stripComments(src);

describe('DemoBanner — runtime DEMO gate (source scan)', () => {
  it('imports DEMO from @/api/demoClient', () => {
    expect(code).toMatch(/import\s*\{\s*DEMO\s*\}\s*from\s*['"]@\/api\/demoClient['"]/);
  });

  it('the null-return gate is driven by DEMO (renders for runtime demo)', () => {
    expect(code).toMatch(/if\s*\(\s*!DEMO\s*\)\s*return\s+null/);
  });

  it('does NOT gate solely on the raw VITE_DEMO_MODE build flag', () => {
    // The old build-flag-only check must be gone — a runtime `?demo=1` session
    // (VITE_DEMO_MODE unset) must still show the disclosure.
    expect(code).not.toMatch(/import\.meta\.env\.VITE_DEMO_MODE\s*!==\s*['"]1['"]/);
  });

  it('still renders the disclosure copy (wording unchanged)', () => {
    expect(code).toMatch(/Demo — simulated balances, no real transactions/);
  });
});
