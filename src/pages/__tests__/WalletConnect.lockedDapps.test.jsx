// src/pages/__tests__/WalletConnect.lockedDapps.test.jsx
//
// The locked branch (real wallet, locked, NOT demo) used to render only the
// heading plus "Unlock your wallet to connect to dApps." — a nearly blank page
// that reads as broken. The other two non-connected branches (demo, project ID
// not configured) both show the display-only Popular dApps shortcuts. This
// guards that the locked branch does too, while staying honest: no pairing UI,
// no sessions, no simulated connections — the unlock prompt is still the only
// path to real WC functionality.

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

// NOT demo — this test targets the plain locked branch specifically.
vi.mock('@/api/demoClient', () => ({ DEMO: false }));

// Isolate from the real provider and any real WC/network wiring — this test
// only cares about the locked branch render.
vi.mock('@/lib/WalletConnectProvider.jsx', () => ({
  WalletConnectProvider: ({ children }) => <>{children}</>,
  useWalletConnect: () => ({
    initialized: false,
    error: null,
    pendingProposals: [],
    pendingRequests: [],
    pair: vi.fn(),
  }),
}));

vi.mock('@/lib/WalletProvider.jsx', () => ({
  useWallet: () => ({ isUnlocked: false }),
}));

afterEach(() => cleanup());

describe('WalletConnect page — locked branch still shows Popular dApps', () => {
  it('renders the unlock prompt AND the display-only Popular dApps grid', async () => {
    const { default: WalletConnect } = await import('@/pages/WalletConnect');
    render(<WalletConnect />);

    expect(screen.getByText(/Unlock your wallet to connect to dApps\./i)).toBeTruthy();
    expect(screen.getByText(/Popular dApps/i)).toBeTruthy();
  });

  it('does not render pairing UI or session sections while locked', async () => {
    const { default: WalletConnect } = await import('@/pages/WalletConnect');
    render(<WalletConnect />);

    expect(screen.queryByPlaceholderText('wc:...')).toBeNull();
    expect(screen.queryByText(/Active sessions/i)).toBeNull();
    // And it is not mistaken for the demo branch.
    expect(screen.queryByTestId('wc-demo-notice')).toBeNull();
  });
});
