// Tests for the WalletEntry gate decision — the single rule that picks the
// top-level screen at the auth front door (components/WalletEntry.jsx).
//
// ONBOARDING INVARIANT (the property these tests pin):
//   The "Unlock your wallet / Vault Password" screen appears ONLY when an
//   encrypted vault actually exists on this device. A first-time user (no vault)
//   never sees the unlock wall — they land on the browsable, view-only explore
//   dashboard with a Create/Import action, OR (if explore was left / the probe
//   errored) the first-run "choose" form. A returning user (vault exists) gets
//   the unlock screen; once unlocked, the app renders.
//
// These cases mirror the inline cascade WalletEntry used to carry; extracting it
// here makes the decision pure + testable so the onboarding gate can't regress
// into showing an unlock wall to a wallet-less user.

import { describe, it, expect } from 'vitest';
import { resolveEntryScreen, initialEntryView } from '@/lib/entryGate';

describe('resolveEntryScreen — top-level screen at the front door', () => {
  it('shows the app once unlocked (no backup hold pending)', () => {
    expect(resolveEntryScreen({ isUnlocked: true, vaultExists: true, exploreMode: false, generatedSeed: '' })).toBe('app');
  });

  it('HOLDS on the form (not the app) during the one-time seed-backup step after create', () => {
    // create already unlocked the vault, but a seed is being shown for backup —
    // the app must not reveal until the user confirms.
    expect(resolveEntryScreen({ isUnlocked: true, vaultExists: false, exploreMode: true, generatedSeed: 'word word …' })).toBe('form');
  });

  it('shows the explore dashboard for a wallet-less user browsing view-only', () => {
    expect(resolveEntryScreen({ isUnlocked: false, vaultExists: false, exploreMode: true, generatedSeed: '' })).toBe('explore');
  });

  it('shows the first-run form (not explore) when a wallet-less user has left explore', () => {
    expect(resolveEntryScreen({ isUnlocked: false, vaultExists: false, exploreMode: false, generatedSeed: '' })).toBe('form');
  });

  it('shows the loading spinner while the vault probe is still in flight', () => {
    expect(resolveEntryScreen({ isUnlocked: false, vaultExists: null, exploreMode: false, generatedSeed: '' })).toBe('loading');
  });

  it('shows the form (unlock) for a returning user whose vault exists', () => {
    expect(resolveEntryScreen({ isUnlocked: false, vaultExists: true, exploreMode: false, generatedSeed: '' })).toBe('form');
  });

  it('NEVER shows explore when a vault exists — a returning user is never put in explore mode', () => {
    // Even if exploreMode were somehow set, a present vault forbids the explore
    // shell: explore is strictly the no-vault state.
    expect(resolveEntryScreen({ isUnlocked: false, vaultExists: true, exploreMode: true, generatedSeed: '' })).toBe('form');
  });
});

describe('initialEntryView — first sub-view once the vault probe resolves', () => {
  it('routes a returning user (vault exists) to the unlock view', () => {
    expect(initialEntryView(true)).toBe('unlock');
  });

  it('routes a first-time user (no vault) to the choose view', () => {
    expect(initialEntryView(false)).toBe('choose');
  });
});

describe('onboarding invariant — the unlock screen requires a real vault', () => {
  // The unlock wall only ever renders when resolveEntryScreen === 'form' AND the
  // sub-view is 'unlock'. The sub-view is 'unlock' only when initialEntryView was
  // given a present vault. So no combination of a wallet-less device can produce
  // the unlock wall: it's either 'explore', 'loading', or 'form'+'choose'.
  it('a wallet-less device never resolves to an unlock view', () => {
    for (const exploreMode of [true, false]) {
      const screen = resolveEntryScreen({ isUnlocked: false, vaultExists: false, exploreMode, generatedSeed: '' });
      const view = initialEntryView(false);
      const isUnlockWall = screen === 'form' && view === 'unlock';
      expect(isUnlockWall).toBe(false);
    }
  });
});
