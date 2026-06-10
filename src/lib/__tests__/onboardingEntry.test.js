import { describe, it, expect } from 'vitest';
import { resolveOnboardingEntry } from '../onboardingEntry.js';

describe('resolveOnboardingEntry (PIN-first onboarding order)', () => {
  it('fresh device (no vault) lands on PIN-create — NEVER the dashboard', () => {
    // The regression guard: explore/dashboard-first is the mis-build the brief forbids.
    expect(resolveOnboardingEntry({ hasVault: false })).toBe('pin-create');
  });

  it('existing vault lands on the unlock surface', () => {
    expect(resolveOnboardingEntry({ hasVault: true })).toBe('unlock');
  });

  it('never returns an explore/dashboard view for a fresh device', () => {
    const view = resolveOnboardingEntry({ hasVault: false });
    expect(view).not.toBe('choose');
    expect(view).not.toBe('explore');
  });
});
