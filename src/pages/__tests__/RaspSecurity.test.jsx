// src/pages/__tests__/RaspSecurity.test.jsx
//
// P2-8 refactor: RaspSecurity.jsx now consumes useRaspArtifact() — the shared
// hook that (a) re-probes on G4-A foreground + G4-B 60s heartbeat, and (b)
// composes BOTH the on-device probe AND the remote-attestation axis via
// composeConditions. Before this refactor RaspSecurity sampled the native
// probe once on mount and composed only detect(nativeProbe), so a device that
// passed the OS probe but FAILED remote attestation rendered "clean/allow"
// here while the Send flow correctly composed to BLOCK. That dashboard
// staleness / missing-attestation-axis gap is what P2-8 closes.
//
// Tests below pin:
//   - useRaspArtifact() is the source of the composed artifact (no inline
//     probe sampling remains in the page)
//   - the composed tier drives the rendered dot-tone / condition label,
//     including the attestation axis (INTEGRITY_FAIL → BLOCK-tier UI)
//   - honesty-lock helper (raspSurfaceModel) is unchanged (VULN-8)
//   - deniability parity (§3, D2/D4): identical real-vs-decoy render

import { describe, it, expect, vi } from 'vitest';

// Mock the shared hook so tests control the artifact directly. Default: CLEAN.
const hookHandle = { artifact: { tier: 'allow', sentence: null, blockedActions: [], requiresBiometric: false, condition: 'clean' } };
vi.mock('@/rasp', async (importOriginal) => {
  const actual = /** @type {any} */ (await importOriginal());
  return {
    ...actual,
    useRaspArtifact: () => hookHandle.artifact,
  };
});

import React from 'react';
globalThis.React = React;

import RaspSecurity, { raspSurfaceModel } from '@/pages/RaspSecurity';
import { STATUS } from '@/lib/featureCatalogue';

// --- tree-walk helpers ---
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

// Reset hook to CLEAN before each describe block that mutates it.
function withArtifact(artifact, fn) {
  const prev = hookHandle.artifact;
  hookHandle.artifact = artifact;
  try { return fn(); } finally { hookHandle.artifact = prev; }
}

describe('raspSurfaceModel — honesty-lock (VULN-8): detection is derived, never hard-typed', () => {
  it('resolves to "pending" for roadmap', () => {
    expect(raspSurfaceModel(STATUS.ROADMAP).detection).toBe('pending');
    expect(raspSurfaceModel(STATUS.ROADMAP).detectionLive).toBe(false);
  });

  it('resolves to "browser-active" for built', () => {
    expect(raspSurfaceModel(STATUS.BUILT).detection).toBe('browser-active');
    expect(raspSurfaceModel(STATUS.BUILT).detectionLive).toBe(true);
  });

  it('flips to "live" only for verified — proving it is derived', () => {
    expect(raspSurfaceModel(STATUS.VERIFIED).detection).toBe('live');
    expect(raspSurfaceModel(STATUS.VERIFIED).detectionLive).toBe(true);
  });
});

describe('P2-8: RaspSecurity uses useRaspArtifact() as its source of truth', () => {
  it('reads the source file and confirms useRaspArtifact is imported and called', () => {
    // Structural pin: the page must consume the shared hook, not sample its own
    // probes inline. This is what makes G4-A foreground / G4-B heartbeat
    // re-probes and the attestation axis reach the dashboard.
    const fs = require('node:fs');
    const path = require('node:path');
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'RaspSecurity.jsx'), 'utf8');
    expect(src).toMatch(/useRaspArtifact/);
    expect(src).toMatch(/useRaspArtifact\s*\(/);
    // And no longer samples the native probe inline (P2-8 fix).
    expect(src).not.toMatch(/setNativeProbe/);
  });
});

describe('RaspSecurity — active-behaviour render (no status vocabulary)', () => {
  const el = RaspSecurity();
  const t = allText(el);

  it('shows the active runtime-integrity banner', () => {
    expect(t).toMatch(/runtime integrity checks active/i);
    expect(t).toMatch(/before every signature/i);
    expect(t).toMatch(/a compromised one is refused/i);
  });

  it('carries NO build-status / audit / roadmap vocabulary', () => {
    expect(t).not.toMatch(/\bbuilt\b/i);
    expect(t).not.toMatch(/\bpending\b/i);
    expect(t).not.toMatch(/independent audit|2026-06-23|browser lane/i);
    expect(t).not.toMatch(/phase\s*4/i);
    expect(t).not.toMatch(/native build|not yet wired/i);
  });

  it('shows the live condition readout (clean under the default mocked artifact)', () => {
    expect(t).toMatch(/Current environment/i);
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

describe('P2-8: composed tier includes the attestation axis (BLOCK on INTEGRITY_FAIL)', () => {
  it('renders BLOCK-tier UI when the composed artifact says INTEGRITY_FAIL', () => {
    // Simulate the exact P2-8 gap this refactor closes: OS probe CLEAN but
    // remote attestation says INTEGRITY_FAIL. composeConditions promotes to
    // INTEGRITY_FAIL, degrade → BLOCK, and the dashboard must reflect that.
    withArtifact(
      {
        tier: 'block',
        sentence: 'This device failed an integrity check, so signing and key access are turned off.',
        blockedActions: ['sign', 'seed-reveal', 'export', 'import'],
        requiresBiometric: false,
        condition: 'integrity-fail',
      },
      () => {
        const el = RaspSecurity();
        const t = allText(el);
        // The condition label reflects the composed axis, not "clean".
        expect(t).toMatch(/integrity[- ]fail/i);
        // The rendered element carries the composed condition value.
        const flat = JSON.stringify(shape(el));
        expect(flat).toMatch(/rasp-condition-value/);
      },
    );
  });
});

describe('RaspSecurity — honest omissions (§2)', () => {
  const t = allText(RaspSecurity());
  it('makes no "active monitoring" claim', () => {
    expect(t).not.toMatch(/is actively monitoring/i);
    expect(t).not.toMatch(/monitoring all/i);
    expect(t).not.toMatch(/runtime is clean/i);
  });
  it('has no scan button / blocked-IPs language', () => {
    expect(t).not.toMatch(/run scan/i);
    expect(t).not.toMatch(/blocked ip/i);
  });
});

describe('RaspSecurity — deniability parity (§3, D2/D4): identical real-vs-decoy', () => {
  function renderUnderActiveSet(activeSet) {
    globalThis.__VEYRNOX_ACTIVE_SET__ = activeSet;
    try {
      return RaspSecurity();
    } finally {
      delete globalThis.__VEYRNOX_ACTIVE_SET__;
    }
  }
  it('renders a structurally + textually identical tree for real vs decoy', () => {
    const real = renderUnderActiveSet('real');
    const decoy = renderUnderActiveSet('decoy');
    expect(JSON.stringify(shape(decoy))).toBe(JSON.stringify(shape(real)));
    expect(texts(decoy)).toEqual(texts(real));
  });
});
