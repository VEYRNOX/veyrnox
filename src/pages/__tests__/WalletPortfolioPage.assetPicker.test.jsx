// @ts-nocheck
// AssetPicker (create/import chips) — Phase 1a shipped composite ids in
// `enabledAssets` and DEFAULT_ENABLED_ASSETS, but this picker still compared
// bare symbols. Chips looked live but silently no-op'd on migrated wallets.
// Guard: pre-selected composite id renders "on", clicking toggles it off,
// clicking again toggles it back on — proving the includes-check and the
// onToggle payload both speak composite ids.

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k) => k }),
  Trans: ({ children }) => children,
  initReactI18next: { type: '3rdParty', init: () => {} },
  I18nextProvider: ({ children }) => children,
}));
vi.mock('@/lib/WalletProvider', () => ({ useWallet: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));

import { AssetPicker } from '@/pages/WalletPortfolioPage';
import { ASSETS } from '@/wallet-core/assets.js';

function Harness({ initial }) {
  const [sel, setSel] = require('react').useState(initial);
  const toggle = (id) => setSel((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  return <div data-testid="wrap" data-selected={sel.join(',')}><AssetPicker selected={sel} onToggle={toggle} /></div>;
}

describe('AssetPicker composite-id toggle (Phase 1a)', () => {
  it('renders pre-selected composite id as on, toggles off then back on', () => {
    const eth = ASSETS.find((a) => a.symbol === 'ETH');
    expect(eth?.id).toBe('ETH:mainnet');
    const { container, getByTestId } = render(<Harness initial={[eth.id]} />);
    const btn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'ETH');
    expect(btn).toBeTruthy();
    // ON: primary border class present
    expect(btn.className).toMatch(/border-primary/);
    fireEvent.click(btn);
    expect(getByTestId('wrap').dataset.selected).not.toContain(eth.id);
    expect(btn.className).not.toMatch(/border-primary/);
    fireEvent.click(btn);
    expect(getByTestId('wrap').dataset.selected).toContain(eth.id);
    expect(btn.className).toMatch(/border-primary/);
  });
});
