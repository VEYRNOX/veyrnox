// @ts-nocheck
// CryptoSigning.realWallet.test.jsx
//
// The /crypto-signing page now signs with the user's REAL wallet via
// useWallet().withPrivateKey(0, fn) — NOT a random ephemeral key — and is gated
// behind the OFF-by-default "Message signing" toggle (fail-closed, I4).
//
// States asserted:
//   1. toggle OFF (default) → honest "turned off" state, NO message input,
//      withPrivateKey NEVER called.
//   2. toggle ON + locked → unlock prompt.
//   3. toggle ON + unlocked → real accounts[0].address shown; Sign calls
//      withPrivateKey(0, ...) and shows the returned signature.
//   4. no private-key / mnemonic reveal control exists anywhere.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// --- mock the wallet context -------------------------------------------------
const withPrivateKey = vi.fn(async (_i, fn) => fn('0xPRIVATEKEY'));
let walletState = {
  isUnlocked: false,
  isDecoy: false,
  isHidden: false,
  accounts: [],
  withPrivateKey,
};
vi.mock('@/lib/WalletProvider', () => ({
  useWallet: () => walletState,
}));

// --- mock the message-signing preference ------------------------------------
let signingEnabled = false;
vi.mock('@/lib/messageSigning', () => ({
  isMessageSigningEnabled: () => signingEnabled,
  MESSAGE_SIGNING_CHANGED_EVENT: 'veyrnox:message-signing-changed',
}));
vi.mock('@/lib/useMessageSigningEnabled', () => ({
  useMessageSigningEnabled: () => signingEnabled,
}));

// --- mock the RASP pre-sign gate to ALLOW so signing can proceed ------------
vi.mock('@/rasp', () => ({
  useRaspArtifact: () => ({ tier: 'ALLOW' }),
  degrade: () => ({ tier: 'ALLOW' }),
  detect: () => ({}),
  TIER: { BLOCK: 'BLOCK', ALLOW: 'ALLOW' },
  browserProbeSource: {},
}));
vi.mock('@/sign-gate/presign', () => ({
  presignGate: () => ({ proceedAllowed: true, signerReachable: true }),
}));

// ethers signMessage → deterministic signature; verifyMessage → the real addr.
const REAL_ADDR = '0x1111111111111111111111111111111111111111';
vi.mock('ethers', () => ({
  ethers: {
    Wallet: class {
      constructor(pk) { this.pk = pk; }
      async signMessage(_m) { return '0xSIGNATURE'; }
    },
    verifyMessage: () => REAL_ADDR,
  },
}));

import CryptoSigning from '../CryptoSigning.jsx';

function renderPage() {
  return render(
    <MemoryRouter>
      <CryptoSigning />
    </MemoryRouter>
  );
}

beforeEach(() => {
  withPrivateKey.mockClear();
  signingEnabled = false;
  walletState = { isUnlocked: false, isDecoy: false, isHidden: false, accounts: [], withPrivateKey };
});
afterEach(() => cleanup());

describe('CryptoSigning — real wallet, gated (toggle OFF default)', () => {
  it('renders the honest "turned off" state and no signing UI', () => {
    signingEnabled = false;
    renderPage();
    expect(screen.getByText(/turned off/i)).toBeTruthy();
    expect(screen.queryByLabelText(/message to sign/i)).toBeNull();
  });

  it('never calls withPrivateKey when the toggle is off', () => {
    signingEnabled = false;
    renderPage();
    expect(withPrivateKey).not.toHaveBeenCalled();
  });
});

describe('CryptoSigning — toggle ON, locked', () => {
  it('prompts the user to unlock', () => {
    signingEnabled = true;
    walletState = { ...walletState, isUnlocked: false, accounts: [] };
    renderPage();
    expect(screen.getByText(/unlock your wallet/i)).toBeTruthy();
    expect(screen.queryByLabelText(/message to sign/i)).toBeNull();
  });
});

describe('CryptoSigning — toggle ON, unlocked', () => {
  beforeEach(() => {
    signingEnabled = true;
    walletState = {
      isUnlocked: true,
      isDecoy: false,
      isHidden: false,
      accounts: [{ address: REAL_ADDR, path: "m/44'/60'/0'/0/0", index: 0 }],
      withPrivateKey,
    };
  });

  it('shows the real wallet address', () => {
    renderPage();
    expect(screen.getByText(REAL_ADDR)).toBeTruthy();
  });

  it('signs via withPrivateKey(0, ...) and shows the signature', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /sign message/i }));
    await waitFor(() => {
      expect(withPrivateKey).toHaveBeenCalledTimes(1);
      expect(withPrivateKey.mock.calls[0][0]).toBe(0);
    });
    await waitFor(() => expect(screen.getByText('0xSIGNATURE')).toBeTruthy());
  });
});

describe('CryptoSigning — no key-material reveal exists', () => {
  it('renders no private-key or mnemonic reveal controls in any state', () => {
    signingEnabled = true;
    walletState = {
      isUnlocked: true,
      isDecoy: false,
      isHidden: false,
      accounts: [{ address: REAL_ADDR, path: "m/44'/60'/0'/0/0", index: 0 }],
      withPrivateKey,
    };
    renderPage();
    expect(screen.queryByLabelText(/private key/i)).toBeNull();
    expect(screen.queryByLabelText(/recovery phrase/i)).toBeNull();
    expect(screen.queryByLabelText(/reveal.*key/i)).toBeNull();
    expect(screen.queryByText(/mnemonic/i)).toBeNull();
  });
});
