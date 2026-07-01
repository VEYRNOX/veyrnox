// src/components/security/__tests__/HiddenWallet2faGate.failClosed.test.jsx
//
// QA hardening #1 (latent hardcode): HiddenWallet2faGate.verify() previously passed
// `actionPasswordConfigured: true` HARDCODED into evaluateTwoFactor, which made the
// gate's own NOT_CONFIGURED fail-closed branch DEAD. This test reaches the verify()
// closure directly (via TwoFactorGate's verify prop) and proves that when the mode is
// PASSWORD but the active set carries NO Action Password record, the gate returns
// NOT-verified — the fail-closed branch is now live. Fail-closed must hold.
//
// #3 (dead Back button): with onCancel passed as undefined, TwoFactorGate must render
// NO "Back" button inside the un-dismissable hidden-wallet modal.

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

// Capture the props TwoFactorGate is mounted with so we can drive verify() directly
// and assert on onCancel — without needing to type into the real Argon2id fields.
let capturedGateProps = null;
vi.mock('@/components/security/TwoFactorGate', () => ({
  default: (props) => { capturedGateProps = props; return <div data-testid="tfg" />; },
}));

let mockWalletContext;
vi.mock('@/lib/WalletProvider', () => ({ useWallet: () => mockWalletContext }));

vi.mock('@/lib/passkey', () => ({
  isPasskeyRegistered: vi.fn(() => false),
  verifyPasskeyAssertion: vi.fn(),
}));
vi.mock('@/lib/biometric', () => ({
  is2faBiometricEnabled: vi.fn(() => false),
  verifyBiometric2fa: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import HiddenWallet2faGate from '../HiddenWallet2faGate';

beforeEach(() => {
  capturedGateProps = null;
  mockWalletContext = {
    isHidden: true,
    hiddenWallet2faMode: 'password',
    actionPasswordConfigured: false, // <-- active set has NO Action Password record
    verifyActiveCredentialDetailed: vi.fn(async () => ({ ok: true, bricked: false })),
    verifyActionPassword: vi.fn(async () => true), // even if this "passes"...
    lock: vi.fn(),
  };
});
afterEach(cleanup);

describe('HiddenWallet2faGate — fail-closed when Action Password is not configured (#1)', () => {
  it('password mode + no AP record => verify() returns NOT-verified (NOT_CONFIGURED branch is live)', async () => {
    render(<HiddenWallet2faGate />);
    expect(capturedGateProps).toBeTruthy();

    // Drive the real verify() closure. PIN + Action Password both "verify" at the
    // impure layer, but the active set has NO Action Password configured, so the
    // pure gate must still refuse. This is the branch the hardcode had killed.
    const verdict = await capturedGateProps.verify({ pin: '12345678', password: 'whatever' });
    expect(verdict.allowed).toBe(false);
  });

  it('with a configured AP + both factors ok => verify() allows (control)', async () => {
    mockWalletContext.actionPasswordConfigured = true;
    render(<HiddenWallet2faGate />);
    const verdict = await capturedGateProps.verify({ pin: '12345678', password: 'ap-secret' });
    expect(verdict.allowed).toBe(true);
  });

  it('does not render a dead Back button — onCancel is undefined (#3)', () => {
    render(<HiddenWallet2faGate />);
    expect(capturedGateProps.onCancel).toBeUndefined();
  });
});
