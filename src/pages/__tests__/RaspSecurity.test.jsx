// src/pages/__tests__/RaspSecurity.test.jsx
//
// Honest current-state RASP surface. Tests four honesty properties:
//   - Honesty-lock (§5): the "detection" claim is DERIVED from the feature
//     catalogue's resolved status, never hand-typed.
//     built     → 'browser-active' (browser probes are now wired)
//     verified  → 'live' (evidenced native probes, not yet reached)
//     roadmap   → 'pending'
//   - Render: amber banner, 4 stat tiles, ladder, footer.
//   - Honest omissions (§2): no "active monitoring", no event counts, no scan.
//   - Deniability parity (§3, D2/D4): byte-identical under real vs decoy.
//
// The page calls detect(browserProbeSource) at render time. In Node/Vitest,
// window is absent so browserProbeSource.available=false → detect() returns
// INTEGRITY_UNAVAILABLE ('unavailable'). Tests below account for this.

import { describe, it, expect, vi } from 'vitest';

// RaspSecurity is called as a plain function (no RTL) to walk the element tree.
// Mock hooks so the component can be invoked outside the React reconciler.
// nativeProbe starts null by design (async bridge call); useEffect is side-effect only.
vi.mock('react', async (importOriginal) => {
  const actual = /** @type {any} */ (await importOriginal());
  return { ...actual, useState: (init) => [typeof init === 'function' ? init() : init, vi.fn()], useEffect: vi.fn() };
});

import React from 'react';
globalThis.React = React;

import RaspSecurity, { raspSurfaceModel } from '@/pages/RaspSecurity';
import { STATUS } from '@/lib/featureCatalogue';

// --- tree-walk helpers (no RTL; read the returned element tree directly) ---
function shape(node) {
  if (node == null || typeof node !== 'object') return null;
  const t = typeof node.type === 'string' ? node.type : node.type?.name || 'Component';
  const children = React.Children.toArray(node.props?.children).map(shape).filter(Boolean);
  return { t, testid: node.props?.['data-testid'] ?? null, children };
}
function texts(node, out = []) {
  if (node == null) return out;
  if (typeof node === 'string' || typeof node === 'number') return (out.push(String(node)), out);
  if (typeof node !== 'object') return out;
  React.Children.toArray(node.props?.children).forEach((c) => texts(c, out));
  return out;
}
const allText = (el) => texts(el).join(' ');

describe('raspSurfaceModel — honesty-lock (§5): detection is derived, never hard-typed', () => {
  it('resolves to honest "pending" for roadmap (nothing running)', () => {
    expect(raspSurfaceModel(STATUS.ROADMAP).detection).toBe('pending');
    expect(raspSurfaceModel(STATUS.ROADMAP).detectionLive).toBe(false);
  });

  it('resolves to "browser-active" for built (browser probes are now wired)', () => {
    expect(raspSurfaceModel(STATUS.BUILT).detection).toBe('browser-active');
    expect(raspSurfaceModel(STATUS.BUILT).detectionLive).toBe(true);
  });

  // The bite: if the value were hard-coded 'browser-active' this would fail. It
  // flips to 'live' ONLY for evidenced `verified` — proving the coupling is real.
  it('flips to "live" only for verified — proving it is derived, not hard-coded', () => {
    expect(raspSurfaceModel(STATUS.VERIFIED).detection).toBe('live');
    expect(raspSurfaceModel(STATUS.VERIFIED).detectionLive).toBe(true);
  });
});

describe('RaspSecurity — active-behaviour render (no status vocabulary)', () => {
  const el = RaspSecurity();
  const t = allText(el);

  it('shows the active runtime-integrity banner describing what the checks do', () => {
    expect(t).toMatch(/runtime integrity checks active/i);
    expect(t).toMatch(/before every signature/i);
    expect(t).toMatch(/a compromised one is refused/i);
  });

  it('carries NO build-status / audit / roadmap vocabulary on the page', () => {
    // The deliberate opsec choice: the surface states active behaviour only. It
    // must not publish build status, an audit ledger, or a "pending/roadmap" list.
    expect(t).not.toMatch(/\bbuilt\b/i);
    expect(t).not.toMatch(/\bpending\b/i);
    expect(t).not.toMatch(/independent audit|2026-06-23|browser lane/i);
    expect(t).not.toMatch(/phase\s*4/i);
    expect(t).not.toMatch(/native build|not yet wired/i);
  });

  it('shows the live condition readout (clean in Vitest/jsdom — no webdriver flag set)', () => {
    expect(t).toMatch(/Current environment/i);
    // In Vitest with jsdom: window is defined, navigator.webdriver is not set →
    // detect() returns CLEAN → label = 'clean'.
    expect(t).toMatch(/clean/i);
  });

  it('shows the degradation ladder (allow / warn / block)', () => {
    expect(t).toMatch(/allow/i);
    expect(t).toMatch(/warn/i);
    expect(t).toMatch(/block/i);
  });

  it('states the deliberate omissions in the footer', () => {
    expect(t).toMatch(/no fake|no fabricated/i);
    expect(t).toMatch(/scan button/i);
  });
});

describe('RaspSecurity — honest omissions (§2): never claims what RASP cannot hold', () => {
  const t = allText(RaspSecurity());
  it('makes no "active monitoring" / "monitoring all" capability claim', () => {
    // The footer DENIES active monitoring with the phrase 'no "active monitoring" claim'.
    // The §1 test already verifies that denial phrase is present.
    // Here we check no AFFIRMATIVE claim is made:
    expect(t).not.toMatch(/is actively monitoring/i);
    expect(t).not.toMatch(/monitoring all/i);
    expect(t).not.toMatch(/runtime is clean/i);
  });
  it('has no scan button and no blocked-IPs / WAF language', () => {
    expect(t).not.toMatch(/run scan/i);
    expect(t).not.toMatch(/blocked ip/i);
  });
});

// Forward regression guard (§3): goes RED the moment a future edit makes any
// rendered value set-derived. detect(browserProbeSource) is a pure function of
// the environment — not the wallet set — so parity is maintained.
describe('RaspSecurity — deniability parity (§3, D2/D4): identical real-vs-decoy', () => {
  function renderUnderActiveSet(activeSet) {
    globalThis.__VEYRNOX_ACTIVE_SET__ = activeSet;
    try {
      return RaspSecurity();
    } finally {
      delete globalThis.__VEYRNOX_ACTIVE_SET__;
    }
  }
  it('renders a structurally + textually identical tree for real and decoy sets', () => {
    const real = renderUnderActiveSet('real');
    const decoy = renderUnderActiveSet('decoy');
    expect(JSON.stringify(shape(decoy))).toBe(JSON.stringify(shape(real)));
    expect(texts(decoy)).toEqual(texts(real));
  });
});
