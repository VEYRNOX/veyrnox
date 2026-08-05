// Regression guard for the lib/locale.js ⇄ components/FiatCurrencySelector.jsx
// import cycle (branch review of PR #1509).
//
// lib/locale.js derives SUPPORTED_FIAT at module-evaluation time. While the
// FIAT_CURRENCIES map lived in the component, and the component imported
// resolveLocale back from lib/locale.js, that derivation threw
// `TypeError: Cannot convert undefined or null to object` — but ONLY when the
// component was evaluated before lib/locale.js. App.jsx pulls lib/locale into
// the root chunk first, which hid the fault in the browser; a chunk-split change
// or a test importing formatFiat first was enough to surface it as a blank
// screen.
//
// The FIRST test below is the one that matters, and its IMPORT ORDER IS THE
// TEST: the component must come first. Both tests were red before the fix for
// the right reason (module-init TypeError, not an assertion failure).
//
// Do NOT "simplify" this by importing the component after locale.js, and do not
// merge the two blocks — the passing order is exactly the order that always
// worked.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Same helper shape as validation-sweep/__tests__/send-io-validators.test.js.
// These MUST be static top-level imports: with `await import('node:fs')` inside
// a test body Vitest web-transforms the module and `import.meta.url` becomes an
// http:// URL, so fileURLToPath throws "The URL must be of scheme file".
const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('fiat catalogue has no import cycle with lib/locale', () => {
  it('evaluates when the COMPONENT is imported before lib/locale (the order that used to throw)', async () => {
    const component = await import('../../components/FiatCurrencySelector.jsx');
    const locale = await import('../locale.js');

    expect(Object.keys(component.FIAT_CURRENCIES).length).toBeGreaterThan(30);
    expect(locale.SUPPORTED_FIAT.length).toBe(Object.keys(component.FIAT_CURRENCIES).length);
    expect(locale.SUPPORTED_FIAT).toContain('USD');
    expect(locale.SUPPORTED_FIAT).toContain('INR');
  });

  it('lib/locale does not import from components/ at all', () => {
    const src = read('../locale.js');
    // A lib/ module importing a component is what created the cycle. Catch the
    // reintroduction directly rather than waiting for the TypeError above to
    // depend on evaluation order again.
    const componentImports = src
      .split('\n')
      .filter((l) => /^\s*import\s/.test(l) && /components\//.test(l));
    expect(componentImports, `lib/locale.js must not import components/: ${componentImports.join(' | ')}`)
      .toEqual([]);
  });

  it('the catalogue module itself is import-free, so it can never join a cycle', () => {
    const src = read('../fiatCurrencies.js');
    const imports = src.split('\n').filter((l) => /^\s*import\s/.test(l));
    expect(imports, `lib/fiatCurrencies.js must stay dependency-free: ${imports.join(' | ')}`)
      .toEqual([]);
  });
});
