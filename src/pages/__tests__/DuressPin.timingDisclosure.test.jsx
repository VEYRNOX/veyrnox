// D-02 (2026-07-05 internal audit, ACCEPTED RESIDUAL) — Emergency PIN timing
// oracle disclosure. Primary unlock is ~1 KDF faster than Emergency-PIN (or
// wrong-PIN) unlock (VULN-17, src/wallet-core/deniabilityUnlock.js:72-79). This
// pins the VISIBLE, honest disclosure so it can't regress back into a code
// comment or be silently dropped.
//
// Requirement: the disclosure must be rendered UNCONDITIONALLY (not gated on
// whether an Emergency PIN is configured) — this page never computes an
// "is duress configured?" oracle (security-framing.test.js), and gating this
// disclosure on that state would create exactly the oracle the page avoids
// elsewhere (see the always-rendered Removal card for the same pattern).
//
// We assert STRUCTURE (testid + presence) and load-bearing honesty words
// (network monitoring / not protection against / Hardware KEK), not full prose.

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
vi.mock('@/lib/biometric', () => ({ getBiometricStatus }));
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

  it('explains that a network-monitoring coercer could potentially distinguish real vs Emergency PIN unlocks by timing', async () => {
    await renderSettled();
    const text = screen.getByTestId('duress-timing-disclosure').textContent.toLowerCase();
    expect(text).toMatch(/network/);
    expect(text).toMatch(/faster/);
    expect(text).toMatch(/tell them apart/);
  });

  it('honestly states duress PIN is NOT protection against a remote/network-monitoring adversary', async () => {
    await renderSettled();
    const text = screen.getByTestId('duress-timing-disclosure').textContent.toLowerCase();
    expect(text).toMatch(/not someone remote/);
    expect(text).toMatch(/someone in the room/);
  });

  it('acknowledges this is a known trade-off', async () => {
    await renderSettled();
    const text = screen.getByTestId('duress-timing-disclosure').textContent;
    expect(text).toBeTruthy();
    // The core honesty requirement: the disclosure exists and acknowledges the timing tell.
    expect(text).toMatch(/real PIN unlocks faster/);
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
