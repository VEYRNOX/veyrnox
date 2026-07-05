// DuressPin screen — Emergency-PIN removal under the deniability framing guard
// (deniability model v2, owner-approved 2026-06-22; see security-framing.test.js).
//
// Pins the UI contract:
//   - The removal control is ALWAYS rendered — it must not be gated on a
//     configured-vs-not probe of the duress slot. The mocked wallet context
//     deliberately provides NO hasDuressPin, so any probe crashes the render.
//   - Removing runs the SAME flow regardless of slot state:
//     removeDuressPin() (idempotent) then lock().
//   - Copy never states whether an Emergency PIN is set ("is configured" /
//     "already set" are configured-state oracles).

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { mockRemoveDuressPin, mockLock } = vi.hoisted(() => ({
  mockRemoveDuressPin: vi.fn(async () => {}),
  mockLock: vi.fn(),
}));

// NOTE: no hasDuressPin key — the page must never ask "is it set?".
vi.mock('@/lib/WalletProvider', () => ({
  useWallet: () => ({
    isUnlocked: true, isDecoy: false, accounts: [{ address: '0xREAL' }],
    hasVault: vi.fn(async () => true),
    setDuressPin: vi.fn(async () => ({ mnemonic: 'a b c', address: '0xDECOY' })),
    removeDuressPin: mockRemoveDuressPin,
    enableDecoyBiometricUnlock: vi.fn(async () => true),
    createWallet: vi.fn(), unlock: vi.fn(), lock: mockLock, clearVault: vi.fn(),
  }),
}));

// Action guard: run the action immediately (no 2FA configured).
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

vi.mock('@/lib/biometric', () => ({
  getBiometricStatus: vi.fn(async () => ({
    mode: 'web', available: false, label: 'Biometrics', simulated: false, detail: '',
  })),
}));

vi.mock('@/lib/authModel', () => ({ getAuthModel: () => 'pin', isPinModel: () => true }));

import DuressPin from '@/pages/DuressPin';

async function renderSettled() {
  await act(async () => { render(<MemoryRouter><DuressPin /></MemoryRouter>); });
}

beforeEach(() => {
  mockRemoveDuressPin.mockClear();
  mockLock.mockClear();
});
afterEach(() => { cleanup(); });

describe('DuressPin — removal without a configured-state oracle', () => {
  it('always renders the removal control, without probing slot presence', async () => {
    await renderSettled();
    expect(await screen.findByTestId('remove-duress-pin-btn')).toBeTruthy();
  });

  it('removal runs the same idempotent flow regardless of slot state: removeDuressPin then lock', async () => {
    await renderSettled();
    const btn = await screen.findByTestId('remove-duress-pin-btn');
    await act(async () => { fireEvent.click(btn); });
    await waitFor(() => expect(mockRemoveDuressPin).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockLock).toHaveBeenCalledTimes(1));
  });

  it('copy never states whether an Emergency PIN is set', async () => {
    await renderSettled();
    await screen.findByTestId('remove-duress-pin-btn');
    const text = document.body.textContent;
    expect(text).not.toMatch(/is configured/i);
    expect(text).not.toMatch(/already set/i);
  });
});
