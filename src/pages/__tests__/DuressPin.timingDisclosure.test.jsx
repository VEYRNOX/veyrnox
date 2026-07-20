// D-02 — Emergency PIN unlock-timing disclosure.
//
// This file's copy + assertions describe the state AFTER PR #1000 (H-1
// unlock-timing equalizer), which has now LANDED on main — the timing oracle they
// used to disclose is CLOSED. (Historical note: this branch was held until #1000
// merged, so the page could not claim unlock timing is equalized before the
// equalizer was actually in main.)
//
// HISTORY: D-02 (2026-07-05 audit) accepted a residual where a correct primary
// unlock spent ~1 KDF FEWER than any Emergency-PIN / wrong-PIN outcome, making
// the real PIN distinguishable by unlock timing (VULN-17). PR #1000 closes it
// STRUCTURALLY — the primary-success path now runs the same deniability resolver
// (same KDF count AND param profile) every other outcome runs, so every unlock
// costs identical work by construction (deniabilityUnlock.js
// spendPrimaryUnlockEqualizerKdfs; unlockTimingEqualizer.h1.test.jsx). The copy
// therefore no longer discloses a live "real PIN is faster" tell — it discloses
// the EQUALIZATION and keeps the true in-room-vs-remote scope.
//
// HONESTY SCOPE (why the copy states a DESIGN property, not a guarantee): #1000
// is unit-proven (KDF count + param-profile parity), NOT device-timing-measured
// — a real-device timing-harness run remains an audit item — and it carries an
// accepted web-only rekey residual (first post-upgrade unlock of a legacy vault;
// non-production, native unaffected). So the user copy claims equal *work per
// unlock* (what the shipped native code structurally does), not a measured
// wall-clock guarantee. Those internal caveats live here + in #1000, not in
// user-facing copy.
//
// Requirement: the disclosure must be rendered UNCONDITIONALLY (not gated on
// whether an Emergency PIN is configured) — this page never computes an
// "is duress configured?" oracle (security-framing.test.js), and gating this
// disclosure on that state would create exactly the oracle the page avoids
// elsewhere (see the always-rendered Removal card for the same pattern).
//
// We assert STRUCTURE (testid + presence) and the load-bearing honesty words the
// copy carries: the equalization ("same effort on every unlock") and the honest
// scope ("someone in the room ... not ... a remote attacker"). We do NOT assert a
// Hardware-KEK/Hardware-Protection recommendation: re-adding it would overclaim —
// the duress *decoy* slot is not hardware-backed yet (duress.js:54-56) and a
// hardware KEK does not equalize this timing anyway. Keep this comment in sync
// with the assertions below; it must not claim a guard the test does not enforce.

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { mockSetDuressPin, mockEnableDecoyBiometricUnlock } = vi.hoisted(() => ({
  mockSetDuressPin: vi.fn(async () => ({ mnemonic: 'a b c', address: '0xDECOY' })),
  mockEnableDecoyBiometricUnlock: vi.fn(async () => true),
}));

vi.mock('@/lib/WalletProvider', () => ({
  useWallet: () => ({
    isUnlocked: true, isDecoy: false, accounts: [{ address: '0xREAL' }],
    hasVault: vi.fn(async () => true),
    hasDuressPin: vi.fn(async () => false),
    setDuressPin: mockSetDuressPin,
    removeDuressPin: vi.fn(),
    enableDecoyBiometricUnlock: mockEnableDecoyBiometricUnlock,
    createWallet: vi.fn(), unlock: vi.fn(), lock: vi.fn(), clearVault: vi.fn(),
  }),
}));

vi.mock('@/components/security/useActionGuard', () => ({
  useActionGuard: () => ({
    requireTwoFactor: (run) => run(),
    gateModal: null,
  }),
}));

vi.mock('@/lib/decoyBalance', () => ({
  resolveDecoyBalance: vi.fn(async () => ({ eth: '0', source: 'chain' })),
  seedDemoDecoyBalance: vi.fn(),
  DECOY_NETWORK_KEY: 'sepolia',
}));

vi.mock('@/api/demoClient', () => ({ DEMO: false }));

const { getBiometricStatus } = vi.hoisted(() => ({
  getBiometricStatus: vi.fn(async () => ({
    mode: 'web', available: false, label: 'Biometrics', simulated: false, detail: '',
  })),
}));
vi.mock('@/lib/biometric', () => ({ getBiometricStatus, isBiometricUnlockEnabled: () => false }));
vi.mock('@/lib/authModel', () => ({ getAuthModel: () => 'pin', isPinModel: () => true }));

import DuressPin from '@/pages/DuressPin';

async function renderSettled() {
  await act(async () => { render(<MemoryRouter><DuressPin /></MemoryRouter>); });
}

beforeEach(() => {
  mockSetDuressPin.mockClear();
  mockEnableDecoyBiometricUnlock.mockClear();
});
afterEach(() => { cleanup(); });

describe('DuressPin — D-02 timing oracle disclosure (visible, not just a code comment)', () => {
  it('renders the timing disclosure unconditionally, before any PIN is set up', async () => {
    await renderSettled();
    const el = screen.getByTestId('duress-timing-disclosure');
    expect(el).toBeTruthy();
  });

  it('discloses that every unlock spends the same effort (H-1 equalization) so the PIN used is not given away by timing', async () => {
    await renderSettled();
    const text = screen.getByTestId('duress-timing-disclosure').textContent.toLowerCase();
    // Post-#1000: the page discloses EQUALIZATION, not a live "real PIN is faster" tell.
    expect(text).toMatch(/same effort|same amount|every unlock/);
    // It must still name the two credentials the equalization is between.
    expect(text).toMatch(/emergency pin/);
    // And it must not claim the (removed) live timing tell.
    expect(text).not.toMatch(/faster|tell them apart/);
  });

  it('honestly keeps the scope: protects against an in-room coercer, NOT a remote/network adversary', async () => {
    await renderSettled();
    const text = screen.getByTestId('duress-timing-disclosure').textContent.toLowerCase();
    expect(text).toMatch(/in the room/);
    expect(text).toMatch(/remote/);
    expect(text).toMatch(/connection|network|watching/);
  });

  it('names both the real PIN and the Emergency PIN so the equalization is concrete, not vague', async () => {
    await renderSettled();
    const text = screen.getByTestId('duress-timing-disclosure').textContent;
    expect(text).toBeTruthy();
    // The core honesty requirement post-#1000: the disclosure exists and frames the
    // equal-work property against the two credentials it holds between.
    expect(text).toMatch(/real PIN/);
    expect(text).toMatch(/Emergency PIN/);
  });

  it('uses calm muted-foreground styling, not the caution/alert palette', async () => {
    await renderSettled();
    const el = screen.getByTestId('duress-timing-disclosure');
    // The paragraphs inside carry the calm tone class.
    const paragraphs = el.querySelectorAll('p');
    expect(paragraphs.length).toBeGreaterThan(0);
    paragraphs.forEach((p) => {
      expect(p.className).toMatch(/text-muted-foreground/);
    });
    expect(el.className).not.toMatch(/text-caution|bg-caution|text-destructive|bg-destructive/);
  });
});
