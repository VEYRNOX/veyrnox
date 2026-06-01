// wallet-core/__tests__/sol-fees.test.js
//
// Solana's fee model is NATIVE (base fee per signature + OPTIONAL compute-unit
// priority price), not EVM gas-limit×price. These pure tests pin: (1) the
// priority-lamports maths, (2) tier assembly incl. the no-priority "None" tier,
// (3) that the selected priority fee actually reaches the SIGNED transaction as
// ComputeBudget instructions, and (4) that folding priority into the fee keeps
// the rent-safety planner honest. No network.

import { describe, it, expect } from 'vitest';
import { Keypair, PublicKey, Transaction, ComputeBudgetProgram } from '@solana/web3.js';
import { buildSolTiers, solPriorityLamports, SOL_DEFAULT_CU_LIMIT, SOL_TIERS } from '../sol/fees.js';
import { buildAndSignSol, solComputeBudgetIxns, planSolTransfer } from '../sol/send.js';

const COMPUTE_BUDGET_ID = ComputeBudgetProgram.programId.toBase58();

describe('solPriorityLamports — ceil(price × limit / 1e6)', () => {
  it('computes the priority fee over a CU limit (rounds up)', () => {
    // 1000 µlam/CU over 1000 CU = 1_000_000 µlam = 1 lamport exactly.
    expect(solPriorityLamports(1000, 1000)).toBe(1n);
    // 1 µlam/CU over 1000 CU = 1000 µlam → ceil to 1 lamport (never under-fund).
    expect(solPriorityLamports(1, 1000)).toBe(1n);
    expect(solPriorityLamports(0, 1000)).toBe(0n);
  });
});

describe('buildSolTiers — base + optional priority', () => {
  const tiers = buildSolTiers({ baseLamportsPerSig: 5000n, priorityMicroLamports: 10000 });

  it('exposes none/standard/fast with monotonic totals', () => {
    expect(tiers.map((t) => t.id)).toEqual(['none', 'standard', 'fast']);
    const totals = tiers.map((t) => BigInt(t.totalLamports));
    expect(totals[0] <= totals[1] && totals[1] <= totals[2]).toBe(true);
  });

  it('the "none" tier is base-fee-only (no priority, no CU limit)', () => {
    const none = tiers[0];
    expect(none.priorityMicroLamports).toBe(0);
    expect(none.computeUnitLimit).toBe(0);
    expect(BigInt(none.totalLamports)).toBe(5000n); // base only, unchanged behaviour
  });

  it('priority tiers add a non-zero priority fee on top of the base', () => {
    const std = tiers[1];
    expect(std.priorityMicroLamports).toBeGreaterThan(0);
    expect(std.computeUnitLimit).toBe(SOL_DEFAULT_CU_LIMIT);
    expect(BigInt(std.totalLamports)).toBe(5000n + BigInt(std.priorityLamports));
  });

  it('floors priority on an idle testnet (median ~0 still attaches a price)', () => {
    const idle = buildSolTiers({ baseLamportsPerSig: 5000n, priorityMicroLamports: 0 });
    expect(idle[1].priorityMicroLamports).toBeGreaterThan(0);
    expect(idle[2].priorityMicroLamports).toBeGreaterThan(idle[1].priorityMicroLamports);
  });

  it('SOL_TIERS multipliers are 0/1/2', () => {
    expect(SOL_TIERS.map((t) => t.priorityMult)).toEqual([0, 1, 2]);
  });
});

describe('solComputeBudgetIxns — the priority knob', () => {
  it('returns [] when no priority is requested (identical base-fee-only tx)', () => {
    expect(solComputeBudgetIxns()).toEqual([]);
    expect(solComputeBudgetIxns({ priorityMicroLamports: 0, computeUnitLimit: 1000 })).toEqual([]);
  });

  it('emits setComputeUnitLimit + setComputeUnitPrice when priority > 0', () => {
    const ixns = solComputeBudgetIxns({ priorityMicroLamports: 5000, computeUnitLimit: 1000 });
    expect(ixns).toHaveLength(2);
    expect(ixns.every((ix) => ix.programId.toBase58() === COMPUTE_BUDGET_ID)).toBe(true);
  });
});

describe('buildAndSignSol — selected priority reaches the SIGNED tx', () => {
  const payer = Keypair.fromSeed(new Uint8Array(32).fill(7));
  const toPubkey = new PublicKey(new Uint8Array(32).fill(9));
  const blockhash = new PublicKey(new Uint8Array(32).fill(1)).toBase58(); // valid 32-byte base58

  it('base-fee-only build has exactly one instruction (the transfer)', () => {
    const { rawTx, signature } = buildAndSignSol({ keypair: payer, toPubkey, amountLamports: 1_000_000n, blockhash });
    expect(signature.length).toBeGreaterThan(0);
    const tx = Transaction.from(rawTx);
    expect(tx.instructions).toHaveLength(1);
    expect(tx.instructions.some((ix) => ix.programId.toBase58() === COMPUTE_BUDGET_ID)).toBe(false);
  });

  it('a priority build prepends the ComputeBudget instructions before the transfer', () => {
    const { rawTx } = buildAndSignSol({
      keypair: payer, toPubkey, amountLamports: 1_000_000n, blockhash,
      priorityMicroLamports: 5000, computeUnitLimit: 1000,
    });
    const tx = Transaction.from(rawTx);
    expect(tx.instructions).toHaveLength(3); // 2 compute-budget + 1 transfer
    expect(tx.instructions[0].programId.toBase58()).toBe(COMPUTE_BUDGET_ID);
    expect(tx.instructions[1].programId.toBase58()).toBe(COMPUTE_BUDGET_ID);
    expect(tx.instructions[2].programId.toBase58()).toBe('11111111111111111111111111111111'); // System program
  });
});

describe('priority fee folds into the rent-safety planner', () => {
  const RENT_MIN = 890880n;
  it('a larger total fee (base+priority) reduces the safe remainder accordingly', () => {
    const plan = planSolTransfer({
      balanceLamports: 1_000_000_000n,
      amountLamports: 100_000_000n,
      feeLamports: 5000n + 50_000n, // base + priority folded in
      rentExemptMinLamports: RENT_MIN,
      destBalanceLamports: RENT_MIN,
    });
    expect(plan.feeLamports).toBe(55_000n);
    expect(plan.remainderLamports).toBe(1_000_000_000n - 100_000_000n - 55_000n);
  });
});
