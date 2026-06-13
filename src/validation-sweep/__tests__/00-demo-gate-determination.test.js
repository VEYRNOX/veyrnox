// Validation sweep — FOUNDATIONAL FINDING (hard-rule #3: "determine first what
// ?demo=1 actually loads").
//
// The brief's premise is that the onboarding / PIN state machine can be exercised
// at http://localhost:5173/?demo=1. RECONNAISSANCE SHOWS THAT IS FALSE for the
// web build:
//
//   demoClient.js   : ?demo=1  ->  DEMO = true
//   base44Client.js : BACKEND  = DEMO ? 'demo' : 'local'
//                     WALLET_AUTH = BACKEND === 'local'      // => false in demo
//                     NATIVE      = Capacitor.isNativePlatform() // => false on web
//                     WALLET_GATE = WALLET_AUTH || NATIVE    // => false in web demo
//   WalletGate.jsx  : if (!WALLET_GATE) return <Outlet/>     // => pass-through, NO gate
//   Dashboard.jsx   : if (!DEMO) return <WalletPortfolioPage/>; return <DemoDashboard/>
//
// So in WEB demo mode the create/import/unlock gate (WalletEntry) is bypassed and a
// pre-seeded tour renders. The onboarding state machine ONLY runs in the default
// LOCAL build (no ?demo). This was CONFIRMED LIVE: /?demo=1 renders no PIN pad;
// /?demo=0 (no vault) renders the "Get Started" welcome hero.
//
// These tests lock that determination in the verify gate via source assertions
// (the booleans are resolved at module load from window.location, so a source
// contract is the stable, deterministic way to assert the wiring). See the report:
// FLAG F1.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('FLAG F1 — ?demo=1 (web) bypasses the WalletGate; onboarding is NOT reachable there', () => {
  const base44 = read('../../api/base44Client.js');
  const gate = read('../../components/WalletGate.jsx');
  const dash = read('../../pages/Dashboard.jsx');

  it('the gate boolean is WALLET_AUTH || NATIVE, and WALLET_AUTH is BACKEND==="local"', () => {
    expect(base44).toContain("export const BACKEND = DEMO ? 'demo' : 'local'");
    expect(base44).toContain("export const WALLET_AUTH = BACKEND === 'local'");
    expect(base44).toContain('export const WALLET_GATE = WALLET_AUTH || NATIVE');
  });

  it('WalletGate renders a gate-less <Outlet/> whenever WALLET_GATE is false (the demo pass-through)', () => {
    expect(gate).toContain('if (!WALLET_GATE) return <Outlet />');
  });

  // Truth table for the WEB build (NATIVE === false). Reconstructs the exact
  // formula from base44Client so the conclusion is mechanical, not asserted.
  it('truth table: web demo => gate bypassed; web local => gate enforced', () => {
    const NATIVE = false; // plain web / test env (Capacitor absent)
    const gateFor = (demo) => {
      const BACKEND = demo ? 'demo' : 'local';
      const WALLET_AUTH = BACKEND === 'local';
      return WALLET_AUTH || NATIVE; // WALLET_GATE
    };
    expect(gateFor(/* demo */ true)).toBe(false);  // ?demo=1 -> NO gate
    expect(gateFor(/* demo */ false)).toBe(true);   // local   -> gate enforced
  });

  it('Dashboard renders the REAL WalletPortfolioPage only in the local build; DemoDashboard under demo', () => {
    // Confirms real-mode vs demo-mode render DIVERGE (relevant to structural-identity
    // expectations and to which surfaces carry the wallet-count tells, see FLAG D1).
    expect(dash).toContain('if (!DEMO) return <WalletPortfolioPage />');
  });
});

describe('FLAG F1 (corollary) — the demo opt-in PERSISTS silently in localStorage', () => {
  const demoClient = read('../../api/demoClient.js');

  // CLAUDE.md "known trap": a single ?demo=1 visit writes veyrnox-demo=1 and demo
  // then stays on across reloads with a bare "/" URL. A validation run that fails to
  // clear it will silently test the fake-seeded tour instead of the real build.
  it('a ?demo=1 visit writes veyrnox-demo=1 to localStorage (persists across reloads)', () => {
    expect(demoClient).toContain('localStorage.setItem("veyrnox-demo", "1")');
    expect(demoClient).toContain('localStorage.getItem("veyrnox-demo") === "1"');
  });
});
