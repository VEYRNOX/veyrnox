import { describe, it, expect } from 'vitest';
import { resolveOnboardingEntry } from '../onboardingEntry.js';

describe('resolveOnboardingEntry (PIN-first onboarding order)', () => {
  it('fresh device (no vault) lands on the welcome screen — NEVER the dashboard', () => {
    // The welcome hero sits AHEAD of PIN-create as the fresh-device landing; from
    // it "Get Started" advances to the PIN. It is a branding screen, not a
    // dashboard, so the PIN-first security order is preserved.
    expect(resolveOnboardingEntry({ hasVault: false })).toBe('welcome');
  });

  it('existing vault lands on the unlock surface', () => {
    expect(resolveOnboardingEntry({ hasVault: true })).toBe('unlock');
  });

  it('never returns an explore/dashboard view for a fresh device', () => {
    // The regression guard: explore/dashboard-first is the mis-build the brief
    // forbids. A fresh device must never land on a wallet-bearing surface.
    const view = resolveOnboardingEntry({ hasVault: false });
    expect(view).not.toBe('choose');
    expect(view).not.toBe('explore');
    expect(view).not.toBe('pin-create'); // welcome comes first now
  });
});
