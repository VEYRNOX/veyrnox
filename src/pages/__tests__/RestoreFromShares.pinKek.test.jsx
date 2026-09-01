// RestoreFromShares — 2026-09-01 native PIN + KEK re-enrol handoff.
// Covers:
//   (a) Native platform surfaces the 8-digit PIN input, not the passphrase.
//   (b) An existing vault on this device blocks Continue with a clear error
//       (contingency: keyStore.createVault would silently overwrite).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' },
}));

let restoreFromRecoveryBundles;
let vaultExistsValue = false;
vi.mock('@/lib/WalletProvider', () => ({
  useWallet: () => ({
    restoreFromRecoveryBundles,
    vaultExists: vaultExistsValue,
  }),
}));

let RestoreFromShares;

beforeEach(async () => {
  vi.resetModules();
  restoreFromRecoveryBundles = vi.fn(async () => {});
  vaultExistsValue = false;
  ({ default: RestoreFromShares } = await import('@/pages/RestoreFromShares'));
});

afterEach(() => cleanup());

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/onboarding/restore-shares']}>
      <Routes>
        <Route path="/onboarding/restore-shares" element={<RestoreFromShares />} />
        <Route path="/" element={<div data-testid="home" />} />
      </Routes>
    </MemoryRouter>,
  );
}

function loadShares() {
  let inputs = screen.getAllByPlaceholderText(/"shareIndex"/i);
  fireEvent.change(inputs[0], { target: { value: '{"v":1,"shareIndex":1}' } });
  inputs = screen.getAllByPlaceholderText(/"shareIndex"/i);
  fireEvent.change(inputs[1], { target: { value: '{"v":1,"shareIndex":2}' } });
  fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
}

describe('RestoreFromShares — native PIN + KEK handoff', () => {
  it('renders the 8-digit PIN input on native', () => {
    renderPage();
    loadShares();
    expect(screen.getByPlaceholderText(/new 8-digit PIN/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/confirm PIN/i)).toBeInTheDocument();
    // The passphrase field must NOT be reachable on the native path.
    expect(screen.queryByPlaceholderText(/new passphrase/i)).toBeNull();
  });

  it('blocks Continue when a vault already exists on this device', () => {
    vaultExistsValue = true;
    renderPage();
    // Even with shares loaded, Continue must not advance to the PIN step.
    let inputs = screen.getAllByPlaceholderText(/"shareIndex"/i);
    fireEvent.change(inputs[0], { target: { value: '{"v":1,"shareIndex":1}' } });
    inputs = screen.getAllByPlaceholderText(/"shareIndex"/i);
    fireEvent.change(inputs[1], { target: { value: '{"v":1,"shareIndex":2}' } });
    const cont = screen.getByRole('button', { name: /^continue$/i });
    expect(cont).toBeDisabled();
    // The upfront red banner explains the contingency.
    expect(screen.getAllByRole('alert')[0]).toHaveTextContent(/Panic Wipe/i);
    expect(screen.queryByPlaceholderText(/new 8-digit PIN/i)).toBeNull();
  });
});
