// WalletAccessReset — the change-credential + recovery surfaces must match the
// app's real login (an 8-digit PIN pad), NOT a free-text password box, for the
// PIN cohort (every real vault post-PR #651). Regression guard for the bug the
// owner reported: "Access & Recovery page is not showing a PIN PAD code change."

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/lib/WalletProvider', () => ({ useWallet: vi.fn() }));

let authModelValue = 'pin';
vi.mock('@/lib/authModel', () => ({
  getAuthModel: vi.fn(() => authModelValue),
}));

// Non-demo so the plain guidance (not the demo walkthrough) renders.
vi.mock('@/api/demoClient', () => ({ DEMO: false }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { useWallet } from '@/lib/WalletProvider';
import WalletAccessReset from '@/pages/WalletAccessReset';

function makeCtx(overrides = {}) {
  return {
    isUnlocked: true,
    accounts: [],
    hasVault: vi.fn(async () => true),
    deriveAccounts: vi.fn(() => []),
    changePassword: vi.fn(async () => {}),
    importWallet: vi.fn(async () => {}),
    createWallet: vi.fn(),
    unlock: vi.fn(),
    lock: vi.fn(),
    clearVault: vi.fn(),
    ...overrides,
  };
}

// Both the change-credential card and the recovery card mount a PinPad, so
// digit buttons collide — always scope to a card. `scope` is a `within(...)`.
function typePin(scope, digits) {
  for (const d of digits) {
    fireEvent.click(scope.getByRole('button', { name: d }));
  }
  fireEvent.click(scope.getByRole('button', { name: 'Submit PIN' }));
}
const changeCard = () => within(screen.getByTestId('change-credential-card'));
const recoverCard = () => within(screen.getByTestId('recover-card'));

const CUR_PIN = '19283746';
const NEW_PIN = '48273951';

beforeEach(() => { authModelValue = 'pin'; });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('WalletAccessReset — PIN cohort renders a PIN pad, not a password box', () => {
  it('shows "Change your PIN" with a numeric pad and no password inputs', () => {
    vi.mocked(useWallet).mockReturnValue(makeCtx());
    render(<MemoryRouter><WalletAccessReset /></MemoryRouter>);

    const card = changeCard();
    expect(card.getByText('Change your PIN')).toBeTruthy();
    expect(card.getByText(/enter your current pin/i)).toBeTruthy();
    // A numeric pad is present…
    expect(card.getByRole('button', { name: '5' })).toBeTruthy();
    // …and the old free-text password fields are gone in the PIN cohort.
    expect(card.queryByPlaceholderText(/current vault password/i)).toBeNull();
  });

  it('drives current → new → confirm and calls changePassword(curPin, newPin)', async () => {
    const ctx = makeCtx();
    vi.mocked(useWallet).mockReturnValue(ctx);
    render(<MemoryRouter><WalletAccessReset /></MemoryRouter>);

    // Step 1: current PIN → Continue.
    typePin(changeCard(), CUR_PIN);
    await waitFor(() => expect(changeCard().getByText(/choose a new 8-digit pin/i)).toBeTruthy());

    // Step 2: new PIN → Continue.
    typePin(changeCard(), NEW_PIN);
    await waitFor(() => expect(changeCard().getByText(/confirm your new pin/i)).toBeTruthy());

    // Step 3: confirm new PIN → Change PIN.
    typePin(changeCard(), NEW_PIN);
    await waitFor(() => expect(ctx.changePassword).toHaveBeenCalledWith(CUR_PIN, NEW_PIN));
  });

  it('rejects a weak new PIN and stays on the new-PIN step', async () => {
    const ctx = makeCtx();
    vi.mocked(useWallet).mockReturnValue(ctx);
    render(<MemoryRouter><WalletAccessReset /></MemoryRouter>);

    typePin(changeCard(), CUR_PIN);
    await waitFor(() => expect(changeCard().getByText(/choose a new 8-digit pin/i)).toBeTruthy());

    typePin(changeCard(), '11111111'); // all-same → checkPinStrength rejects
    await waitFor(() => expect(changeCard().getByText(/repeats one digit/i)).toBeTruthy());
    // Never advanced to confirm; changePassword never called.
    expect(changeCard().queryByText(/confirm your new pin/i)).toBeNull();
    expect(ctx.changePassword).not.toHaveBeenCalled();
  });

  it('mismatched confirmation bounces back to the new-PIN step without changing anything', async () => {
    const ctx = makeCtx();
    vi.mocked(useWallet).mockReturnValue(ctx);
    render(<MemoryRouter><WalletAccessReset /></MemoryRouter>);

    typePin(changeCard(), CUR_PIN);
    await waitFor(() => expect(changeCard().getByText(/choose a new 8-digit pin/i)).toBeTruthy());
    typePin(changeCard(), NEW_PIN);
    await waitFor(() => expect(changeCard().getByText(/confirm your new pin/i)).toBeTruthy());

    typePin(changeCard(), '50918273'); // valid-strength but different → mismatch
    await waitFor(() => expect(changeCard().getByText(/didn't match/i)).toBeTruthy());
    expect(changeCard().getByText(/choose a new 8-digit pin/i)).toBeTruthy();
    expect(ctx.changePassword).not.toHaveBeenCalled();
  });

  it('recovery card sets a new PIN via importWallet(seed, pin)', async () => {
    const ctx = makeCtx();
    vi.mocked(useWallet).mockReturnValue(ctx);
    render(<MemoryRouter><WalletAccessReset /></MemoryRouter>);

    const seed = 'word '.repeat(12).trim();
    const card = recoverCard();
    fireEvent.change(card.getByPlaceholderText(/word1 word2 word3/i), { target: { value: seed } });
    expect(card.getByText(/set a new 8-digit pin/i)).toBeTruthy();

    typePin(recoverCard(), NEW_PIN);
    await waitFor(() => expect(ctx.importWallet).toHaveBeenCalledWith(seed, NEW_PIN));
  });
});

describe('WalletAccessReset — legacy password cohort still gets the password box', () => {
  it('renders "Change vault password" with the free-text inputs when authModel=password', () => {
    authModelValue = 'password';
    vi.mocked(useWallet).mockReturnValue(makeCtx());
    render(<MemoryRouter><WalletAccessReset /></MemoryRouter>);

    expect(screen.getByText('Change vault password')).toBeTruthy();
    expect(screen.getByPlaceholderText(/current vault password/i)).toBeTruthy();
    // No PIN pad in the password cohort.
    expect(screen.queryByRole('button', { name: 'Submit PIN' })).toBeNull();
  });
});
