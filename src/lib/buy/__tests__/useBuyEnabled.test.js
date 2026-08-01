import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/wallet-core/deniabilitySession.js', () => ({
  isDeniabilityOrDemoActive: vi.fn(() => false),
  DENIABILITY_SESSION_CHANGED_EVENT: 'veyrnox:deniability-session-changed',
}));

import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession.js';

describe('isBuyEnabled', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.restoreAllMocks());

  it('returns false when VITE_BUY_ENABLED is not true', async () => {
    vi.stubEnv('VITE_BUY_ENABLED', '');
    const { isBuyEnabled } = await import('../useBuyEnabled.js');
    expect(isBuyEnabled()).toBe(false);
  });

  it('returns false when VITE_BUY_ENABLED=true but deniability is active', async () => {
    vi.stubEnv('VITE_BUY_ENABLED', 'true');
    isDeniabilityOrDemoActive.mockReturnValue(true);
    const { isBuyEnabled } = await import('../useBuyEnabled.js');
    expect(isBuyEnabled()).toBe(false);
  });

  it('returns true when VITE_BUY_ENABLED=true and no deniability', async () => {
    vi.stubEnv('VITE_BUY_ENABLED', 'true');
    isDeniabilityOrDemoActive.mockReturnValue(false);
    const { isBuyEnabled } = await import('../useBuyEnabled.js');
    expect(isBuyEnabled()).toBe(true);
  });
});

describe('useBuyEnabled hook', () => {
  it('returns false when ship gate is off regardless of deniability', async () => {
    vi.stubEnv('VITE_BUY_ENABLED', '');
    isDeniabilityOrDemoActive.mockReturnValue(false);
    const { useBuyEnabled } = await import('../useBuyEnabled.js');
    const { result } = renderHook(() => useBuyEnabled());
    expect(result.current).toBe(false);
  });

  it('returns false when deniability flips to active mid-session', async () => {
    vi.stubEnv('VITE_BUY_ENABLED', 'true');
    isDeniabilityOrDemoActive.mockReturnValue(false);
    const { useBuyEnabled } = await import('../useBuyEnabled.js');
    const { result } = renderHook(() => useBuyEnabled());
    expect(result.current).toBe(true);

    act(() => {
      isDeniabilityOrDemoActive.mockReturnValue(true);
      window.dispatchEvent(new Event('veyrnox:deniability-session-changed'));
    });
    expect(result.current).toBe(false);
  });
});
