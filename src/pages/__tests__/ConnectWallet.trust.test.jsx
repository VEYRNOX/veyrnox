import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Trust Wallet has no injected desktop provider — its tile must hand off to the
// WalletConnect connector (paste-URI flow), never fake injected-provider support.
const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

// Base44 client is unused by the WalletConnect path but imported at module load.
vi.mock('@/api/base44Client', () => ({
  base44: { entities: { Wallet: { create: vi.fn() } } },
}));
vi.mock('@/lib/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const ConnectWallet = (await import('../ConnectWallet')).default;

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ConnectWallet />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // No injected wallets present in the test DOM.
  delete window.ethereum;
  delete window.solana;
});

describe('ConnectWallet — Trust Wallet (WalletConnect tile)', () => {
  it('renders a Trust Wallet tile labelled as WalletConnect', () => {
    renderPage();
    expect(screen.getByText('Trust Wallet')).toBeInTheDocument();
    // The "WalletConnect" affordance distinguishes it from injected-provider tiles.
    expect(screen.getByText('WalletConnect')).toBeInTheDocument();
  });

  it('routes to the WalletConnect connector instead of opening an install URL', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /trust wallet/i }));
    expect(navigateMock).toHaveBeenCalledWith('/walletconnect');
    // Must NOT fall through to the not-detected install-link branch.
    expect(openSpy).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });

  it('does not fake injected-provider detection (no "Detected" badge on Trust Wallet)', () => {
    renderPage();
    // "Detected" would falsely claim an injected provider it cannot have.
    expect(screen.queryByText('Detected')).not.toBeInTheDocument();
  });
});
