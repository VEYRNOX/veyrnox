// wallet-core/__tests__/simulate.test.js
//
// Phase S2 (Transaction Simulation) safety-critical, network-free tests for the
// pure risk/outcome assessment that drives the pre-sign preview:
//   - predicted balance changes ("you send X, recipient receives Y")
//   - KNOWN risk flags: unlimited approval, known-bad recipient, look-alike
//     (poisoning), unverified contract, unrecognised calldata, large outflow
//   - NEVER asserts "safe" — no-risk case yields an empty risk set, not a claim
//   - BTC/SOL honest decode (inputs/outputs/fee; transfer + rent pre-flight)
// The networked simulateEvmTransaction (eth_call dry-run) needs a live RPC and is
// not exercised here, mirroring erc20.test.js; only its input guard is checked.

import { describe, it, expect } from 'vitest';
import { parseEther, parseUnits, MaxUint256, Interface } from 'ethers';
import { assessEvmTransaction, simulateEvmTransaction } from '../evm/simulate.js';
import { describeErc20Call } from '../evm/calldata.js';
import { describeBtcPlan } from '../btc/simulate.js';
import { describeSolTransfer } from '../sol/simulate.js';
import { ERC20_ABI } from '../evm/tokens.js';

const iface = new Interface(ERC20_ABI);
const USDC = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'; // verified Sepolia USDC
const FRESH = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const SPENDER = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const DEAD = '0x000000000000000000000000000000000000dEaD';

const codes = (a) => a.risks.map((r) => r.code);

describe('assessEvmTransaction — predicted balance changes', () => {
  it('native send shows an out (you) and in (recipient) of the same amount', () => {
    const a = assessEvmTransaction({
      decoded: { kind: 'native' }, txTo: FRESH,
      valueWei: parseEther('0.05'), nativeBalanceWei: parseEther('2'), nativeSymbol: 'ETH',
    });
    expect(a.kind).toBe('native');
    expect(a.effectiveRecipient).toBe(FRESH);
    expect(a.balanceChanges).toHaveLength(2);
    const out = a.balanceChanges.find((c) => c.direction === 'out');
    const inc = a.balanceChanges.find((c) => c.direction === 'in');
    expect(out.amount).toBe('0.05');
    expect(out.symbol).toBe('ETH');
    expect(inc.amount).toBe('0.05');
    expect(inc.who).toBe(FRESH);
  });

  it('ERC-20 transfer routes value to decoded.to, not the token contract', () => {
    const { data } = { data: iface.encodeFunctionData('transfer', [FRESH, parseUnits('12.5', 6)]) };
    const decoded = describeErc20Call({ data, tokenSymbol: 'USDC', decimals: 6 });
    const a = assessEvmTransaction({ decoded, txTo: USDC, tokenSymbol: 'USDC', networkKey: 'sepolia', targetIsContract: true });
    expect(a.effectiveRecipient.toLowerCase()).toBe(FRESH.toLowerCase());
    expect(a.balanceChanges.find((c) => c.direction === 'out').amount).toBe('12.5');
    // The tx target is OUR verified token, so no "unverified contract" flag.
    expect(codes(a)).not.toContain('unverified_contract');
  });
});

describe('assessEvmTransaction — KNOWN risk flags', () => {
  it('flags an UNLIMITED approval as high risk', () => {
    const data = iface.encodeFunctionData('approve', [SPENDER, MaxUint256]);
    const decoded = describeErc20Call({ data, tokenSymbol: 'USDC', decimals: 6 });
    const a = assessEvmTransaction({ decoded, txTo: USDC, tokenSymbol: 'USDC', networkKey: 'sepolia' });
    const r = a.risks.find((x) => x.code === 'unlimited_approval');
    expect(r).toBeTruthy();
    expect(r.level).toBe('high');
    // No balance moves NOW for an approve — danger is future spend.
    expect(a.balanceChanges).toHaveLength(0);
  });

  it('flags an exact-amount approval as medium (not unlimited)', () => {
    const data = iface.encodeFunctionData('approve', [SPENDER, parseUnits('100', 6)]);
    const decoded = describeErc20Call({ data, tokenSymbol: 'USDC', decimals: 6 });
    const a = assessEvmTransaction({ decoded, txTo: USDC, tokenSymbol: 'USDC', networkKey: 'sepolia' });
    const r = a.risks.find((x) => x.code === 'token_approval');
    expect(r).toBeTruthy();
    expect(r.level).toBe('medium');
    expect(codes(a)).not.toContain('unlimited_approval');
  });

  it('flags an unlimited approval to an unverified spender contract with BOTH flags', () => {
    const data = iface.encodeFunctionData('approve', [SPENDER, MaxUint256]);
    const decoded = describeErc20Call({ data, tokenSymbol: 'USDC', decimals: 6 });
    const a = assessEvmTransaction({
      decoded, txTo: USDC, tokenSymbol: 'USDC', networkKey: 'sepolia',
      targetIsContract: true, spenderIsContract: true,
    });
    expect(codes(a)).toContain('unlimited_approval');
    expect(codes(a)).toContain('unverified_contract');
  });

  it('flags a recipient on the LOCAL known-bad list (burn sink)', () => {
    const a = assessEvmTransaction({
      decoded: { kind: 'native' }, txTo: DEAD,
      valueWei: parseEther('0.1'), nativeBalanceWei: parseEther('2'),
    });
    expect(codes(a)).toContain('known_bad_recipient');
    expect(a.risks.find((x) => x.code === 'known_bad_recipient').level).toBe('high');
  });

  it('flags a LOOK-ALIKE recipient (address poisoning) vs the user history', () => {
    // Same first 4 + last 4 nibbles, different middle — the poisoning pattern.
    const known = '0xa11ce1234567890abcdef1234567890abcc0ffee';
    const lookAlike = '0xa11cefedcba0987654321fedcba0987654c0ffee';
    const a = assessEvmTransaction({
      decoded: { kind: 'native' }, txTo: lookAlike,
      valueWei: parseEther('0.1'), nativeBalanceWei: parseEther('2'),
      knownAddresses: [{ address: known, label: 'paid before' }],
    });
    expect(codes(a)).toContain('look_alike_recipient');
  });

  it('flags interaction with an unverified contract (native send to a contract)', () => {
    const a = assessEvmTransaction({
      decoded: { kind: 'native' }, txTo: SPENDER, targetIsContract: true,
      networkKey: 'sepolia', valueWei: parseEther('0.1'), nativeBalanceWei: parseEther('2'),
    });
    expect(codes(a)).toContain('unverified_contract');
  });

  it('flags unrecognised calldata as high risk', () => {
    const decoded = describeErc20Call({ data: '0xdeadbeef', tokenSymbol: 'USDC', decimals: 6 });
    const a = assessEvmTransaction({ decoded, txTo: USDC, networkKey: 'sepolia' });
    expect(decoded.kind).toBe('unknown');
    expect(codes(a)).toContain('unrecognized_calldata');
  });

  it('flags a near-total native outflow as a drain (high)', () => {
    const a = assessEvmTransaction({
      decoded: { kind: 'native' }, txTo: FRESH,
      valueWei: parseEther('2'), nativeBalanceWei: parseEther('2'), nativeSymbol: 'ETH',
    });
    expect(codes(a)).toContain('entire_balance');
  });

  it('flags a large (but not total) native outflow as medium', () => {
    const a = assessEvmTransaction({
      decoded: { kind: 'native' }, txTo: FRESH,
      valueWei: parseEther('1.85'), nativeBalanceWei: parseEther('2'), nativeSymbol: 'ETH',
    });
    expect(codes(a)).toContain('large_outflow');
  });

  it('M-1 (issue #962): outflow fraction is correct for amounts > 2^53 wei (BigInt precision)', () => {
    // A value slightly below the large_outflow threshold should NOT trip the flag.
    // 2^53 wei ≈ 9007 ETH — well above any real wallet but used to prove no Number
    // precision loss in the ratio calculation. 50% of 2^53+1 must not round to 100%.
    const largeBalance = BigInt(2) ** BigInt(53) + BigInt(1);
    const halfBalance = largeBalance / BigInt(2);
    // halfBalance / largeBalance = ~50%, well below the default large_outflow threshold (90%).
    const a = assessEvmTransaction({
      decoded: { kind: 'native' }, txTo: FRESH,
      valueWei: halfBalance, nativeBalanceWei: largeBalance, nativeSymbol: 'ETH',
    });
    expect(codes(a)).not.toContain('large_outflow');
    expect(codes(a)).not.toContain('entire_balance');
  });

  it('flags a large ERC-20 outflow relative to the token balance', () => {
    const data = iface.encodeFunctionData('transfer', [FRESH, parseUnits('1200', 6)]);
    const decoded = describeErc20Call({ data, tokenSymbol: 'USDC', decimals: 6 });
    const a = assessEvmTransaction({
      decoded, txTo: USDC, tokenSymbol: 'USDC', networkKey: 'sepolia',
      targetIsContract: true, tokenBalance: '1250',
    });
    expect(codes(a)).toContain('large_outflow');
  });
});

describe('assessEvmTransaction — never asserts safety', () => {
  it('a clean small send to a fresh EOA yields NO risk flags (and no "safe" claim)', () => {
    const a = assessEvmTransaction({
      decoded: { kind: 'native' }, txTo: FRESH,
      valueWei: parseEther('0.05'), nativeBalanceWei: parseEther('2'), nativeSymbol: 'ETH',
    });
    expect(a.risks).toHaveLength(0);
    // The absence of risks is conveyed as an EMPTY list — the module never emits
    // a "safe" verdict. The UI renders the explicit "not a guarantee" line.
    const blob = JSON.stringify(a).toLowerCase();
    expect(blob).not.toContain('"safe"');
    expect(blob).not.toMatch(/is safe|transaction is safe/);
  });
});

describe('simulateEvmTransaction — input guard (no network)', () => {
  it('rejects a malformed target address before any RPC work', async () => {
    await expect(
      simulateEvmTransaction({ networkKey: 'sepolia', from: FRESH, to: 'not-an-address', valueWei: 1n })
    ).rejects.toThrow(/invalid/i);
  });
});

describe('describeBtcPlan — honest decode (no fake simulation)', () => {
  const fromAddr = 'tb1qself';
  const plan = {
    inputs: [{ value: 1500000n }, { value: 800000n }],
    outputs: [{ address: 'tb1qrecipient', value: 2000000n }, { address: fromAddr, value: 295000n }],
    feeSats: 5000n,
  };

  it('separates recipient output, change-to-self, and fee', () => {
    const r = describeBtcPlan({ plan, fromAddress: fromAddr });
    expect(r.chain).toBe('btc');
    expect(r.simulated).toBe(false); // BTC has no programmable execution to dry-run
    const out = r.balanceChanges.find((c) => c.direction === 'out');
    const change = r.balanceChanges.find((c) => c.direction === 'in');
    expect(out.amount).toBe('0.02'); // 2,000,000 sats
    expect(out.who).toBe('tb1qrecipient');
    expect(change.amount).toBe('0.00295'); // 295,000 sats change back to self
    expect(r.fee.amount).toBe('0.00005'); // 5,000 sats
    expect(r.source.thirdParty).toBe(false);
  });

  it('flags a near-total outflow (little/no change)', () => {
    const drain = {
      inputs: [{ value: 1000000n }],
      outputs: [{ address: 'tb1qrecipient', value: 995000n }],
      feeSats: 5000n,
    };
    const r = describeBtcPlan({ plan: drain, fromAddress: fromAddr });
    expect(r.risks.map((x) => x.code)).toContain('entire_balance');
  });
});

describe('describeSolTransfer — decode + rent pre-flight', () => {
  it('shows the transfer amount, base+priority fee, and a priority-fee note', () => {
    const r = describeSolTransfer({
      plan: { amountLamports: 250000000n, feeLamports: 105000n, baseFeeLamports: 5000n, priorityFeeLamports: 100000n },
      fromAddress: 'So1Sender', toAddress: 'So1Recipient',
    });
    expect(r.chain).toBe('sol');
    expect(r.simulated).toBe(false);
    expect(r.balanceChanges.find((c) => c.direction === 'out').amount).toBe('0.25'); // 0.25 SOL
    expect(r.fee.amount).toBe('0.000105');
    expect(r.fee.sub).toMatch(/priority/);
    expect(r.risks.map((x) => x.code)).toContain('priority_fee');
    expect(r.source.thirdParty).toBe(false);
  });

  it('notes when send-max empties the account', () => {
    const r = describeSolTransfer({
      plan: { amountLamports: 1000000n, feeLamports: 5000n, sendMax: true },
      fromAddress: 'So1Sender', toAddress: 'So1Recipient',
    });
    expect(r.risks.map((x) => x.code)).toContain('empties_account');
  });
});
