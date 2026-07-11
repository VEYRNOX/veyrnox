// wallet-core/__tests__/sol-send.test.js
//
// The rent-exemption planner is the Solana fund-loss backstop (the analogue of
// BTC's change-output conservation). These pure tests pin the two ways a naive
// transfer bricks funds — dust to a NEW account, and stranding the SENDER below
// rent-exempt — plus the normal happy paths. No network, no broadcast.
//
// (The OTHER Solana trap, blockhash expiry, is exercised by the live send loop
// in signAndBroadcastSol — it refetches a fresh blockhash and rebuilds on a
// TransactionExpired* error. That requires the network and is part of the
// hands-on devnet verification gate; see docs/PhaseSOL.md.)

import { describe, it, expect } from 'vitest';
import { planSolTransfer } from '../sol/send.js';

// A 0-byte system account's rent-exempt minimum on Solana is ~0.00089088 SOL.
const RENT_MIN = 890880n;
const FEE = 5000n;

describe('planSolTransfer — rent + fee safety', () => {
  it('plans a normal send to an EXISTING account', () => {
    const plan = planSolTransfer({
      balanceLamports: 1_000_000_000n,        // 1 SOL
      amountLamports: 100_000_000n,           // 0.1 SOL
      feeLamports: FEE,
      rentExemptMinLamports: RENT_MIN,
      destBalanceLamports: RENT_MIN,          // recipient already exists
    });
    expect(plan.amountLamports).toBe(100_000_000n);
    expect(plan.remainderLamports).toBe(1_000_000_000n - 100_000_000n - FEE);
  });

  it('TRAP 2a: rejects dust to a NEW (0-balance) account', () => {
    expect(() => planSolTransfer({
      balanceLamports: 1_000_000_000n,
      amountLamports: 1000n,                  // below rent-exempt min
      feeLamports: FEE,
      rentExemptMinLamports: RENT_MIN,
      destBalanceLamports: 0n,                // brand-new recipient
    })).toThrow(/rent-exempt minimum/i);
  });

  it('TRAP 2a: ALLOWS a first deposit that meets the rent-exempt minimum', () => {
    const plan = planSolTransfer({
      balanceLamports: 1_000_000_000n,
      amountLamports: RENT_MIN,               // exactly the minimum
      feeLamports: FEE,
      rentExemptMinLamports: RENT_MIN,
      destBalanceLamports: 0n,
    });
    expect(plan.amountLamports).toBe(RENT_MIN);
  });

  it('TRAP 2b: rejects a send that strands the SENDER below rent-exempt', () => {
    // Leaves 1000 lamports (between 0 and RENT_MIN) -> would risk purge.
    const balance = RENT_MIN + 100_000_000n;
    expect(() => planSolTransfer({
      balanceLamports: balance,
      amountLamports: balance - FEE - 1000n,  // remainder = 1000
      feeLamports: FEE,
      rentExemptMinLamports: RENT_MIN,
      destBalanceLamports: RENT_MIN,
    })).toThrow(/rent-exempt minimum/i);
  });

  it('TRAP 2b: ALLOWS emptying the account exactly (send-max, remainder 0)', () => {
    const balance = 500_000_000n;
    const plan = planSolTransfer({
      balanceLamports: balance,
      feeLamports: FEE,
      rentExemptMinLamports: RENT_MIN,
      destBalanceLamports: RENT_MIN,          // existing recipient
      sendMax: true,
    });
    expect(plan.amountLamports).toBe(balance - FEE);
    expect(plan.remainderLamports).toBe(0n);
    expect(plan.sendMax).toBe(true);
  });

  it('ALLOWS a remainder that stays at or above rent-exempt', () => {
    const plan = planSolTransfer({
      balanceLamports: 1_000_000_000n,
      amountLamports: 1_000_000_000n - FEE - RENT_MIN, // remainder == RENT_MIN
      feeLamports: FEE,
      rentExemptMinLamports: RENT_MIN,
      destBalanceLamports: RENT_MIN,
    });
    expect(plan.remainderLamports).toBe(RENT_MIN);
  });

  it('rejects an amount that exceeds balance', () => {
    expect(() => planSolTransfer({
      balanceLamports: 100n,
      amountLamports: 1_000_000n,
      feeLamports: FEE,
      rentExemptMinLamports: RENT_MIN,
      destBalanceLamports: RENT_MIN,
    })).toThrow(/network fee|Insufficient/i);
  });

  it('rejects when the balance cannot even cover the fee', () => {
    expect(() => planSolTransfer({
      balanceLamports: FEE,
      amountLamports: 1n,
      feeLamports: FEE,
      rentExemptMinLamports: RENT_MIN,
      destBalanceLamports: RENT_MIN,
    })).toThrow(/fee/i);
  });

  it('rejects a non-positive amount', () => {
    expect(() => planSolTransfer({
      balanceLamports: 1_000_000_000n,
      amountLamports: 0n,
      feeLamports: FEE,
      rentExemptMinLamports: RENT_MIN,
      destBalanceLamports: RENT_MIN,
    })).toThrow(/positive/i);
  });

  // TYPE GUARD (issue #754): a float or string amount must be REJECTED, never
  // silently coerced via BigInt(...). A non-bigint amount bypasses the caller's
  // decimal-amount validation, so the planner fails closed on it (I4).
  it('rejects a FLOAT amount (silent-coercion guard)', () => {
    expect(() => planSolTransfer({
      balanceLamports: 1_000_000_000n,
      amountLamports: 1.5,                     // float — must not be coerced
      feeLamports: FEE,
      rentExemptMinLamports: RENT_MIN,
      destBalanceLamports: RENT_MIN,
    })).toThrow(/must be a bigint/i);
  });

  it('rejects a STRING amount (silent-coercion guard)', () => {
    expect(() => planSolTransfer({
      balanceLamports: 1_000_000_000n,
      amountLamports: '1000',                  // string — must not be coerced
      feeLamports: FEE,
      rentExemptMinLamports: RENT_MIN,
      destBalanceLamports: RENT_MIN,
    })).toThrow(/must be a bigint/i);
  });

  it('ACCEPTS a bigint amount (happy path unchanged)', () => {
    const plan = planSolTransfer({
      balanceLamports: 1_000_000_000n,
      amountLamports: 100_000_000n,
      feeLamports: FEE,
      rentExemptMinLamports: RENT_MIN,
      destBalanceLamports: RENT_MIN,
    });
    expect(plan.amountLamports).toBe(100_000_000n);
  });
});
