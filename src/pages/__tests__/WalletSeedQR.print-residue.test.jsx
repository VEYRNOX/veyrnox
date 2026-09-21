// SEC-02 (QA 2026-09-21): the web print path appended a hidden container
// holding the FULL mnemonic, plus a global @media print <style>, to the
// document and never removed either. They survived Clear, navigation away and
// Lock (WalletGate unmounts the page), and the style made any later Ctrl+P on
// any page print the seed. These tests pin that both are gone after afterprint,
// Clear, and unmount.
//
// SEC-09: wallets carry no `currency`, so the selector rendered "? Wallet 1 ()".
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';

const PHRASE = 'abandon ability able about above absent absorb abstract absurd abuse access accident';

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));
vi.mock('@/lib/toast', () => ({ toast: { info: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/WalletProvider', () => ({
  useWallet: () => ({
    wallets: [{ id: 'w1', name: 'Wallet 1', backedUp: false }],
    confirmWalletBackup: vi.fn(),
  }),
}));
vi.mock('@/components/security/useRevealWithReauth', () => ({
  useRevealWithReauth: (onRevealed) => ({
    revealWithReauth: () => onRevealed({ mnemonic: PHRASE }),
    reauthPrompt: null,
    isReauthPending: false,
    gateModal: null,
  }),
}));
// Native <select> stand-in: Radix Select does not drive in jsdom.
vi.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, children }) => (
    <select data-testid="wallet-select" value={value} onChange={(e) => onValueChange(e.target.value)}>
      <option value="">Choose wallet...</option>
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }) => <>{children}</>,
  SelectItem: ({ value, children }) => <option value={value} data-testid="wallet-option">{children}</option>,
}));

import WalletSeedQR from '../WalletSeedQR';

const PRINT_ID = 'veyrnox-seed-print-container';
const STYLE_ID = 'veyrnox-seed-print-styles';

function residue() {
  return {
    container: !!document.getElementById(PRINT_ID),
    style: !!document.getElementById(STYLE_ID),
    phraseInDom: document.documentElement.innerHTML.includes(PHRASE),
  };
}

async function revealAndPrint() {
  const view = render(<WalletSeedQR />);
  fireEvent.change(screen.getByTestId('wallet-select'), { target: { value: 'w1' } });
  fireEvent.click(screen.getByRole('button', { name: /Reveal Recovery Phrase/i }));
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /Print Secure Backup/i }));
  });
  // Precondition: the print path really did inject the phrase, or the
  // assertions below would pass vacuously.
  expect(residue()).toEqual({ container: true, style: true, phraseInDom: true });
  return view;
}

const CLEAN = { container: false, style: false, phraseInDom: false };

describe('WalletSeedQR web print leaves no seed residue (SEC-02)', () => {
  beforeEach(() => {
    window.print = vi.fn();
  });
  afterEach(() => {
    cleanup();
    document.getElementById(PRINT_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
  });

  it('removes the print container and style on afterprint', async () => {
    await revealAndPrint();
    act(() => { window.dispatchEvent(new Event('afterprint')); });
    expect(residue()).toEqual(CLEAN);
  });

  it('removes them on "Clear recovery phrase from memory"', async () => {
    await revealAndPrint();
    fireEvent.click(screen.getByRole('button', { name: /Clear recovery phrase from memory/i }));
    expect(residue()).toEqual(CLEAN);
  });

  it('removes them on unmount (navigation away, and Lock — WalletGate unmounts the page)', async () => {
    const view = await revealAndPrint();
    view.unmount();
    expect(residue()).toEqual(CLEAN);
  });
});

describe('WalletSeedQR wallet selector (SEC-09)', () => {
  afterEach(cleanup);

  it('renders the wallet name without a "?" glyph or an empty "()" currency', () => {
    render(<WalletSeedQR />);
    const text = screen.getByTestId('wallet-option').textContent;
    expect(text).toBe('Wallet 1');
  });
});
