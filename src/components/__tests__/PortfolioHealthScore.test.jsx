import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PARTIAL_TOTAL_NOTE } from '@/lib/balanceDisplay';
import PortfolioHealthScore, {
  calculateSecurityScore,
  calculateDiversificationScore,
  calculateGrowthScore,
  calculatePortfolioHealth,
} from '../PortfolioHealthScore';
import {
  calculateHHI,
  getHHIScore,
  isCrossChain,
} from '@/lib/portfolioHealthCalc';

afterEach(cleanup);

function renderScore(props) {
  return render(
    <MemoryRouter>
      <PortfolioHealthScore {...props} />
    </MemoryRouter>
  );
}

// ── Pure helpers: concentration / cross-chain ───────────────────────────────
describe('portfolioHealthCalc helpers', () => {
  it('calculateHHI: single asset 100% → 1', () => {
    expect(calculateHHI({ BTC: { usd: 100 } })).toBeCloseTo(1, 5);
  });

  it('calculateHHI: two even assets → 0.5', () => {
    expect(calculateHHI({ ETH: { usd: 50 }, BTC: { usd: 50 } })).toBeCloseTo(0.5, 5);
  });

  it('calculateHHI: no holdings → 0 (never NaN)', () => {
    expect(calculateHHI({})).toBe(0);
    expect(calculateHHI({ ETH: { usd: 0 }, BTC: { usd: 0 } })).toBe(0);
  });

  it('getHHIScore: single-asset concentration → 0 pts', () => {
    expect(getHHIScore(1)).toBe(0);
  });

  it('getHHIScore: 2–3 assets → 10 pts', () => {
    expect(getHHIScore(0.5)).toBe(10);
    expect(getHHIScore(1 / 3)).toBe(10);
  });

  it('getHHIScore: 4+ assets → 15 pts', () => {
    expect(getHHIScore(0.25)).toBe(15);
  });

  it('getHHIScore: zero HHI (no holdings) → 0 pts', () => {
    expect(getHHIScore(0)).toBe(0);
  });

  it('isCrossChain: single EVM asset → false', () => {
    expect(isCrossChain({ assetTotals: { ETH: { usd: 100 } } })).toBe(false);
  });

  it('isCrossChain: two EVM assets → false (same chain family)', () => {
    expect(isCrossChain({ assetTotals: { ETH: { usd: 50 }, USDC: { usd: 50 } } })).toBe(false);
  });

  it('isCrossChain: EVM + BTC → true', () => {
    expect(isCrossChain({ assetTotals: { ETH: { usd: 50 }, BTC: { usd: 50 } } })).toBe(true);
  });

  it('isCrossChain: null / missing portfolio → false (fail-closed)', () => {
    expect(isCrossChain(null)).toBe(false);
    expect(isCrossChain({})).toBe(false);
  });
});

// ── Factor 1: security controls (0–40) ──────────────────────────────────────
describe('calculateSecurityScore', () => {
  it('no wallet → 0', () => {
    expect(calculateSecurityScore([], false, false)).toBe(0);
  });

  it('wallet exists, nothing set up → floor of 5', () => {
    expect(calculateSecurityScore([{ backedUp: false }], false, false)).toBe(5);
  });

  it('backup only → 10', () => {
    expect(calculateSecurityScore([{ backedUp: true }], false, false)).toBe(10);
  });

  it('backup + KEK + passkey/biometric → 35', () => {
    expect(calculateSecurityScore([{ backedUp: true }], true, true)).toBe(35);
  });

  it('caps at 40', () => {
    expect(
      calculateSecurityScore([{ backedUp: true }, { backedUp: true }], true, true)
    ).toBeLessThanOrEqual(40);
  });
});

// ── Factor 2: diversification (0–35) ────────────────────────────────────────
describe('calculateDiversificationScore', () => {
  it('single-asset concentration (100% BTC) → penalty, no HHI points', () => {
    const s = calculateDiversificationScore({
      assetTotals: { BTC: { usd: 100 } },
      grandTotal: 100,
    });
    expect(s).toBe(0);
  });

  it('multi-chain even split (ETH+BTC+SOL) → cross-chain bonus applied', () => {
    const s = calculateDiversificationScore(
      {
        assetTotals: { ETH: { usd: 33 }, BTC: { usd: 33 }, SOL: { usd: 34 } },
        grandTotal: 100,
      },
      [{ backedUp: true }]
    );
    // HHI(≈1/3) → 10, backup>50% → +5, cross-chain → +10
    expect(s).toBe(25);
  });

  it('caps at 35', () => {
    const s = calculateDiversificationScore(
      {
        assetTotals: { ETH: { usd: 25 }, BTC: { usd: 25 }, SOL: { usd: 25 }, USDC: { usd: 25 } },
        grandTotal: 100,
      },
      [{ backedUp: true }]
    );
    expect(s).toBeLessThanOrEqual(35);
  });
});

// ── Factor 3: growth / holdings maturity (0–25) ─────────────────────────────
describe('calculateGrowthScore', () => {
  it('null / no holdings → 0', () => {
    expect(calculateGrowthScore(null)).toBe(0);
    expect(calculateGrowthScore({ grandTotal: 0, assetTotals: {} })).toBe(0);
  });

  it('1000 USD across 3 assets → non-zero + multi-asset + age-unknown branch', () => {
    const s = calculateGrowthScore({
      grandTotal: 1000,
      assetTotals: { ETH: { usd: 400 }, BTC: { usd: 300 }, SOL: { usd: 300 } },
    });
    // 10 (non-zero) + 5 (3+ assets) + 5 (age unknown dummy) = 20
    expect(s).toBe(20);
  });

  it('caps at 25', () => {
    const s = calculateGrowthScore({
      grandTotal: 5000,
      assetTotals: { ETH: { usd: 1000 }, BTC: { usd: 1000 }, SOL: { usd: 1000 }, USDC: { usd: 2000 } },
    });
    expect(s).toBeLessThanOrEqual(25);
  });
});

// ── Aggregate: calculatePortfolioHealth ─────────────────────────────────────
describe('calculatePortfolioHealth', () => {
  it('empty wallet (no balance, no backup) → total <= 25 (Needs Attention)', () => {
    const r = calculatePortfolioHealth({ wallets: [], portfolio: null });
    expect(r.isIncomplete).toBe(false);
    expect(r.total).toBeLessThanOrEqual(25);
    expect(r.label).toBe('Needs Attention');
  });

  it('new wallet (backup=true, no KEK, no passkey, modest holdings) → 20–40 range', () => {
    const r = calculatePortfolioHealth({
      wallets: [{ backedUp: true }],
      portfolio: {
        grandTotal: 100,
        assetTotals: { ETH: { usd: 50 }, USDC: { usd: 50 } },
        indeterminate: false,
      },
      kekEnrolled: false,
      passkey: false,
    });
    expect(r.total).toBeGreaterThanOrEqual(20);
    expect(r.total).toBeLessThanOrEqual(40);
  });

  it('mature vault (backup + KEK + passkey/biometric + 3-chain holdings) → >= 75 (Excellent)', () => {
    const r = calculatePortfolioHealth({
      wallets: [{ backedUp: true }],
      portfolio: {
        grandTotal: 1000,
        assetTotals: { ETH: { usd: 400 }, BTC: { usd: 300 }, SOL: { usd: 300 } },
        indeterminate: false,
      },
      kekEnrolled: true,
      passkey: true,
    });
    expect(r.total).toBeGreaterThanOrEqual(75);
    expect(r.label).toBe('Excellent');
  });

  it('incomplete portfolio read (indeterminate=true) → score null + isIncomplete (I4)', () => {
    const r = calculatePortfolioHealth({
      wallets: [{ backedUp: true }],
      portfolio: { indeterminate: true, grandTotal: 0, assetTotals: {} },
    });
    expect(r.isIncomplete).toBe(true);
    expect(r.total).toBeNull();
  });

  it('deniability session → score suppressed (I3)', () => {
    const r = calculatePortfolioHealth({
      wallets: [{ backedUp: true }],
      portfolio: { grandTotal: 1000, assetTotals: { ETH: { usd: 1000 } }, indeterminate: false },
      isDeniability: true,
    });
    expect(r.total).toBeNull();
    expect(r.isDeniability).toBe(true);
  });
});

// ── Component rendering ─────────────────────────────────────────────────────
describe('<PortfolioHealthScore />', () => {
  it('renders the 3-factor breakdown for a real, complete portfolio', () => {
    renderScore({
      wallets: [{ backedUp: true }],
      portfolio: {
        grandTotal: 1000,
        assetTotals: { ETH: { usd: 400 }, BTC: { usd: 300 }, SOL: { usd: 300 } },
        indeterminate: false,
      },
      isVaultKekEnrolled: true,
      hasPasskeyOrBiometric: true,
    });
    expect(screen.getByText('Security')).toBeTruthy();
    expect(screen.getByText('Diversification')).toBeTruthy();
    expect(screen.getByText('Growth')).toBeTruthy();
    expect(screen.getByText('Excellent')).toBeTruthy();
  });

  it('indeterminate portfolio → IncompleteBalanceNote, no score (I4)', () => {
    renderScore({
      wallets: [{ backedUp: true }],
      portfolio: { indeterminate: true, grandTotal: 0, assetTotals: {} },
    });
    expect(screen.getByText(PARTIAL_TOTAL_NOTE)).toBeTruthy();
    expect(screen.queryByText('Excellent')).toBeNull();
    expect(screen.queryByText('Diversification')).toBeNull();
  });

  it('deniability session → "unavailable in this session", no factor breakdown (I3)', () => {
    renderScore({
      wallets: [{ backedUp: true }],
      portfolio: { grandTotal: 1000, assetTotals: { ETH: { usd: 1000 } }, indeterminate: false },
      isDeniability: true,
    });
    expect(screen.getByText(/unavailable in this session/i)).toBeTruthy();
    expect(screen.queryByText('Diversification')).toBeNull();
    expect(screen.queryByText('Excellent')).toBeNull();
  });
});
