// RTE-05 — the invoice count header didn't pluralize ("1 invoices").
// Fixed with the same inline ternary pattern already used elsewhere in the
// app for hardcoded (non-i18next) English strings, e.g.
// RestoreFromFile.jsx (`attempt${n === 1 ? '' : 's'}`) and pinAttemptGuard.js.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

const useQuerySpy = vi.fn();
vi.mock('@tanstack/react-query', () => ({
  useQuery: (opts) => useQuerySpy(opts),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock('@/lib/WalletProvider', () => ({
  useWallet: () => ({ isDecoy: false, isHidden: false }),
}));
vi.mock('@/wallet-core/deniabilitySession', () => ({
  isDeniabilityOrDemoActive: () => false,
}));
vi.mock('@/api/demoClient', () => ({ DEMO: false }));
vi.mock('@/api/base44Client', () => ({
  base44: { entities: { Invoice: { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() } } },
}));

import InvoiceGenerator from '@/pages/InvoiceGenerator';

beforeEach(() => {
  useQuerySpy.mockReset();
});
afterEach(() => {
  cleanup();
});

describe('InvoiceGenerator — invoice count pluralization (RTE-05)', () => {
  it('singular for exactly 1 invoice', () => {
    useQuerySpy.mockReturnValue({
      data: [{ id: '1', status: 'draft', total_amount: 10 }],
      isLoading: false,
      isError: false,
    });
    render(<InvoiceGenerator />);
    expect(screen.getByText(/^1 invoice · /)).toBeTruthy();
    expect(screen.queryByText(/1 invoices/)).toBeNull();
  });

  it('pluralizes for 0 invoices', () => {
    useQuerySpy.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<InvoiceGenerator />);
    expect(screen.getByText(/^0 invoices · /)).toBeTruthy();
  });

  it('pluralizes for more than 1 invoice', () => {
    useQuerySpy.mockReturnValue({
      data: [
        { id: '1', status: 'draft', total_amount: 10 },
        { id: '2', status: 'paid', total_amount: 20 },
      ],
      isLoading: false,
      isError: false,
    });
    render(<InvoiceGenerator />);
    expect(screen.getByText(/^2 invoices · /)).toBeTruthy();
  });
});
