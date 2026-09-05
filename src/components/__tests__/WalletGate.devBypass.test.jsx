// @ts-nocheck
// Guardrail for the dev-only wallet-gate bypass in components/WalletGate.jsx.
// The bypass must require BOTH `import.meta.env.DEV` (Vite dead-code-eliminates
// this to false in prod) AND the explicit VITE_DEV_BYPASS_WALLET_GATE=='1'
// flag. Either alone must NOT open the gate.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';

vi.mock('@/api/base44Client', () => ({ WALLET_GATE: true }));
vi.mock('@/components/WalletEntry', () => ({
  default: () => <div data-testid="wallet-entry">wallet-entry</div>,
}));
vi.mock('@/components/WalletEntryErrorBoundary', () => ({
  default: ({ children }) => <>{children}</>,
}));

async function renderGate() {
  vi.resetModules();
  const { default: WalletGate } = await import('@/components/WalletGate');
  render(
    <MemoryRouter initialEntries={['/plans']}>
      <Routes>
        <Route element={<WalletGate />}>
          <Route path="/plans" element={<div data-testid="plans">plans</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe('WalletGate dev-only bypass', () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it('blocks when flag is unset (DEV alone is not enough)', async () => {
    vi.stubEnv('VITE_DEV_BYPASS_WALLET_GATE', '');
    await renderGate();
    expect(screen.queryByTestId('wallet-entry')).toBeTruthy();
    expect(screen.queryByTestId('plans')).toBeNull();
  });

  it('opens when flag is "1" in dev', async () => {
    vi.stubEnv('VITE_DEV_BYPASS_WALLET_GATE', '1');
    await renderGate();
    expect(screen.queryByTestId('plans')).toBeTruthy();
    expect(screen.queryByTestId('wallet-entry')).toBeNull();
  });

  it('ignores non-"1" truthy values (must be the literal string "1")', async () => {
    vi.stubEnv('VITE_DEV_BYPASS_WALLET_GATE', 'true');
    await renderGate();
    expect(screen.queryByTestId('wallet-entry')).toBeTruthy();
    expect(screen.queryByTestId('plans')).toBeNull();
  });
});
