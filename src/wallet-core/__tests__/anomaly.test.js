// wallet-core/__tests__/anomaly.test.js
//
// Phase S2 (Anomaly / Fraud Detection) safety-critical, network-free tests for the
// pure history-aware heuristics that complement the pre-sign simulation:
//   - unusual amount vs the user's OWN typical send (median baseline)
//   - large amount to a FIRST-TIME recipient (vs history OR vs balance)
//   - approve-then-transferFrom ("second tx is the exploit") sequence flag
//   - NEVER asserts "safe" — no deviation yields an empty flag set, not a claim
//   - honest gating: too little history => no amount baseline, stays silent
// Also checks the rules compose into assessEvmTransaction's risk list unchanged.

import { describe, it, expect } from 'vitest';
import { parseEther, parseUnits, MaxUint256, Interface } from 'ethers';
import { assessHistoryAnomalies, ANOMALY_CONSTANTS } from '../evm/anomaly.js';
import { assessEvmTransaction } from '../evm/simulate.js';
import { describeErc20Call } from '../evm/calldata.js';
import { ERC20_ABI } from '../evm/tokens.js';

const iface = new Interface(ERC20_ABI);
const USDC = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
const KNOWN = '0xa11ce1234567890abcdef1234567890abcc0ffee';
const FRESH = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const SPENDER = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';

const codes = (risks) => risks.map((r) => r.code);

describe('assessHistoryAnomalies — unusual amount vs own history', () => {
  it('flags an outflow far above the typical (median) send', () => {
    const risks = assessHistoryAnomalies({
      kind: 'native', effectiveRecipient: KNOWN, amount: 0.5, symbol: 'ETH',
      balanceNum: 2.5, priorSends: [0.02, 0.03, 0.025, 0.02], // median ~0.0225
      knownCounterparties: [KNOWN],
    });
    const r = risks.find((x) => x.code === 'amount_vs_history');
    expect(r).toBeTruthy();
    expect(r.level).toBe('medium');
  });

  it('stays SILENT when there is too little history for a baseline', () => {
    const risks = assessHistoryAnomalies({
      kind: 'native', effectiveRecipient: KNOWN, amount: 5, symbol: 'ETH',
      balanceNum: 100, priorSends: [0.02], // below MIN_HISTORY
      knownCounterparties: [KNOWN],
    });
    expect(codes(risks)).not.toContain('amount_vs_history');
  });

  it('does NOT flag an amount in line with the typical send', () => {
    const risks = assessHistoryAnomalies({
      kind: 'native', effectiveRecipient: KNOWN, amount: 0.03, symbol: 'ETH',
      balanceNum: 2.5, priorSends: [0.02, 0.03, 0.025, 0.02],
      knownCounterparties: [KNOWN],
    });
    expect(codes(risks)).not.toContain('amount_vs_history');
    // No deviation does NOT produce a "safe" claim — it produces no flags.
    expect(risks).toEqual([]);
  });

  it('respects the multiple/minHistory overrides', () => {
    const risks = assessHistoryAnomalies({
      kind: 'native', effectiveRecipient: KNOWN, amount: 0.1, symbol: 'ETH',
      priorSends: [0.05, 0.05], knownCounterparties: [KNOWN],
      multiple: 2, minHistory: 2,
    });
    expect(codes(risks)).toContain('amount_vs_history');
  });
});

describe('assessHistoryAnomalies — first-time recipient + large amount', () => {
  it('flags a large amount (vs balance) to a brand-new recipient', () => {
    const risks = assessHistoryAnomalies({
      kind: 'native', effectiveRecipient: FRESH, amount: 1.4, symbol: 'ETH',
      balanceNum: 2.5, priorSends: [], knownCounterparties: [KNOWN], // FRESH is new
    });
    const r = risks.find((x) => x.code === 'new_recipient_large');
    expect(r).toBeTruthy();
    expect(r.level).toBe('medium');
  });

  it('flags a large amount (vs history) to a brand-new recipient', () => {
    const risks = assessHistoryAnomalies({
      kind: 'native', effectiveRecipient: FRESH, amount: 0.5, symbol: 'ETH',
      balanceNum: 100, // small fraction of balance, so the balance rule won't fire
      priorSends: [0.02, 0.03, 0.025, 0.02], knownCounterparties: [KNOWN],
    });
    expect(codes(risks)).toContain('new_recipient_large');
  });

  it('does NOT escalate a small amount to a new recipient (info only)', () => {
    const risks = assessHistoryAnomalies({
      kind: 'native', effectiveRecipient: FRESH, amount: 0.02, symbol: 'ETH',
      balanceNum: 2.5, priorSends: [0.02, 0.03, 0.025],
      knownCounterparties: [KNOWN, SPENDER, USDC], // >= MIN_HISTORY known
    });
    expect(codes(risks)).not.toContain('new_recipient_large');
    const info = risks.find((x) => x.code === 'new_recipient');
    expect(info).toBeTruthy();
    expect(info.level).toBe('info');
  });

  it('treats a KNOWN recipient as not first-time', () => {
    const risks = assessHistoryAnomalies({
      kind: 'native', effectiveRecipient: KNOWN.toUpperCase(), amount: 0.02, symbol: 'ETH',
      balanceNum: 2.5, priorSends: [0.02, 0.03, 0.025],
      knownCounterparties: [KNOWN], // case-insensitive match
    });
    expect(codes(risks)).not.toContain('new_recipient');
    expect(codes(risks)).not.toContain('new_recipient_large');
  });
});

describe('assessHistoryAnomalies — approve-then-transfer (two-step drain)', () => {
  it('flags an approval to a NEW spender as medium', () => {
    const risks = assessHistoryAnomalies({
      kind: 'approve', effectiveRecipient: SPENDER, knownCounterparties: [KNOWN],
    });
    const r = risks.find((x) => x.code === 'approval_then_transfer');
    expect(r).toBeTruthy();
    expect(r.level).toBe('medium');
    // Approve moves no funds NOW — the amount rules must not also fire.
    expect(codes(risks)).not.toContain('amount_vs_history');
    expect(codes(risks)).not.toContain('new_recipient_large');
  });

  it('flags an approval to a KNOWN spender as info', () => {
    const risks = assessHistoryAnomalies({
      kind: 'approve', effectiveRecipient: KNOWN, knownCounterparties: [KNOWN],
    });
    const r = risks.find((x) => x.code === 'approval_then_transfer');
    expect(r.level).toBe('info');
  });
});

describe('anomaly heuristics compose into assessEvmTransaction', () => {
  it('surfaces amount_vs_history on a native send through the simulator assessment', () => {
    const a = assessEvmTransaction({
      decoded: { kind: 'native' }, txTo: KNOWN,
      valueWei: parseEther('0.5'), nativeBalanceWei: parseEther('2.5'), nativeSymbol: 'ETH',
      priorSends: [0.02, 0.03, 0.025, 0.02], knownCounterparties: [KNOWN],
    });
    expect(codes(a.risks)).toContain('amount_vs_history');
  });

  it('surfaces new_recipient_large on a token transfer to a fresh payee', () => {
    const data = iface.encodeFunctionData('transfer', [FRESH, parseUnits('900', 6)]);
    const decoded = describeErc20Call({ data, tokenSymbol: 'USDC', decimals: 6 });
    const a = assessEvmTransaction({
      decoded, txTo: USDC, tokenSymbol: 'USDC', networkKey: 'sepolia',
      tokenBalance: '1000', targetIsContract: true,
      priorSends: [10, 12, 8], knownCounterparties: [KNOWN],
    });
    expect(codes(a.risks)).toContain('new_recipient_large');
  });

  it('adds approval_then_transfer alongside the existing approval flag', () => {
    const data = iface.encodeFunctionData('approve', [SPENDER, MaxUint256]);
    const decoded = describeErc20Call({ data, tokenSymbol: 'USDC', decimals: 6 });
    const a = assessEvmTransaction({
      decoded, txTo: USDC, tokenSymbol: 'USDC', networkKey: 'sepolia',
      knownCounterparties: [KNOWN],
    });
    expect(codes(a.risks)).toContain('unlimited_approval');     // existing
    expect(codes(a.risks)).toContain('approval_then_transfer'); // new sequence flag
  });

  it('a clean, typical send to a known payee yields NO anomaly flags', () => {
    const a = assessEvmTransaction({
      decoded: { kind: 'native' }, txTo: KNOWN,
      valueWei: parseEther('0.03'), nativeBalanceWei: parseEther('2.5'), nativeSymbol: 'ETH',
      priorSends: [0.02, 0.03, 0.025, 0.02], knownCounterparties: [KNOWN],
    });
    expect(codes(a.risks)).not.toContain('amount_vs_history');
    expect(codes(a.risks)).not.toContain('new_recipient');
    expect(codes(a.risks)).not.toContain('new_recipient_large');
  });
});

describe('exported constants', () => {
  it('exposes the tunable thresholds', () => {
    expect(ANOMALY_CONSTANTS.ANOMALY_MULTIPLE).toBeGreaterThan(1);
    expect(ANOMALY_CONSTANTS.MIN_HISTORY).toBeGreaterThanOrEqual(2);
    expect(ANOMALY_CONSTANTS.NEW_RECIPIENT_BALANCE_FRACTION).toBeGreaterThan(0);
  });
});
