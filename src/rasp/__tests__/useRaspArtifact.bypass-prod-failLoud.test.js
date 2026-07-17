// src/rasp/__tests__/useRaspArtifact.bypass-prod-failLoud.test.js
//
// P2 issue #1107 — VITE_BYPASS_RASP is a build-time dev override that returned
// CLEAN unconditionally. If a release build ships with the env var set (a
// mis-configured CI, a leaked .env, a manual override), all RASP checks are
// silently disabled — no on-screen surface, no CI gate. This is a fail-OPEN
// hole in a security-critical control (I4).
//
// Layer 2 (runtime): if BOTH `import.meta.env.PROD` is true AND the bypass flag
// is set, the hook MUST log `[SECURITY] VITE_BYPASS_RASP is enabled in a
// PRODUCTION build — RASP is disabled. This must never ship.` and return
// TIER.BLOCK (fail-closed). Dev/test builds retain the CLEAN bypass behaviour
// so the on-device testing use case is preserved.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false },
}));
vi.mock('@capacitor/app', () => ({
  App: { addListener: () => Promise.resolve({ remove() {} }) },
}));

describe('useRaspArtifact — #1107 VITE_BYPASS_RASP prod fail-loud', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('returns TIER.BLOCK (fail-closed) and logs [SECURITY] when bypass=true on PROD build', async () => {
    vi.stubEnv('VITE_BYPASS_RASP', '1');
    vi.stubEnv('PROD', true);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { useRaspArtifact } = await import('../useRaspArtifact.js');
    const { TIER } = await import('../conditions.js');
    const { result } = renderHook(() => useRaspArtifact());
    expect(result.current.tier).toBe(TIER.BLOCK);
    expect(errSpy).toHaveBeenCalled();
    const msg = errSpy.mock.calls[0][0];
    expect(msg).toMatch(/\[SECURITY\]/);
    expect(msg).toMatch(/VITE_BYPASS_RASP/);
    expect(msg).toMatch(/PRODUCTION/);
  });

  it('returns CLEAN/ALLOW (unchanged behaviour) when bypass=true on non-PROD build', async () => {
    vi.stubEnv('VITE_BYPASS_RASP', '1');
    vi.stubEnv('PROD', false);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { useRaspArtifact } = await import('../useRaspArtifact.js');
    const { TIER } = await import('../conditions.js');
    const { result } = renderHook(() => useRaspArtifact());
    expect(result.current.tier).toBe(TIER.ALLOW);
    expect(errSpy).not.toHaveBeenCalled();
  });
});
