// src/lib/__tests__/usdDisclosure.test.js
//
// Completeness guard for the reference-rate disclosure (see PRs #111/#114).
// Fails when a `live` route renders a USD_RATES-derived dollar figure without
// the disclosure (approxUsd / ReferenceRateNote). Source-scanning only — no
// rendering — mirroring routeAudit.test.js. The declaration in
// src/lib/usdDisclosure.js is the deliberate source of truth; these assertions
// enforce that nothing escapes it.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { CLASSIFICATION } from '../featureClassification';
import { USD_DISCLOSURE, USD_DISPLAY_COMPONENTS } from '../usdDisclosure';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(here, rel), 'utf8');
const appSrc = read('../../App.jsx');

// --- Parse App.jsx: route path -> page component -> page file ----------------
// component -> page file basename, from `const X = lazy(() => import('./pages/File'))`
const lazyMap = {};
for (const m of appSrc.matchAll(
  /const\s+(\w+)\s*=\s*lazy\(\(\)\s*=>\s*import\(['"]\.\/pages\/([^'"]+)['"]\)\)/g,
)) {
  lazyMap[m[1]] = m[2];
}
// Layout-gated routes: path -> component, within the <Layout> block.
const LAYOUT_MARKER = 'element={<Layout />}>';
const lstart = appSrc.indexOf(LAYOUT_MARKER);
const lend = appSrc.indexOf('</Route>', lstart);
const layoutBlock = lstart === -1 ? '' : appSrc.slice(lstart + LAYOUT_MARKER.length, lend);
const routeToComponent = {};
for (const m of layoutBlock.matchAll(/<Route\s+path="([^"]+)"\s+element=\{<(\w+)\s*\/>\}/g)) {
  routeToComponent[m[1]] = m[2];
}

function pageTextForRoute(path) {
  const comp = routeToComponent[path];
  const file = comp && lazyMap[comp];
  return file ? read(`../../pages/${file}.jsx`) : null;
}

// --- Detection on a page's source text --------------------------------------
const DISPLAY_RE = new RegExp(`\\b(${USD_DISPLAY_COMPONENTS.join('|')})\\b`);
const importsUsdRates = (t) =>
  /import\s*\{[^}]*\bUSD_RATES\b[^}]*\}\s*from\s*['"]@\/lib\/cryptos['"]/.test(t);
const importsDisplayComponent = (t) =>
  USD_DISPLAY_COMPONENTS.length > 0 &&
  t.split('\n').some((l) => /^\s*import\b/.test(l) && DISPLAY_RE.test(l));
const touchesUsd = (t) => importsUsdRates(t) || importsDisplayComponent(t);
const hasDisclosureHelper = (t) => /\b(approxUsd|ReferenceRateNote)\b/.test(t);
// A3 proves an `exempt` page renders no $ by the ABSENCE of these display
// helpers. Blind spot: a raw inline dollar like `${v.toLocaleString()}` (the
// very pattern #111/#114 replaced) carries no helper and would slip past A3.
// The strict helper check is deliberate — a literal `$` regex false-positives
// on JSX/template `${}` interpolation; tighten only if a real raw-$ exempt page
// actually appears.
const hasUsdDisplayHelper = (t) =>
  /\b(approxUsd|ReferenceRateNote)\b/.test(t) || /\bformatFiat\(/.test(t);

// --- Compute the live USD-touching set --------------------------------------
const liveRoutesAll = Object.keys(CLASSIFICATION).filter((p) => CLASSIFICATION[p].verdict === 'live');
const liveUsdRoutes = liveRoutesAll
  .filter((p) => routeToComponent[p])
  .filter((p) => {
    const t = pageTextForRoute(p);
    return t != null && touchesUsd(t);
  });

describe('reference-rate disclosure completeness', () => {
  it('A6 sentinel: App.jsx parsed; every live route resolves to a page file', () => {
    expect(lstart, 'Layout block not found in App.jsx').not.toBe(-1);
    expect(liveRoutesAll.length, 'no live routes in CLASSIFICATION').toBeGreaterThan(10);
    const unparsed = liveRoutesAll.filter((p) => !routeToComponent[p]);
    expect(unparsed, `live routes not parsed from App.jsx: ${unparsed.join(', ')}`).toEqual([]);
    expect(liveUsdRoutes.length, 'no live USD-touching routes found').toBeGreaterThan(0);
  });

  it('A1 drift guard: every live USD-touching route is declared in USD_DISCLOSURE', () => {
    const undeclared = liveUsdRoutes.filter((p) => !USD_DISCLOSURE[p]);
    expect(
      undeclared,
      `live routes render USD_RATES-derived figures but are uncategorized in USD_DISCLOSURE (add {discloses:true} or {exempt,note}): ${undeclared.join(', ')}`,
    ).toEqual([]);
  });

  it('A2 disclosure present: discloses:true routes reference approxUsd/ReferenceRateNote', () => {
    const missing = Object.keys(USD_DISCLOSURE)
      .filter((p) => USD_DISCLOSURE[p].discloses)
      .filter((p) => {
        const t = pageTextForRoute(p);
        return !t || !hasDisclosureHelper(t);
      });
    expect(missing, `discloses:true routes missing the disclosure helper: ${missing.join(', ')}`).toEqual([]);
  });

  it('A3 exempt integrity: exempt routes have a note and render no USD-display helper', () => {
    for (const [p, e] of Object.entries(USD_DISCLOSURE)) {
      if (!e.exempt) continue;
      expect(typeof e.note === 'string' && e.note.length > 0, `${p}: exempt entry needs a non-empty note`).toBe(true);
      const t = pageTextForRoute(p);
      expect(t, `${p}: page file not found`).not.toBeNull();
      expect(
        hasUsdDisplayHelper(t),
        `${p}: marked exempt but references a USD-display helper (approxUsd/ReferenceRateNote/formatFiat) — it appears to display a $ figure`,
      ).toBe(false);
    }
  });

  it('A4 no stale entries: every declared route is live and USD-touching', () => {
    const stale = Object.keys(USD_DISCLOSURE).filter((p) => !liveUsdRoutes.includes(p));
    expect(stale, `USD_DISCLOSURE entries that are not live USD-touching routes (remove or fix): ${stale.join(', ')}`).toEqual([]);
  });

  it('A5 entry shape: exactly {discloses:true} XOR {exempt:<string>, note}', () => {
    for (const [p, e] of Object.entries(USD_DISCLOSURE)) {
      const isDisclose = e.discloses === true && e.exempt === undefined;
      const isExempt = typeof e.exempt === 'string' && e.discloses === undefined;
      expect(isDisclose !== isExempt, `${p}: entry must be exactly one of {discloses:true} or {exempt:<string>, note}`).toBe(true);
    }
  });
});
