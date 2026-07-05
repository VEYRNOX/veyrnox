// PW-01 (MEDIUM) — In-app guarded wipe must re-authenticate before wiping.
//
// The in-app "Wipe this device now" action was gated ONLY by typing "WIPE" + a
// checkbox — no re-auth. A coercer on an already-unlocked device could wipe in
// seconds. This pins that handleInAppWipe routes through useActionGuard's
// requireTwoFactor: when the 2FA/re-auth gate does NOT pass (its callback is
// never invoked), the wipe MUST NOT run (panicWipe is never called). I4 fail-closed.

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';

const { mockPanicWipe } = vi.hoisted(() => ({
  mockPanicWipe: vi.fn(async () => ({
    clean: true, vaultBlobCount: 0, indexedDbKeys: [], localStorageResidue: [],
  })),
}));

vi.mock('@/lib/WalletProvider', () => ({
  useWallet: () => ({
    isUnlocked: true, wasWiped: false,
    hasVault: vi.fn(async () => true),
    setDuressPin: vi.fn(), setPanicPin: vi.fn(),
    panicWipe: mockPanicWipe,
    inspectKeyMaterial: vi.fn(async () => ({ clean: true, vaultBlobCount: 0, indexedDbKeys: [], localStorageResidue: [] })),
    addHiddenWallet: vi.fn(), createWallet: vi.fn(), unlock: vi.fn(), lock: vi.fn(),
  }),
}));

vi.mock('@/api/demoClient', () => ({ DEMO: false }));

// The gate FAILS: requireTwoFactor NEVER runs its callback (unpassed 2FA/re-auth).
vi.mock('@/components/security/useActionGuard', () => ({
  useActionGuard: () => ({
    requireTwoFactor: vi.fn(/* callback intentionally never invoked */),
    gateModal: null,
  }),
}));

import PanicWipe from '@/pages/PanicWipe';

async function renderSettled() {
  await act(async () => { render(<PanicWipe />); });
}

beforeEach(() => { mockPanicWipe.mockClear(); });
afterEach(() => { cleanup(); });

describe('PanicWipe — in-app wipe requires re-auth (PW-01)', () => {
  it('does NOT run the wipe when the re-auth gate is not passed', async () => {
    await renderSettled();

    // Arm the confirm word + acknowledgement so the button is enabled.
    const input = screen.getByPlaceholderText('WIPE');
    fireEvent.change(input, { target: { value: 'WIPE' } });
    fireEvent.click(screen.getByRole('checkbox'));

    const btn = screen.getByRole('button', { name: /Destroy local keys/i });
    await act(async () => { fireEvent.click(btn); });

    // Gate never passed → wipe must not execute.
    expect(mockPanicWipe).not.toHaveBeenCalled();
  });
});
