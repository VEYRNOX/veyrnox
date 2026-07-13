// @ts-nocheck
// CryptoSigning.i3.test.jsx
//
// I3 deniability guard: message-signing must be blocked in decoy and hidden
// sessions (fail-closed, I4). The signing page signs with the active session's
// real wallet key, so allowing it in a deniability session would produce a
// verifiable signature tied to an identity the user is actively denying.
//
// Guards required:
//   (1) Render-time: deniability session renders the blocked state (no sign UI).
//   (2) Sign-time: even if the UI guard is bypassed, signMsg() refuses to call
//       withPrivateKey (defense-in-depth).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// --- deniability session state -----------------------------------------------
let deniabilityActive = false;
vi.mock('@/wallet-core/deniabilitySession.js', () => ({
  isDeniabilitySessionActive: () => deniabilityActive,
}));

// --- wallet provider ---------------------------------------------------------
const withPrivateKey = vi.fn(async (_i, fn) => fn('0xPRIVATEKEY'));
let walletState = {};
vi.mock('@/lib/WalletProvider', () => ({
  useWallet: () => walletState,
}));

// --- message signing toggle: ON so the toggle gate doesn't interfere ---------
vi.mock('@/lib/useMessageSigningEnabled', () => ({
  useMessageSigningEnabled: () => true,
}));

// --- RASP: ALLOW so the RASP gate doesn't interfere -------------------------
vi.mock('@/rasp', () => ({
  degrade: () => ({ tier: 'ALLOW' }),
  detect: () => ({}),
  TIER: { BLOCK: 'BLOCK', ALLOW: 'ALLOW' },
  browserProbeSource: {},
}));
vi.mock('@/sign-gate/presign', () => ({
  presignGate: () => ({ proceedAllowed: true, signerReachable: true }),
}));

vi.mock('ethers', () => ({
  ethers: {
    Wallet: class {
      async signMessage() { return '0xSIGNATURE'; }
    },
    verifyMessage: () => '0x1111111111111111111111111111111111111111',
  },
}));

const REAL_ADDR = '0x1111111111111111111111111111111111111111';

import CryptoSigning from '../CryptoSigning.jsx';

function renderPage() {
  return render(<MemoryRouter><CryptoSigning /></MemoryRouter>);
}

const unlockedWallet = {
  isUnlocked: true,
  accounts: [{ address: REAL_ADDR, path: "m/44'/60'/0'/0/0", index: 0 }],
  withPrivateKey,
};

beforeEach(() => {
  withPrivateKey.mockClear();
  deniabilityActive = false;
  walletState = { ...unlockedWallet };
});
afterEach(() => cleanup());

// Confirm baseline: normal session allows signing.
describe('CryptoSigning — I3 baseline: normal session signs', () => {
  it('shows the sign UI when deniability is inactive', () => {
    renderPage();
    expect(screen.getByLabelText(/message to sign/i)).toBeTruthy();
  });

  it('calls withPrivateKey in a normal session', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /sign message/i }));
    await waitFor(() => expect(withPrivateKey).toHaveBeenCalledTimes(1));
  });
});

// Render-time guard.
describe('CryptoSigning — I3 render guard: deniability session blocks the UI', () => {
  it('does NOT render the sign UI in a deniability session', () => {
    deniabilityActive = true;
    renderPage();
    expect(screen.queryByLabelText(/message to sign/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /sign message/i })).toBeNull();
  });

  it('renders a blocked / not-available state in a deniability session', () => {
    deniabilityActive = true;
    renderPage();
    // The exact wording is an implementation detail; assert something visible
    // that conveys unavailability without leaking the session type.
    const content = document.body.textContent;
    expect(/not available|unavailable|session/i.test(content)).toBe(true);
  });
});

// Sign-time guard (defense-in-depth).
describe('CryptoSigning — I3 sign-time guard: withPrivateKey never called in deniability session', () => {
  it('never calls withPrivateKey even if signMsg is invoked in a deniability session', async () => {
    // Render in normal session so the sign button is present, then flip the
    // deniability flag to simulate a race / bypass attempt before clicking.
    renderPage();
    deniabilityActive = true;
    const btn = screen.getByRole('button', { name: /sign message/i });
    fireEvent.click(btn);
    // Give any async path time to settle.
    await waitFor(() => {}, { timeout: 100 }).catch(() => {});
    expect(withPrivateKey).not.toHaveBeenCalled();
  });
});
