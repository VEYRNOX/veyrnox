import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Minimal stubs so the component renders without crashing.
vi.mock('@/lib/WalletProvider', () => ({
  useWallet: () => ({
    wallets: [],
    isDecoy: false,
    isHidden: false,
    requireTwoFactor: vi.fn(),
    createHiddenWallet: vi.fn(),
    revealHiddenWallet: vi.fn(),
    deleteHiddenWallet: vi.fn(),
    recordAudit: vi.fn(),
    lockout: false,
    createWallet: vi.fn(),
  }),
}));
vi.mock('@/api/demoClient', () => ({ DEMO: false }));
vi.mock('@/api/base44Client', () => ({ base44: { from: () => ({ useCreate: () => [vi.fn(), {}] }) } }));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: [] }), useQueryClient: () => ({}) }));
vi.mock('@/lib/hiddenBalance', () => ({ HIDDEN_CHAINS: [], resolveHiddenBalance: vi.fn(), seedDemoHiddenBalance: vi.fn() }));
vi.mock('@/wallet-core/derivation', () => ({ deriveEvmAccount: vi.fn() }));
vi.mock('@/components/security/useActionGuard', () => ({ useActionGuard: () => ({ requireTwoFactor: vi.fn(), gateModal: null }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

import StealthWallets from '@/pages/StealthWallets';

describe('StealthWallets storage disclosure (VULN-4)', () => {
  it('renders a storage isolation disclosure', () => {
    render(<StealthWallets />);
    const el = screen.getByTestId('stealth-storage-disclosure');
    expect(el).toBeTruthy();
  });

  it('disclosure mentions IndexedDB and hardware-backed asymmetry', () => {
    render(<StealthWallets />);
    const els = screen.getAllByTestId('stealth-storage-disclosure');
    const el = els[0];
    const text = el.textContent.toLowerCase();
    expect(text).toMatch(/indexeddb|web storage/);
    expect(text).toMatch(/hardware/);
  });
});
