// Gate tests for the Transak Buy surfaces (branch review of PR #1509).
//
// Neither page shipped with a test. These pin the three properties that the
// review found broken or unpinned, and each is mutation-checked against the
// specific gate it names — see the comment on each block for what to break to
// turn it red.
//
// Deliberately NOT tested here: buildTransakUrl itself, which already has 33
// tests in src/lib/buy/__tests__/transakUrl.test.js including the "gate fires
// before argument validation" ordering. No duplication.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// react-i18next 15 uses its own React copy under node_modules/react-i18next/
// node_modules/react — useContext returns null there, so t() returns the raw key
// and any assertion on real copy fails for the wrong reason. Same JSON-catalog
// resolver the Layout / DuressPin tests use.
vi.mock('react-i18next', async () => {
  const wallet = /** @type {any} */ (await import('@/i18n/locales/en/wallet.json'));
  const common = /** @type {any} */ (await import('@/i18n/locales/en/common.json'));
  const bundles = { wallet: wallet.default, common: common.default };
  const resolve = (key, opts = {}) => {
    const ns = opts.ns || 'common';
    let v = bundles[ns];
    for (const p of String(key).split('.')) v = v?.[p];
    if (typeof v !== 'string') return key;
    return v.replace(/\{\{(\w+)\}\}/g, (_, k) => (k in opts ? String(opts[k]) : `{{${k}}}`));
  };
  return {
    useTranslation: (ns) => ({ t: (k, o) => resolve(k, { ns, ...(o || {}) }) }),
    Trans: ({ children }) => children,
    initReactI18next: { type: '3rdParty', init: () => {} },
    I18nextProvider: ({ children }) => children,
  };
});

import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

// ── Hook-order regression (the crash, not just the lint error) ──────────────
//
// BuyCrypto had four hooks AFTER its early returns. useBuyEnabled subscribes to
// DENIABILITY_SESSION_CHANGED_EVENT, so a mid-session flip re-renders the
// component; with hooks after the gate that re-render calls FEWER hooks than the
// previous one and React tears the subtree down with "Rendered fewer hooks than
// expected" — a crash at the moment of coercion.
//
// eslint's react-hooks/rules-of-hooks is the primary guard and runs in CI. This
// asserts the ORDERING PROPERTY directly, because a future refactor could
// satisfy eslint (e.g. by extracting a wrapper component) while reintroducing
// the same crash, and because lint failures are easy to wave through.
//
// Mutation check: move any `useState(` in BuyCrypto.jsx below the
// `if (isDeniabilityOrDemoActive()) return null;` line → red.
describe('BuyCrypto — every hook runs before every early return', () => {
  for (const file of ['../BuyCrypto.jsx', '../BuyInProgress.jsx']) {
    it(`${file.replace('../', '')} calls no hook after an early return`, () => {
      const src = read(file);
      // Body of the default-exported component only: from `export default
      // function` to end of file.
      const body = src.slice(src.indexOf('export default function'));
      const lines = body.split('\n');

      const firstReturnIdx = lines.findIndex((l) => /^\s{2}if\s*\(.*\)\s*return\b/.test(l));
      expect(firstReturnIdx, 'expected a top-level early-return gate in the component body')
        .toBeGreaterThan(-1);

      const hookAfterGate = lines
        .slice(firstReturnIdx)
        .map((l, i) => [i + firstReturnIdx + 1, l])
        .filter(([, l]) => /(?:^|[^.\w])use[A-Z]\w*\s*\(/.test(String(l)) && !/^\s*(\/\/|\*)/.test(String(l)));

      expect(
        hookAfterGate.map(([n, l]) => `L${n}: ${String(l).trim()}`),
        'hooks must be called before the deniability / ship gates — a mid-session '
          + 'deniability flip re-renders this component, and a shrinking hook count '
          + 'crashes the subtree',
      ).toEqual([]);
    });
  }
});

// ── Ship gate on /buy/in-progress ──────────────────────────────────────────
//
// The route and its lazy chunk are registered unconditionally in App.jsx, so
// VITE_BUY_ENABLED=false does NOT remove this page from a production build.
// Without a render gate a production user reaching it (the veyrnox.com/buy/return
// universal link is live on both platforms' association files) is told a purchase
// is "being processed" when no purchase can have happened — fabricated state (I4).
//
// Mutation check: delete `if (!buyEnabled) return null;` from BuyInProgress.jsx
// → the first case goes red.
describe('BuyInProgress — ship gate', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  const renderPage = async () => {
    const { default: BuyInProgress } = await import('../BuyInProgress.jsx');
    return render(
      <MemoryRouter initialEntries={['/buy/in-progress?tid=abc123']}>
        <BuyInProgress />
      </MemoryRouter>,
    );
  };

  it('renders NOTHING when the ship gate is off, even with a tid in the URL', async () => {
    vi.stubEnv('VITE_BUY_ENABLED', 'false');
    const { container } = await renderPage();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the waiting screen when the ship gate is on', async () => {
    vi.stubEnv('VITE_BUY_ENABLED', 'true');
    await renderPage();
    expect(screen.getByText(/purchase in progress/i)).toBeInTheDocument();
  });

  it('never renders the tid — there is no support-lookup UI, and a decoy user must learn nothing from the URL', async () => {
    vi.stubEnv('VITE_BUY_ENABLED', 'true');
    const { container } = await renderPage();
    expect(container.textContent).not.toContain('abc123');
  });
});

// ── The screen makes no confirmation claim ─────────────────────────────────
//
// featureClassification.js used to assert "confirmation comes from on-chain
// observation of the deposit address", which the file itself contradicts
// ("On-chain polling is deliberately NOT wired in this MVP"). The negative
// property is the real one and is worth pinning: nothing from the return payload
// is read, so a spoofed return URL cannot fake a success.
//
// Mutation check: add `params.get('status')` handling that renders a success
// string → red.
describe('BuyInProgress — never claims success from the return payload', () => {
  it('does not read any query parameter', () => {
    const src = read('../BuyInProgress.jsx');
    const readsParams = src.match(/useSearchParams|searchParams|params\.get/g) ?? [];
    expect(
      readsParams,
      'the return-URL payload must not be read: it is attacker-controlled, and '
        + 'anything derived from it could fake a completed purchase',
    ).toEqual([]);
  });

  it('featureClassification does not claim this page polls or confirms', () => {
    const src = read('../../lib/featureClassification.js');
    // Slice from CLASSIFICATION first: '/buy/in-progress' also appears earlier
    // as a plain string in ALL_ROUTE_PATHS, and matching that gave a note of
    // "'/buy/in-progress', '/settings', …" — a test failing for the wrong reason.
    const table = src.slice(src.indexOf('export const CLASSIFICATION'));
    const entry = table.slice(table.indexOf("'/buy/in-progress'"));
    const note = entry.slice(0, entry.indexOf('},'));
    // Assert the POSITIVE properties, not the absence of the old wording. The
    // note deliberately quotes the retracted claim — CLAUDE.md's convention is
    // to mark a wrong statement as having been wrong rather than quietly reword
    // it — and a negative regex cannot tell "asserts X" from "X was wrong".
    // (This test failed on exactly that when first written.) The positive
    // assertion is a sufficient guard anyway: reverting the note to the old
    // claim removes these phrases and turns this red.
    expect(note).toMatch(/POLLS NOTHING/);
    expect(note).toMatch(/shows no confirmation signal/);
  });
});
