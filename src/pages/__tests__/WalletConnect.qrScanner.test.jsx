import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/api/demoClient', () => ({ DEMO: false }));

const pair = vi.fn();

vi.mock('@/lib/WalletConnectProvider.jsx', () => ({
  WalletConnectProvider: ({ children }) => <>{children}</>,
  useWalletConnect: () => ({
    initialized: true,
    error: null,
    pendingProposals: [],
    pendingRequests: [],
    pair,
  }),
}));

vi.mock('@/lib/WalletProvider.jsx', () => ({
  useWallet: () => ({
    isUnlocked: true,
    isDecoy: false,
    isHidden: false,
  }),
}));

vi.mock('@/components/QRScanner', () => ({
  default: function MockQrScanner({ onClose, onScan }) {
    return (
      <div data-testid="mock-qr-scanner">
        <button type="button" onClick={() => onScan(`wc:${'a'.repeat(64)}@2?relay-protocol=irn&symKey=${'b'.repeat(64)}`)}>
          Simulate scan
        </button>
        <button type="button" onClick={onClose}>Close scanner</button>
      </div>
    );
  },
}));

vi.mock('@/components/walletconnect/ActiveSessions.jsx', () => ({
  ActiveSessions: () => <div data-testid="mock-active-sessions" />,
}));

afterEach(() => {
  cleanup();
  pair.mockReset();
});

describe('WalletConnect page QR scanner entry point', () => {
  it('opens the scanner and fills the URI field from a scanned WalletConnect code', async () => {
    const { default: WalletConnect } = await import('@/pages/WalletConnect');
    render(<WalletConnect />);

    fireEvent.click(screen.getByRole('button', { name: /scan walletconnect qr code/i }));
    expect(screen.getByTestId('mock-qr-scanner')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /simulate scan/i }));

    const input = /** @type {HTMLInputElement} */ (screen.getByPlaceholderText('wc:...'));
    expect(input.value).toMatch(/^wc:/);
    expect(input.value).toContain('relay-protocol=irn');
    expect(screen.queryByTestId('mock-qr-scanner')).toBeNull();
    expect(pair).not.toHaveBeenCalled();
  });

  it('accepts only valid WalletConnect URIs in the QR parser helper', async () => {
    const { parseWalletConnectQr } = await import('@/pages/WalletConnect');
    const valid = `wc:${'c'.repeat(64)}@2?relay-protocol=irn&symKey=${'d'.repeat(64)}`;

    expect(parseWalletConnectQr(valid)).toBe(valid);
    expect(parseWalletConnectQr('https://example.com')).toBeNull();
    expect(parseWalletConnectQr('')).toBeNull();
  });
});
