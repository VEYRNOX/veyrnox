// @ts-nocheck
// The spend-limit fields are USD-denominated, and a bare number field beside a
// Currency selector reads as "amount of the selected coin". A "$" affordance
// must therefore be visible the WHOLE time the user types — not injected into
// the value, because parseLocaleNumber in the save handler has to see exactly
// what was typed (see the de-DE "1,5" comment those inputs carry).
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const rows = [];
const limitCreate = vi.fn(async (r) => ({ id: 'new', ...r }));
const limitUpdate = vi.fn(async () => ({}));
const limitDelete = vi.fn(async () => ({}));
vi.mock('@/api/base44Client', () => ({
  base44: {
    entities: {
      UserSession: { filter: async () => [], create: async () => ({ id: 'x' }), update: async () => ({}) },
      TransactionLimit: {
        list: async () => rows.slice(),
        create: (...a) => limitCreate(...a),
        update: (...a) => limitUpdate(...a),
        delete: (...a) => limitDelete(...a),
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

// Deleting a limit is destructive and used to be one unconfirmed click, while
// sign-out on this same page already routes through a Dialog.
describe('deleting a spend limit asks first', () => {
  beforeEach(() => {
    localStorage.clear();
    window.matchMedia = window.matchMedia || ((q) => ({
      matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false,
    }));
    rows.length = 0;
    rows.push({ id: 'seed1', currency: 'ALL', daily_limit: null, per_transaction_limit: 500, enabled: true });
    limitDelete.mockClear();
  });

  const clickDelete = async () => {
    const tab = screen.getByRole('tab', { name: /spend limits/i });
    fireEvent.mouseDown(tab); fireEvent.focus(tab); fireEvent.click(tab);
    fireEvent.click(await screen.findByRole('button', { name: /delete ALL limit/i }));
  };

  it('does not delete on the first click — it names the cap and waits', async () => {
    wrap();
    await clickDelete();
    expect(await screen.findByText(/Delete this spending limit\?/i)).toBeTruthy();
    // The prompt must say WHICH cap: "Delete" alone does not identify a row.
    expect(screen.getByText(/\$500 per transaction/i)).toBeTruthy();
    expect(limitDelete).not.toHaveBeenCalled();
  });

  it('Cancel leaves the limit alone', async () => {
    wrap();
    await clickDelete();
    fireEvent.click(await screen.findByRole('button', { name: /^cancel$/i }));
    expect(limitDelete).not.toHaveBeenCalled();
  });

  it('confirming deletes that row', async () => {
    wrap();
    await clickDelete();
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /^delete$/i }));
    await waitFor(() => expect(limitDelete).toHaveBeenCalledWith('seed1'));
  });
});

// The seeded cap is a STARTING POINT, not a floor. Any positive amount is
// allowed — below $500 as well as above — and the only rejection is a
// non-positive or unparseable one. Pinned so nobody later "helpfully" adds a
// minimum and quietly traps a user who wants a tighter cap than the default.
describe('a limit can be set BELOW the seeded $500', () => {
  beforeEach(() => {
    localStorage.clear();
    window.matchMedia = window.matchMedia || ((q) => ({
      matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false,
    }));
    rows.length = 0;
    rows.push({ id: 'seed1', currency: 'ALL', daily_limit: null, per_transaction_limit: 500, enabled: true });
    limitUpdate.mockClear(); limitCreate.mockClear();
  });

  const editPerTxTo = async (value) => {
    const tab = screen.getByRole('tab', { name: /spend limits/i });
    fireEvent.mouseDown(tab); fireEvent.focus(tab); fireEvent.click(tab);
    fireEvent.click(await screen.findByRole('button', { name: /edit ALL limit/i }));
    fireEvent.change(screen.getByLabelText(/per transaction limit/i), { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
  };

  it.each(['50', '1', '12.5', '0.25'])('accepts %s — lower than the seeded default', async (value) => {
    wrap();
    await editPerTxTo(value);
    await waitFor(() => expect(limitUpdate).toHaveBeenCalledTimes(1));
    expect(limitUpdate.mock.calls[0][1].per_transaction_limit).toBe(Number(value));
  });

  it.each(['0', '-5', 'abc'])('still refuses %s, and writes nothing', async (value) => {
    wrap();
    await editPerTxTo(value);
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
    expect(limitUpdate).not.toHaveBeenCalled();
    expect(limitCreate).not.toHaveBeenCalled();
  });
});
