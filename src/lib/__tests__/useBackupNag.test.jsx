// useBackupNag — React hook contract (Slice G+H plan §1 + §4).
//
// RED phase: hook does not yet exist. Pins the mount-side race: mounting the
// sheet MUST NOT touch cadence state (no self-unmount race). shouldShow stays
// true across renders until a user action fires.

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';

vi.mock('@/wallet-core/deniabilitySession', () => ({
  isDeniabilityOrDemoActive: vi.fn(() => false),
}));

async function loadHook() {
  return await import('@/lib/useBackupNag');
}

async function loadBackupNag() {
  return await import('@/lib/backupNag');
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
  vi.resetModules();
});

describe('useBackupNag', () => {
  it('returns { shouldShow, dismissForSession, promoteToCompleted, markBackupNagShown }', async () => {
    const { useBackupNag } = await loadHook();
    let captured;
    function T() { captured = useBackupNag(['0xaaa']); return null; }
    render(<T />);
    expect(captured).toBeDefined();
    expect(typeof captured.shouldShow).toBe('boolean');
    expect(typeof captured.dismissForSession).toBe('function');
    expect(typeof captured.promoteToCompleted).toBe('function');
    expect(typeof captured.markBackupNagShown).toBe('function');
  });

  it('re-renders when backupNag notifies (via useSyncExternalStore)', async () => {
    const { useBackupNag } = await loadHook();
    const { dismissForSession } = await loadBackupNag();
    const seen = [];
    function T() { seen.push(useBackupNag(['0xaaa']).shouldShow); return null; }
    render(<T />);
    const before = seen.length;
    act(() => { dismissForSession(); });
    expect(seen.length).toBeGreaterThan(before);
    expect(seen.at(-1)).toBe(false);
  });

  it('mount alone does NOT call markBackupNagShown (no self-unmount race)', async () => {
    const backupNag = await loadBackupNag();
    const spy = vi.spyOn(backupNag, 'markBackupNagShown');
    const { useBackupNag } = await loadHook();
    function T() { useBackupNag(['0xaaa']); return null; }
    render(<T />);
    expect(spy).not.toHaveBeenCalled();
  });

  it('shouldShow stays true across N re-renders with no user interaction', async () => {
    const { useBackupNag } = await loadHook();
    const results = [];
    function T() { results.push(useBackupNag(['0xaaa']).shouldShow); return null; }
    const { rerender } = render(<T />);
    for (let i = 0; i < 5; i++) rerender(<T />);
    expect(results.every((v) => v === true)).toBe(true);
  });
});
