// @ts-nocheck
// The spend-limit fields are USD-denominated, and a bare number field beside a
// Currency selector reads as "amount of the selected coin". A "$" affordance
// must therefore be visible the WHOLE time the user types — not injected into
// the value, because parseLocaleNumber in the save handler has to see exactly
// what was typed (see the de-DE "1,5" comment those inputs carry).
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const rows = [];
const limitCreate = vi.fn(async (r) => ({ id: 'new', ...r }));
const limitUpdate = vi.fn(async () => ({}));
vi.mock('@/api/base44Client', () => ({
  base44: {
    entities: {
      UserSession: { filter: async () => [], create: async () => ({ id: 'x' }), update: async () => ({}) },
      TransactionLimit: {
        list: async () => rows.slice(),
        create: (...a) => limitCreate(...a),
        update: (...a) => limitUpdate(...a),
        delete: vi.fn(),
      },
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

// Editing a limit in place (#2682 follow-up). Before this, the only way to
// change a cap was delete + re-add — and "raising" it by adding a bigger limit
// alongside does nothing, because evaluateSendAgainstLimits blocks when ANY
// matching limit is breached, so the smaller row keeps winning.
describe('a spend limit can be adjusted in place', () => {
  beforeEach(() => {
    localStorage.clear();
    window.matchMedia = window.matchMedia || ((q) => ({
      matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false,
    }));
    rows.length = 0;
    rows.push({ id: 'seed1', currency: 'ALL', daily_limit: null, per_transaction_limit: 500, enabled: true });
    limitUpdate.mockClear();
    limitCreate.mockClear();
  });

  // The row arrives from the (async) tx-limits query, so wait for its control.
  const openEdit = async () => {
    const tab = screen.getByRole('tab', { name: /spend limits/i });
    fireEvent.mouseDown(tab); fireEvent.focus(tab); fireEvent.click(tab);
    fireEvent.click(await screen.findByRole('button', { name: /edit ALL limit/i }));
  };

  it('prefills the existing amount and UPDATES that row instead of adding a second one', async () => {
    wrap();
    await openEdit();
    expect(await screen.findByText(/Edit Transaction Limit/i)).toBeTruthy();
    const perTx = screen.getByLabelText(/per transaction limit/i);
    expect(perTx.value).toBe('500');

    fireEvent.change(perTx, { target: { value: '1000' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(limitUpdate).toHaveBeenCalledTimes(1));
    expect(limitUpdate).toHaveBeenCalledWith('seed1', {
      currency: 'ALL', daily_limit: null, per_transaction_limit: 1000,
    });
    // The whole point: no second row appears to be out-voted by the first.
    expect(limitCreate).not.toHaveBeenCalled();
  });

  it('does not re-arm a limit the user disabled', async () => {
    rows[0].enabled = false;
    wrap();
    await openEdit();
    fireEvent.change(screen.getByLabelText(/per transaction limit/i), { target: { value: '750' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(limitUpdate).toHaveBeenCalledTimes(1));
    expect(Object.keys(limitUpdate.mock.calls[0][1])).not.toContain('enabled');
  });

  it('Add Limit still creates, and opens empty even after an edit', async () => {
    wrap();
    await openEdit();
    expect(screen.getByLabelText(/per transaction limit/i).value).toBe('500');
    fireEvent.keyDown(document.activeElement || document.body, { key: 'Escape', code: 'Escape' });

    fireEvent.click(screen.getAllByRole('button', { name: /^add limit$/i })[0]);
    expect(await screen.findByText(/Add Transaction Limit/i)).toBeTruthy();
    expect(screen.getByLabelText(/per transaction limit/i).value).toBe('');

    fireEvent.change(screen.getByLabelText(/daily limit/i), { target: { value: '2000' } });
    fireEvent.click(screen.getByRole('button', { name: /save limit/i }));
    await waitFor(() => expect(limitCreate).toHaveBeenCalledTimes(1));
    expect(limitCreate.mock.calls[0][0].enabled).toBe(true);
    expect(limitUpdate).not.toHaveBeenCalled();
  });
});
