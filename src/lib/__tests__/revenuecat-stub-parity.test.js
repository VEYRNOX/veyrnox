// Drift guard: the DEV/E2E RevenueCat stub must satisfy everything
// src/lib/purchases.js actually asks of the real package.
//
// Why this exists: PR #1085 added `setLogLevel` to purchases.js and imported
// `LOG_LEVEL` alongside `Purchases`, but did not update the stub that
// vite.config.js aliases in for `command === 'serve'`. A named import of a
// missing export is a HARD ES module error — it aborts the whole module graph
// rather than yielding `undefined` — so the dev server and every Playwright run
// booted to a blank page with `#root` empty.
//
// It went unnoticed because the unit tests `vi.mock` the package wholesale and
// supply their own LOG_LEVEL, so they never touch this stub. Nothing in the
// suite exercised the real import path. Hence a parity test derived from the
// SOURCE rather than a hand-maintained list — a hardcoded list would drift the
// same way the stub did.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as stub from '../stubs/revenuecat-stub.js';

const dir = dirname(fileURLToPath(import.meta.url));
const purchasesSrc = readFileSync(join(dir, '../purchases.js'), 'utf8');

const PKG = '@revenuecat/purchases-capacitor';

/** Named bindings purchases.js imports from the real package. */
function importedBindings() {
  const re = new RegExp(String.raw`import\s*\{([^}]*)\}\s*from\s*['"]${PKG}['"]`);
  const m = purchasesSrc.match(re);
  if (!m) return [];
  return m[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
}

/** `Purchases.<method>(` call sites in purchases.js. */
function purchasesMethodsUsed() {
  return [...new Set(
    [...purchasesSrc.matchAll(/\bPurchases\.([A-Za-z_$][\w$]*)\s*\(/g)].map(m => m[1])
  )];
}

describe('revenuecat-stub parity with purchases.js', () => {
  it('purchases.js still imports from the aliased package (guard is live)', () => {
    const names = importedBindings();
    expect(names.length).toBeGreaterThan(0);
    expect(names).toContain('Purchases');
  });

  it('exports every named binding purchases.js imports', () => {
    for (const name of importedBindings()) {
      expect(stub[name], `stub is missing export "${name}" — a named import of a missing export aborts the whole module graph, so the app will not mount in dev/E2E`).toBeDefined();
    }
  });

  it('stubs every Purchases.* method purchases.js calls', () => {
    for (const method of purchasesMethodsUsed()) {
      expect(typeof stub.Purchases[method], `stub.Purchases.${method} is not a function`).toBe('function');
    }
  });

  it('LOG_LEVEL carries the level purchases.js selects', () => {
    // purchases.js reads LOG_LEVEL.ERROR on release builds.
    const used = [...new Set([...purchasesSrc.matchAll(/\bLOG_LEVEL\.([A-Z_]+)/g)].map(m => m[1]))];
    for (const level of used) {
      expect(stub.LOG_LEVEL?.[level], `stub.LOG_LEVEL.${level} is undefined`).toBeDefined();
    }
  });

  it('every stubbed Purchases method returns a promise (callers await them)', () => {
    for (const method of purchasesMethodsUsed()) {
      const r = stub.Purchases[method]();
      expect(typeof r?.then, `stub.Purchases.${method}() did not return a thenable`).toBe('function');
      // Some intentionally reject (native-only); swallow so the assertion above
      // is the only thing under test and we don't emit unhandled rejections.
      r.catch(() => {});
    }
  });
});
