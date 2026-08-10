import { describe, it, expect } from 'vitest';
import { resolveOnboardingEntry } from '../onboardingEntry.js';

describe('resolveOnboardingEntry (PIN-first onboarding order)', () => {
  it('fresh device (no vault) lands on the entry-tiles picker — NEVER the dashboard', () => {
    // Slice D1 (docs/superpowers/plans/2026-08-10-entry-tiles-slice-d1.md)
    // replaces the single WelcomeHero landing with a 3-tile picker
    // (New / Have / Advanced). The tile screen sits AHEAD of PIN-create in the
    // same slot WelcomeHero used to occupy — it is still a pre-PIN, pre-vault,
    // branding-only surface with no wallet reads, so PIN-first is preserved.
    // Previous assertion (kept for reference in this comment): expected 'welcome'.
    expect(resolveOnboardingEntry({ hasVault: false })).toBe('entry-tiles');
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
    expect(view).not.toBe('pin-create'); // entry-tiles comes first now, pin-create is Phase 1 after tile pick
  });
});
