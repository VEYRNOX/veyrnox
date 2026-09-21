// @ts-nocheck
// Loosening a spend limit needs step-up (security diff 2026-09-21).
//
// Theft Protection's send-side biometric only fires when a limit blocks, so
// disabling, deleting or editing a limit without re-auth let someone holding an
// unlocked phone remove the cap and then send with no biometric. With Theft
// Protection on, those actions must pass its gate first; creating a limit only
// tightens and stays ungated.
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const rows = [{ id: 'l1', currency: 'ALL', daily_limit: null, per_transaction_limit: 500, enabled: true }];
const limitUpdate = vi.fn(async () => ({}));
const limitDelete = vi.fn(async () => ({}));
vi.mock('@/api/base44Client', () => ({
  base44: {
    entities: {
      UserSession: { filter: async () => [], create: async () => ({ id: 'x' }), update: async () => ({}) },
      TransactionLimit: {
        list: async () => rows.slice(),
        create: async (r) => r,
        update: (...a) => limitUpdate(...a),
        delete: (...a) => limitDelete(...a),
      },
      Transaction: { list: async () => [] },
    },
  },
}));
vi.mock('@/lib/WalletProvider', () => ({ useWallet: () => ({ isDecoy: false, isHidden: false }) }));
vi.mock('@/components/security/useActionGuard', () => ({
  useActionGuard: () => ({ requireTwoFactor: (fn) => fn(), gateModal: null }),
}));
vi.mock('@/lib/useAdvisorSnapshot', () => ({ useAdvisorSnapshot: () => ({}) }));
vi.mock('@/lib/sessionRevocation', () => ({ getSessionToken: () => 'tok', ensureSessionToken: () => 'tok' }));
vi.mock('@/wallet-core/deniabilitySession', () => ({ isDeniabilityOrDemoActive: () => false }));

const { gateMock } = vi.hoisted(() => ({ gateMock: vi.fn() }));
vi.mock('@/lib/theftProtection', () => ({
  isTheftProtectionEnabled: () => true,
  getTheftProtectionSupport: async () => ({ supported: true, reason: null }),
  runTheftProtectionGate: (...a) => gateMock(...a),
  theftProtectionMessage: () => 'Theft Protection check failed',
}));

import SecurityCenter from '@/pages/SecurityCenter';

const wrap = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><SecurityCenter /></QueryClientProvider>);
};

const openLimitsTab = async () => {
  const tab = screen.getByRole('tab', { name: /spend limits/i });
  fireEvent.mouseDown(tab);
  fireEvent.focus(tab);
  fireEvent.click(tab);
  await screen.findByRole('button', { name: /delete all limit/i });
};

const confirmDelete = async () => {
  fireEvent.click(screen.getByRole('button', { name: /delete all limit/i }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.click([...dialog.querySelectorAll('button')].find((b) => /delete/i.test(b.textContent)));
};

describe('spend-limit loosening requires Theft Protection step-up', () => {
  beforeEach(() => {
    limitUpdate.mockClear();
    limitDelete.mockClear();
    gateMock.mockReset();
    window.matchMedia = window.matchMedia || ((q) => ({
      matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false,
    }));
  });

  it('delete does not happen when the gate refuses', async () => {
    gateMock.mockRejectedValue(new Error('declined'));
    wrap();
    await openLimitsTab();
    await confirmDelete();
    await waitFor(() => expect(gateMock).toHaveBeenCalledWith({ isPrimary: true }));
    await new Promise((r) => setTimeout(r, 20));
    expect(limitDelete).not.toHaveBeenCalled();
  });

  it('delete proceeds once the gate passes', async () => {
    gateMock.mockResolvedValue(undefined);
    wrap();
    await openLimitsTab();
    await confirmDelete();
    await waitFor(() => expect(limitDelete).toHaveBeenCalledWith('l1'));
  });

  it('turning a limit off is gated; the switch does nothing when refused', async () => {
    gateMock.mockRejectedValue(new Error('declined'));
    wrap();
    await openLimitsTab();
    fireEvent.click(screen.getByRole('switch'));
    await waitFor(() => expect(gateMock).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(limitUpdate).not.toHaveBeenCalled();
  });
});
