// src/pages/__tests__/WalletConnect.demoNotice.test.jsx
//
// Demo mode is a backend-less walkthrough with no unlocked vault. The dApp
// Connector deliberately never simulates WC sessions (the old fake session
// pages were deleted as fake-security CRITICALs), so before this notice the
// page fell through to the generic "Unlock your wallet to connect to dApps."
// message — which reads as broken in demo. This guards the honest, explicit
// "disabled in demo" notice instead, and that it wins over both the
// "not configured" and "locked" branches.

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

// --- DEMO is the only flag this notice may depend on (I3: no isDecoy/isHidden). ---
vi.mock('@/api/demoClient', () => ({ DEMO: true }));

// Isolate from the real provider (owned by a parallel in-flight change) and from
// any real WC/network wiring — this test only cares about the demo branch render.
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

describe('WalletConnect page — honest "disabled in demo" notice', () => {
  it('renders the demo notice instead of the generic locked message', async () => {
    const { default: WalletConnect } = await import('@/pages/WalletConnect');
    render(<WalletConnect />);

    expect(screen.getByTestId('wc-demo-notice')).toBeTruthy();
    expect(screen.getByText(/Disabled in demo mode/i)).toBeTruthy();
    expect(screen.getByText(/dApp sessions are never simulated/i)).toBeTruthy();
    expect(screen.getByText(/\/\?demo=0/)).toBeTruthy();

    // Must win over the generic locked message even though isUnlocked is false.
    expect(screen.queryByText(/Unlock your wallet to connect to dApps\./i)).toBeNull();
  });

  it('still shows the Popular dApps shortcuts below the notice (display-only)', async () => {
    const { default: WalletConnect } = await import('@/pages/WalletConnect');
    render(<WalletConnect />);

    expect(screen.getByText(/Popular dApps/i)).toBeTruthy();
  });
});
