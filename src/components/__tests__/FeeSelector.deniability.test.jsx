// @ts-nocheck
// src/components/__tests__/FeeSelector.deniability.test.jsx
//
// I3 deniability guard (issue #977). FeeSelector runs a react-query with
// `refetchInterval: 30_000`, so its queryFn — estimateEvmFeeTiers →
// provider.getFeeData() — keeps firing every 30s while the Send screen is
// mounted. `enabled` and the parent render conditional are NOT reactive to a
// localStorage `veyrnox-demo` flip (same-window writes emit no event), so if the
// demo/deniability flag is set AFTER mount, the interval refetch still hits the
// live fee provider. Under useTrezorMode that queries the REAL hardware address
// against a third-party RPC — a real I3 egress leak on a coerced mid-session flip.
//
// Fix (Option 1, minimal): the queryFn must call the LIVE
// isDeniabilityOrDemoActive() gate on every invocation and fail closed (throw)
// before touching any fee provider. The query already degrades gracefully on
// error ("the wallet will use a safe default fee"), so a thrown gate is honest
// and non-leaky.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { render, waitFor, cleanup, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const here = dirname(fileURLToPath(import.meta.url));
// Raw source: `isDeniabilityOrDemoActive(` (with paren) is ONLY the real call —
// the import binding has no paren — so no comment-stripping is needed to avoid a
// false positive, and stripping actually mis-handles this file's many inline
// `/** @type {any} */` block comments.
const code = readFileSync(resolve(here, '../FeeSelector.jsx'), 'utf8');

describe('FeeSelector — I3 refetch gate structural guards (source scan)', () => {
  it('imports the LIVE isDeniabilityOrDemoActive helper', () => {
    expect(code).toMatch(
      /import\s*\{\s*isDeniabilityOrDemoActive\s*\}\s*from\s*['"]@\/wallet-core\/deniabilitySession['"]/
    );
  });

  it('calls the live gate before any fee estimator inside the query path', () => {
    const gate = code.indexOf('isDeniabilityOrDemoActive(');
    expect(gate).toBeGreaterThan(-1);
    // The gate must precede the useQuery definition so it wraps the queryFn.
    const useQ = code.indexOf('useQuery(');
    expect(gate).toBeLessThan(useQ);
  });
});

// --- behavioral: an interval refetch after a mid-session demo flip must NOT
//     reach the fee estimator ---

const estimateEvm = vi.fn(async () => ({
  baseFeePerGasWei: '1000000000',
  suggestedTipWei: '1000000000',
  gasLimit: 21000,
  tiers: [
    { id: 'slow', label: 'Slow', estFeeWei: '21000000000000', maxFeePerGasWei: '1000000000', maxPriorityFeePerGasWei: '1000000000', gasLimit: 21000, etaLabel: '~5 min' },
    { id: 'standard', label: 'Standard', estFeeWei: '42000000000000', maxFeePerGasWei: '2000000000', maxPriorityFeePerGasWei: '1500000000', gasLimit: 21000, etaLabel: '~1 min' },
    { id: 'fast', label: 'Fast', estFeeWei: '63000000000000', maxFeePerGasWei: '3000000000', maxPriorityFeePerGasWei: '2000000000', gasLimit: 21000, etaLabel: '~15 s' },
  ],
}));

vi.mock('@/wallet-core/evm/fees', () => ({
  estimateEvmFeeTiers: (...a) => estimateEvm(...a),
  buildEvmCustomFee: vi.fn(() => ({ estFeeWei: '0', maxFeePerGasWei: '0', maxPriorityFeePerGasWei: '0', gasLimit: 21000 })),
}));
vi.mock('@/wallet-core/btc/fees', () => ({ estimateBtcFeeTiers: vi.fn(async () => ({ tiers: [] })) }));
vi.mock('@/wallet-core/sol/fees', () => ({ estimateSolFeeTiers: vi.fn(async () => ({ tiers: [] })) }));

let FeeSelector, setDeniabilitySession;
beforeEach(async () => {
  estimateEvm.mockClear();
  try { localStorage.removeItem('veyrnox-demo'); } catch { /* ignore */ }
  ({ default: FeeSelector } = await import('@/components/FeeSelector'));
  ({ setDeniabilitySession } = await import('@/wallet-core/deniabilitySession'));
  setDeniabilitySession(false);
});
afterEach(() => {
  cleanup();
  try { localStorage.removeItem('veyrnox-demo'); } catch { /* ignore */ }
  setDeniabilitySession(false);
});

function renderSelector(qc) {
  return render(
    <QueryClientProvider client={qc}>
      <FeeSelector chain="evm" networkKey="ethereum" symbol="ETH" decimals={18} usdRate={2000} gasLimitHint={21000} onChange={() => {}} />
    </QueryClientProvider>
  );
}

describe('FeeSelector — interval refetch after mid-session demo flip is gated (I3)', () => {
  it('does not call the fee estimator on a refetch once veyrnox-demo is set mid-session', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderSelector(qc);

    // First fetch (demo OFF) is allowed and hydrates the tiers.
    await waitFor(() => expect(estimateEvm).toHaveBeenCalledTimes(1));

    // Coerced mid-session flip: demo flag set while the screen stays mounted.
    localStorage.setItem('veyrnox-demo', '1');

    // What refetchInterval does every 30s — force the queryFn to run again.
    await act(async () => { await qc.refetchQueries({ queryKey: ['fee-tiers'] }); });

    // The gate must have short-circuited: the estimator (→ provider.getFeeData)
    // is NOT reached a second time. Without the fix this is 2.
    expect(estimateEvm).toHaveBeenCalledTimes(1);
  });

  it('does not call the fee estimator on a refetch during an in-memory deniability session', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderSelector(qc);
    await waitFor(() => expect(estimateEvm).toHaveBeenCalledTimes(1));

    setDeniabilitySession(true);
    await act(async () => { await qc.refetchQueries({ queryKey: ['fee-tiers'] }); });

    expect(estimateEvm).toHaveBeenCalledTimes(1);
  });
});
