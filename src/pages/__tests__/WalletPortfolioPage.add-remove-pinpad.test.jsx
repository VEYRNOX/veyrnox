// WalletPortfolioPage — the Add-wallet and Remove-wallet dialogs authorise a
// change against the SAME vault credential used to unlock (addWallet/removeWallet
// → decryptPrimaryContainer). For the PIN cohort (every real vault post-PR #651)
// they must therefore render the 8-digit PIN pad, NOT a free-text password box —
// a numeric pad cannot accept a password and a password box cannot accept the PIN,
// so a cohort mismatch here is a hard lockout (the bug class of PR #645/#651).
// Regression guard for the owner report: "creating an additional wallet requests
// Password — should be an 8-digit PIN pad." The password cohort keeps its legacy
// free-text input so a pre-#651 vault is never locked out.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';

vi.mock('@/lib/WalletProvider', () => ({ useWallet: vi.fn() }));

let authModelValue = 'pin';
vi.mock('@/lib/authModel', () => ({
  getAuthModel: vi.fn(() => authModelValue),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));

import { useWallet } from '@/lib/WalletProvider';
import { AddWalletDialog, RemoveDialog } from '@/pages/WalletPortfolioPage';

function makeCtx(overrides = {}) {
  return {
    addWallet: vi.fn(async () => ({ walletId: 'w2', mnemonic: 'a b c' })),
    importAdditionalWallet: vi.fn(async () => ({ walletId: 'w2' })),
    confirmWalletBackup: vi.fn(),
    removeWallet: vi.fn(async () => {}),
    ...overrides,
  };
}

// Radix Dialog portals its content to document.body, so query there, not the
// render container. A numeric PinPad exposes digit buttons + a submit control
// whose accessible name is the hardcoded aria-label "Submit PIN" (the visible
// submitLabel is cosmetic). A password surface is an <input type="password">.
const body = () => within(document.body);
const hasPinPad = () =>
  !!body().queryByRole('button', { name: 'Submit PIN' }) &&
  !!body().queryByRole('button', { name: '1' });
const passwordInputs = () =>
  document.body.querySelectorAll('input[type="password"]');

beforeEach(() => { authModelValue = 'pin'; });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('AddWalletDialog — credential surface follows the auth cohort', () => {
  it('PIN cohort: renders the 8-digit PIN pad and no password box', () => {
    authModelValue = 'pin';
    vi.mocked(useWallet).mockReturnValue(makeCtx());
    render(<AddWalletDialog onClose={vi.fn()} />);

    expect(hasPinPad()).toBe(true);
    expect(passwordInputs().length).toBe(0);
    expect(screen.getByText('Vault PIN')).toBeTruthy();
    expect(screen.queryByText('Vault password')).toBeNull();
  });

  it('password cohort: keeps the legacy free-text password box (no lockout)', () => {
    authModelValue = 'password';
    vi.mocked(useWallet).mockReturnValue(makeCtx());
    render(<AddWalletDialog onClose={vi.fn()} />);

    expect(passwordInputs().length).toBeGreaterThan(0);
    expect(hasPinPad()).toBe(false);
    expect(screen.getByText('Vault password')).toBeTruthy();
    expect(screen.queryByText('Vault PIN')).toBeNull();
  });
});

describe('RemoveDialog — credential surface follows the auth cohort', () => {
  const wallet = { id: 'w1', name: 'Savings', backedUp: true };

  it('PIN cohort: renders the PIN pad ("Remove wallet" submit text), no password box', () => {
    authModelValue = 'pin';
    vi.mocked(useWallet).mockReturnValue(makeCtx());
    render(<RemoveDialog wallet={wallet} canRemove onClose={vi.fn()} />);

    expect(hasPinPad()).toBe(true);
    // Visible submit text is the cosmetic submitLabel, even though its accessible
    // name stays "Submit PIN".
    expect(body().getByRole('button', { name: 'Submit PIN' }).textContent).toContain('Remove wallet');
    expect(passwordInputs().length).toBe(0);
    expect(screen.getByText('Vault PIN')).toBeTruthy();
  });

  it('password cohort: keeps the legacy destructive password confirm', () => {
    authModelValue = 'password';
    vi.mocked(useWallet).mockReturnValue(makeCtx());
    render(<RemoveDialog wallet={wallet} canRemove onClose={vi.fn()} />);

    expect(passwordInputs().length).toBeGreaterThan(0);
    expect(hasPinPad()).toBe(false);
    expect(body().getByRole('button', { name: /remove wallet/i })).toBeTruthy();
    expect(screen.getByText('Vault password')).toBeTruthy();
  });

  it('last wallet cannot be removed: shows no credential surface at all', () => {
    authModelValue = 'pin';
    vi.mocked(useWallet).mockReturnValue(makeCtx());
    render(<RemoveDialog wallet={wallet} canRemove={false} onClose={vi.fn()} />);

    expect(passwordInputs().length).toBe(0);
    expect(hasPinPad()).toBe(false);
    expect(screen.getByText(/only wallet/i)).toBeTruthy();
  });
});
