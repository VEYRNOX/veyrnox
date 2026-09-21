// SEC-05 (QA 2026-09-21) — the Security Dashboard must never report
// "Biometric unlock: ON — Required to unlock" where no platform biometric
// exists. On web there is none (lib/biometric getBiometricStatus → mode 'web',
// available false), yet a stored '1' pref — which the fastpath init migration
// used to write on every launch — rendered as an active protection.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const native = vi.hoisted(() => ({ value: false }));
vi.mock('@capacitor/core', async (orig) => {
  const actual = /** @type {any} */ (await orig());
  return {
    ...actual,
    Capacitor: {
      ...actual.Capacitor,
      isNativePlatform: () => native.value,
      getPlatform: () => (native.value ? 'ios' : 'web'),
    },
  };
});
vi.mock('@/api/base44Client', () => {
  const list = () => Promise.resolve([]);
  const e = { list, filter: list };
  return { base44: { entities: { TokenApproval: e, WalletToken: e, Transaction: e, NFTAsset: e } } };
});
vi.mock('@/lib/WalletProvider', () => ({
  useWallet: () => ({ isDecoy: false, isHidden: false, hasStealthPool: () => Promise.resolve(false) }),
}));
vi.mock('@/rasp', () => ({ useRaspArtifact: () => ({ tier: 'ALLOW' }), TIER: { ALLOW: 'ALLOW' } }));
vi.mock('@/lib/advisorBridge', () => ({ publishAdvisorContext: vi.fn() }));

import SecurityDashboard from '../SecurityDashboard.jsx';
import { BIOMETRIC_PREF_KEY } from '@/lib/biometric';

function renderDashboard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><SecurityDashboard /></MemoryRouter>
    </QueryClientProvider>,
  );
}

function biometricRowText() {
  return screen.getByText('Biometric unlock').closest('a')?.textContent ?? '';
}

describe('SecurityDashboard — biometric row honesty (SEC-05)', () => {
  beforeEach(() => { localStorage.clear(); });

  it('web: a stored "1" pref does NOT render ON / "Required to unlock"', () => {
    native.value = false;
    localStorage.setItem(BIOMETRIC_PREF_KEY, '1');
    renderDashboard();
    const row = biometricRowText();
    expect(row).toContain('OFF');
    expect(row).not.toContain('Required to unlock');
  });

  it('native: a stored "1" pref still renders ON (no regression on devices)', () => {
    native.value = true;
    localStorage.setItem(BIOMETRIC_PREF_KEY, '1');
    renderDashboard();
    const row = biometricRowText();
    expect(row).toContain('ON');
    expect(row).toContain('Required to unlock');
  });
});
