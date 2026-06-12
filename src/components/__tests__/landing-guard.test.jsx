// Regression test for the /landing route-guard lock bypass.
//
// BUG: <Route path="/landing"> was a SIBLING of <Route element={<WalletGate/>}>,
// so a WebView reload to /landing rendered the public marketing page regardless
// of vault/lock state — a locked wallet defeated by a reload. That is an I4
// fail-OPEN (absence of the gate reveals content).
//
// FIX: LandingGuard renders the public LandingPage ONLY on a confirmed
// vaultExists === false (genuine first run). A vault that exists — or existence
// that cannot yet be confirmed (null / still checking) — redirects to '/', which
// flows through WalletGate to the PIN pad.
//
// These tests mock useWallet() to supply the resolved context, and mock
// LandingPage to a sentinel so render assertions are unambiguous. LandingGuard
// is a pure function of context here (it touches no real React hooks beyond the
// mocked useWallet), so we invoke it directly and inspect the returned element.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { Navigate } from 'react-router-dom';

// The committed vitest.config.js has no @vitejs/plugin-react, so esbuild compiles
// this file's (and the guard's) JSX with the CLASSIC runtime — `React.createElement`
// as a free identifier. We invoke LandingGuard() directly (no DOM render), so React
// must be resolvable in scope when its JSX evaluates. Expose it as a global; this is
// a no-op under the automatic runtime, so the shim is correct either way.
globalThis.React = React;

vi.mock('@/lib/WalletProvider', () => ({ useWallet: vi.fn() }));
// Sentinel LandingPage so an assertion on the returned element type is exact.
vi.mock('@/pages/LandingPage', () => ({ default: function LandingPageSentinel() { return null; } }));

import { useWallet } from '@/lib/WalletProvider';
import LandingPage from '@/pages/LandingPage';
import LandingGuard from '@/components/LandingGuard';

beforeEach(() => {
  vi.mocked(useWallet).mockReset();
});

describe('LandingGuard — closes the reload-to-/landing lock bypass', () => {
  it('renders nothing while the vault check is pending (no public flash)', () => {
    vi.mocked(useWallet).mockReturnValue({ vaultExists: null, vaultChecking: true });
    expect(LandingGuard()).toBeNull();
  });

  it('renders the public LandingPage only on a confirmed no-vault device', () => {
    vi.mocked(useWallet).mockReturnValue({ vaultExists: false, vaultChecking: false });
    const out = LandingGuard();
    expect(out.type).toBe(LandingPage);
  });

  it('redirects to / when a vault exists (the lock bypass is closed)', () => {
    vi.mocked(useWallet).mockReturnValue({ vaultExists: true, vaultChecking: false });
    const out = LandingGuard();
    expect(out.type).toBe(Navigate);
    expect(out.props.to).toBe('/');
    expect(out.props.replace).toBe(true);
  });

  // I4 regression test — the bug's direct inverse. An unknown (error) result must
  // NEVER reveal the public page; it fails closed to the gate.
  it('redirects (does NOT reveal LandingPage) when vaultExists is null after the check', () => {
    vi.mocked(useWallet).mockReturnValue({ vaultExists: null, vaultChecking: false });
    const out = LandingGuard();
    expect(out.type).toBe(Navigate);
    expect(out.props.to).toBe('/');
    expect(out.type).not.toBe(LandingPage);
  });

  // I3 (deniability): the decision keys ONLY on vaultExists. With a vault present,
  // a real device and a decoy device — arbitrary stealth/duress flags either way —
  // must produce the IDENTICAL redirect. Proves the guard ignores set state.
  it('ignores stealth/duress/cardinality state — real and decoy devices behave identically', () => {
    const variants = [
      { hasStealthPool: true, hasDuressPin: true, walletCount: 3 },
      { hasStealthPool: false, hasDuressPin: false, walletCount: 1 },
      { hasStealthPool: true, hasDuressPin: false, walletCount: 7 },
    ];
    const outputs = variants.map((extra) => {
      vi.mocked(useWallet).mockReturnValue({ vaultExists: true, vaultChecking: false, ...extra });
      const out = LandingGuard();
      return { type: out.type, to: out.props.to };
    });
    // All identical: same redirect type, same target, regardless of set state.
    for (const o of outputs) {
      expect(o.type).toBe(Navigate);
      expect(o.to).toBe('/');
    }
  });
});
