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
import { LOCALE_KEY, TIMEZONE_KEY } from '@/lib/locale.js';
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
//
// ENVIRONMENT PINNING, and why it is not optional. useBuyEnabled has a THIRD
// gate beyond deniability and the ship flag: isUkBuyBlocked(), the UK
// financial-promotions block, which reads resolveLocale()/resolveTimeZone().
// Both fall back to the HOST's Intl settings when no preference is stored, so
// without the pins below this block's verdict depends on the machine running
// it — green on a UTC CI runner, red on any UK-based developer's laptop, where
// the page correctly renders nothing and every positive assertion fails for a
// reason that has nothing to do with the ship gate. Observed 2026-08-24 on a
// Europe/London host.
//
// Storing the preference is the same idiom useBuyEnabled.test.js uses (:63-64)
// and it exercises the real resolver rather than mocking it out.
describe('BuyInProgress — ship gate', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    // Non-UK, so isUkBuyBlocked() is false and the ship gate is the only
    // variable under test. Do not remove: see the note above.
    localStorage.setItem(LOCALE_KEY, 'en-US');
    localStorage.setItem(TIMEZONE_KEY, 'America/New_York');
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

  // The page's header rule 2 — "Hidden entirely in deniability/demo" — had no
  // test. This pins the OUTCOME a user experiences.
  //
  // What it deliberately does NOT claim: that it isolates the component's own
  // `if (isDeniabilityOrDemoActive()) return null;`. It cannot. useBuyEnabled's
  // getSnapshot() already folds in the same predicate, so deleting the
  // component's line leaves this green — verified by mutation, not assumed.
  // That redundancy is the intended two-chokepoint shape, and the source
  // assertion below is what actually pins the second chokepoint. Recorded here
  // so a future reader does not mistake this for coverage of that line.
  //
  // Demo is the cheap half to drive (a persisted veyrnox-demo=1 is the
  // documented localStorage trap) and it exercises the same predicate a decoy
  // session does.
  it('renders NOTHING in a demo session even with the ship gate on', async () => {
    vi.stubEnv('VITE_BUY_ENABLED', 'true');
    localStorage.setItem('veyrnox-demo', '1');
    const { container } = await renderPage();
    expect(container).toBeEmptyDOMElement();
  });

  it('never renders the tid — there is no support-lookup UI, and a decoy user must learn nothing from the URL', async () => {
    vi.stubEnv('VITE_BUY_ENABLED', 'true');
    const { container } = await renderPage();
    // Assert the screen actually rendered BEFORE asserting an absence. A bare
    // not-toContain passes trivially against an empty DOM, which is exactly
    // what this page returns whenever any gate closes — so on an unpinned
    // UK host this case was green while testing nothing at all.
    expect(screen.getByText(/purchase in progress/i)).toBeInTheDocument();
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
// ── The second deniability chokepoint, pinned at the source ────────────────
//
// Both Buy pages carry their OWN isDeniabilityOrDemoActive() early return in
// addition to useBuyEnabled()'s. A behavioural test cannot tell them apart
// (the hook fails closed first), so the redundant-by-design one is pinned by
// source. This is the same "guard the second chokepoint" doctrine CLAUDE.md
// records for lib/consent.js and api/trackEvent.js: do not collapse two gates
// into one because one currently shadows the other.
//
// The two pages use DIFFERENT but equally valid shapes — BuyInProgress has an
// `if (...) return null;` early return, BuyCrypto composes a `suppressed` flag
// (`DEMO || isDeniabilityOrDemoActive() || !buyEnabled`). So this asserts the
// PREDICATE IS CONSUMED, not one spelling of the gate; pinning the shape would
// have failed BuyCrypto for being written differently rather than for being
// wrong.
//
// Mutation check: remove the call from either page's gate → red (the import
// alone does not satisfy it).
describe('Buy pages — each consumes the deniability predicate itself', () => {
  for (const file of ['../BuyCrypto.jsx', '../BuyInProgress.jsx']) {
    it(`${file.startsWith('../') ? file.slice(3) : file} calls isDeniabilityOrDemoActive() outside its import`, () => {
      const calls = read(file)
        .split('\n')
        .filter((l) => /isDeniabilityOrDemoActive\s*\(/.test(l) && !/^\s*import\b/.test(l));
      expect(calls, 'the page must apply the predicate, not merely import it').not.toEqual([]);
    });
  }
});

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

// ── Third-party iframe sandbox (branch review of PR #1801, finding S-1) ──────
//
// #1801 constrained the Transak frame with a `sandbox` attribute. It shipped
// with no test, and a sandbox is exactly the kind of control that vanishes
// silently: it is one JSX attribute, its absence looks identical to its presence
// in every other test here, and nothing at runtime complains. A dropped sandbox
// hands a compromised or mis-served third-party page the full iframe capability
// surface PLUS the granted camera/microphone/payment permissions.
//
// Source-scan rather than render, matching the rest of this file: `sandbox` is a
// static JSX attribute, so reading it from source proves as much as mounting the
// component, without needing the provider stack the Buy page pulls in.
//
// Mutation checks (each turns exactly one case red):
//   • delete the sandbox attribute                    → "declares a sandbox"
//   • add allow-top-navigation to the token list      → "withholds the tokens…"
//   • remove allow-scripts                            → "grants exactly…"
describe('BuyCrypto — the Transak iframe is sandboxed', () => {
  const src = read('../BuyCrypto.jsx');
  const sandboxMatch = src.match(/sandbox="([^"]*)"/);

  it('declares a sandbox on the third-party frame', () => {
    expect(sandboxMatch, 'the Transak iframe must carry a sandbox attribute').toBeTruthy();
  });

  it('grants exactly the tokens the KYC/payment flow needs, and no more', () => {
    const tokens = (sandboxMatch?.[1] ?? '').split(/\s+/).filter(Boolean).sort();
    expect(tokens).toEqual([
      'allow-forms',
      'allow-modals',
      'allow-popups',
      'allow-popups-to-escape-sandbox',
      'allow-same-origin',
      'allow-scripts',
    ].sort());
  });

  it('withholds the tokens that would let the frame take over the app', () => {
    // allow-top-navigation lets the frame navigate the WHOLE app away — the
    // exit-scam class a compromised widget could otherwise pull. allow-downloads
    // would let it hand the user files. Neither is needed by Transak.
    const value = sandboxMatch?.[1] ?? '';
    for (const forbidden of [
      'allow-top-navigation',
      'allow-top-navigation-by-user-activation',
      'allow-downloads',
      'allow-pointer-lock',
      'allow-orientation-lock',
      'allow-presentation',
    ]) {
      expect(value, `${forbidden} must not be granted`).not.toContain(forbidden);
    }
  });

  it('allow-same-origin is only safe because the frame src is a VALIDATED third-party origin', () => {
    // allow-scripts + allow-same-origin together let a SAME-ORIGIN frame delete
    // its own sandbox attribute and escape. That pair is safe here only because
    // the src can never be same-origin: api/edgeApi.js validates the returned
    // URL against the Transak allowlist before it is ever used. If that check is
    // dropped, this token pair silently becomes an escape hatch — so pin it from
    // this side too, where the risky pair is actually granted.
    //
    // Asserts the CONTRACT (the rejection exists and has a stable code), not the
    // implementation: main currently inlines a host comparison, while #1804
    // replaces it with a shared isTransakUrl() helper. Matching either specific
    // form would make this test fail on an unrelated refactor rather than on the
    // property it is guarding.
    const value = sandboxMatch?.[1] ?? '';
    if (value.includes('allow-scripts') && value.includes('allow-same-origin')) {
      const edgeApi = read('../../api/edgeApi.js');
      expect(edgeApi, 'createBuySession must reject a non-Transak Buy URL')
        .toMatch(/BUY_URL_UNTRUSTED_ORIGIN/);
      expect(edgeApi, 'the rejection must THROW, not just log')
        .toMatch(/throw[\s\S]{0,120}BUY_URL_UNTRUSTED_ORIGIN/);
    }
  });
});
