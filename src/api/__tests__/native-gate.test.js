// Regression test for the native-app auth-entry routing bug.
//
// BUG: the native (Capacitor) build is produced with the demo *data* layer
// (`mobile:build:demo` → VITE_DEMO_MODE=1). That made WALLET_AUTH false, which
// turned the on-device WalletGate into a pass-through AND routed Exit/sign-out
// to the marketing /landing page — i.e. a native app sending the user to the
// website for auth. The fix derives WALLET_GATE = WALLET_AUTH || NATIVE so the
// in-app WalletEntry gate is ALWAYS the entry point on a native platform, even
// in a demo-data build, while the WEB demo tour stays a gate-less pass-through.
//
// These tests pin the platform-dependent derivation by mocking @capacitor/core
// and the DEMO flag, then re-importing base44Client with a fresh module graph.

import { describe, it, expect, vi, beforeEach } from 'vitest';

async function loadFlags({ native, demo }) {
  vi.resetModules();
  vi.doMock('@capacitor/core', () => ({
    Capacitor: { isNativePlatform: () => native },
  }));
  vi.doMock('@/api/demoClient', () => ({
    DEMO: demo,
    demoBase44: { auth: { logout: () => {} }, entities: {} },
  }));
  vi.doMock('@/api/localClient', () => ({
    localBase44: { auth: {}, entities: {} },
  }));
  return import('@/api/base44Client');
}

describe('native auth-entry gating (base44Client)', () => {
  beforeEach(() => vi.resetModules());

  it('NATIVE demo build gates in-app (WALLET_GATE true) — the bug fix', async () => {
    const { NATIVE, WALLET_AUTH, WALLET_GATE } = await loadFlags({ native: true, demo: true });
    expect(NATIVE).toBe(true);
    // demo data layer → not the local account flag …
    expect(WALLET_AUTH).toBe(false);
    // … but a native build MUST still enter at the in-app WalletEntry gate,
    // never the /landing marketing page.
    expect(WALLET_GATE).toBe(true);
  });

  it('NATIVE local build gates in-app (WALLET_GATE true)', async () => {
    const { NATIVE, WALLET_GATE } = await loadFlags({ native: true, demo: false });
    expect(NATIVE).toBe(true);
    expect(WALLET_GATE).toBe(true);
  });

  it('WEB demo tour stays a gate-less pass-through (WALLET_GATE false) — unchanged', async () => {
    const { NATIVE, WALLET_GATE } = await loadFlags({ native: false, demo: true });
    expect(NATIVE).toBe(false);
    expect(WALLET_GATE).toBe(false);
  });

  it('WEB local build gates in-app (WALLET_GATE true)', async () => {
    const { NATIVE, WALLET_AUTH, WALLET_GATE } = await loadFlags({ native: false, demo: false });
    expect(NATIVE).toBe(false);
    expect(WALLET_AUTH).toBe(true);
    expect(WALLET_GATE).toBe(true);
  });
});
