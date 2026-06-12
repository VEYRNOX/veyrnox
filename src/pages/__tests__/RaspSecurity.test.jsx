// src/pages/__tests__/RaspSecurity.test.jsx
//
// Honest current-state RASP surface (brief). Tests the four honesty properties:
//   - Honesty-lock (§5): the "detection" claim is DERIVED from the feature
//     catalogue's resolved status, never hard-typed — so it cannot drift to
//     "active" while the catalogue says RASP is not verified.
//   - Render: the honest current-state surface (amber banner, 4 stat tiles,
//     designed ladder, provisional tag, footer) is present.
//   - Honest omissions (§2): no "active monitoring", no event counts, no scan
//     button, no blocked-IPs — the things that would misrepresent.
//   - Deniability parity (§3, D2/D4): the surface renders byte-identical under a
//     real vs decoy active-set marker — nothing on it is set-derived.
//
// The page is a pure function of build-state (no hooks, no fetch), so — like
// SpendingPatternsTile.test.jsx — we invoke it directly and read the returned
// React element tree (vitest.config ships no plugin-react; classic runtime).

import { describe, it, expect } from 'vitest';
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
  it('resolves to honest "pending" for the real catalogue status (roadmap)', () => {
    expect(raspSurfaceModel(STATUS.ROADMAP).detection).toBe('pending');
    expect(raspSurfaceModel(STATUS.ROADMAP).detectionLive).toBe(false);
  });

  it('resolves to honest "pending" for built (policy built, detection still not real)', () => {
    expect(raspSurfaceModel(STATUS.BUILT).detection).toBe('pending');
  });

  // The bite: if the value were hard-coded 'pending' this would fail. It flips to
  // 'live' ONLY for an evidenced `verified` status — which RASP cannot reach until
  // the detector legs land and verify. Proves the coupling is real.
  it('flips to "live" only for verified — proving it is derived, not hard-coded', () => {
    expect(raspSurfaceModel(STATUS.VERIFIED).detection).toBe('live');
    expect(raspSurfaceModel(STATUS.VERIFIED).detectionLive).toBe(true);
  });
});

describe('RaspSecurity — honest current-state render', () => {
  const el = RaspSecurity();
  const t = allText(el);

  it('shows the amber "policy built · detection not yet active" banner', () => {
    expect(t).toMatch(/policy built/i);
    expect(t).toMatch(/detection not yet active/i);
  });

  it('shows the four current-state stat values (built / pending / no / not yet)', () => {
    expect(t).toMatch(/Degradation policy/i);
    expect(t).toMatch(/\bbuilt\b/);
    expect(t).toMatch(/\bpending\b/);
    expect(t).toMatch(/Wired to send path/i);
    expect(t).toMatch(/Independent audit/i);
    expect(t).toMatch(/not yet/i);
  });

  it('shows the designed ladder framed future-tense (allow / warn / block)', () => {
    expect(t).toMatch(/once detection is active/i);
    expect(t).toMatch(/allow/i);
    expect(t).toMatch(/warn/i);
    expect(t).toMatch(/block/i);
  });

  it('displays the undroppable UNAUDITED-PROVISIONAL tag', () => {
    expect(t).toMatch(/UNAUDITED-PROVISIONAL/);
  });

  it('states the deliberate omissions in the footer', () => {
    expect(t).toMatch(/no fabricated/i);
    expect(t).toMatch(/no .*active.* claim|no scan button/i);
  });
});

describe('RaspSecurity — honest omissions (§2): never claims what RASP cannot hold', () => {
  const t = allText(RaspSecurity());
  it('makes no "active monitoring" / "monitoring all" capability claim', () => {
    expect(t).not.toMatch(/active monitoring/i);
    expect(t).not.toMatch(/monitoring all/i);
    expect(t).not.toMatch(/runtime is clean/i);
  });
  it('has no scan button and no blocked-IPs / WAF language', () => {
    expect(t).not.toMatch(/run scan/i);
    expect(t).not.toMatch(/blocked ip/i);
  });
});

// The surface reads no active-set source today, so this is a forward regression
// guard (per §3's forward constraint): it goes RED the moment a future edit makes
// any rendered value set-derived — not a test of an existing per-set branch.
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
