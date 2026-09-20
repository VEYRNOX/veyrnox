// @ts-nocheck
// The spend-limit fields are USD-denominated, and a bare number field beside a
// Currency selector reads as "amount of the selected coin". A "$" affordance
// must therefore be visible the WHOLE time the user types — not injected into
// the value, because parseLocaleNumber in the save handler has to see exactly
// what was typed (see the de-DE "1,5" comment those inputs carry).
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/api/base44Client', () => ({
  base44: {
    entities: {
      UserSession: { filter: async () => [], create: async () => ({ id: 'x' }), update: async () => ({}) },
      TransactionLimit: { list: async () => [], create: vi.fn(), update: vi.fn(), delete: vi.fn() },
      Transaction: { list: async () => [] },
    },
  },
}));
vi.mock('@/lib/WalletProvider', () => ({ useWallet: () => ({ isDecoy: false, isHidden: false }) }));
vi.mock('@/components/security/useActionGuard', () => ({
  useActionGuard: () => ({ requireTwoFactor: (fn) => fn(), TwoFactorDialog: () => null }),
}));
vi.mock('@/lib/useAdvisorSnapshot', () => ({ useAdvisorSnapshot: () => ({}) }));
vi.mock('@/lib/sessionRevocation', () => ({ getSessionToken: () => 'tok', ensureSessionToken: () => 'tok' }));
vi.mock('@/wallet-core/deniabilitySession', () => ({ isDeniabilityOrDemoActive: () => false }));

import SecurityCenter from '@/pages/SecurityCenter';

const wrap = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><SecurityCenter /></QueryClientProvider>);
};

// Radix Tabs do not switch on click alone under jsdom (no user-event here).
const openAddLimit = () => {
  const tab = screen.getByRole('tab', { name: /spend limits/i });
  fireEvent.mouseDown(tab);
  fireEvent.focus(tab);
  fireEvent.click(tab);
  fireEvent.click(screen.getAllByRole('button', { name: /add limit/i })[0]);
};

describe('spend-limit fields keep a visible $', () => {
  beforeEach(() => {
    localStorage.clear();
    // The dialog renders ui/select, which probes matchMedia at mount; jsdom has none.
    window.matchMedia = window.matchMedia || ((q) => ({
      matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false,
    }));
  });

  it('shows a $ beside BOTH amount fields, with room made for it', () => {
    wrap();
    openAddLimit();
    const daily = screen.getByLabelText(/daily limit/i);
    const perTx = screen.getByLabelText(/per transaction limit/i);

    for (const field of [daily, perTx]) {
      const group = field.parentElement;
      const marks = [...group.querySelectorAll('span')].filter((n) => n.textContent.trim() === '$');
      expect(marks).toHaveLength(1);
      // The glyph is decoration sitting ON the field: it must not eat clicks,
      // and the field must reserve inline-start room or the two overlap.
      expect(marks[0].className).toMatch(/pointer-events-none/);
      expect(field.className).toMatch(/\bps-7\b/);
    }
  });

  it('stays visible while typing and never enters the value', () => {
    wrap();
    openAddLimit();
    const daily = screen.getByLabelText(/daily limit/i);

    // de-DE decimal comma — the exact shape parseLocaleNumber exists to handle.
    fireEvent.change(daily, { target: { value: '1,5' } });
    expect(daily.value).toBe('1,5');
    expect(daily.value).not.toMatch(/\$/);

    const marks = [...daily.parentElement.querySelectorAll('span')].filter((n) => n.textContent.trim() === '$');
    expect(marks).toHaveLength(1);
  });
});
