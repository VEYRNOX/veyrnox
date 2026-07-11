// I3 deniability: the Send page must issue ZERO live RPC reads in a decoy/hidden
// (deniability) session. Two layers are pinned here:
//
//  (1) Provider-level fail-closed guard — the RPC-touching functions themselves
//      (getBalanceEth, simulateEvmTransaction, getUtxos) throw when a deniability
//      session is active, mirroring decoyBalance.js's exported-function guard so a
//      future caller can never leak egress (behavioural test, real crypto/no mocks).
//
//  (2) The SendCrypto.jsx query wiring — the three live-RPC useQuery blocks
//      (liveBalance / txSim / btcSim) gate their `enabled` clause on the deniability
//      session, not merely on `!demoActive` (structural source pin; a full render of
//      SendCrypto requires the entire send stack, which this codebase pins by source
//      per SendCrypto.confirmation.test.js).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  setDeniabilitySession,
  isDeniabilitySessionActive,
} from '@/wallet-core/deniabilitySession.js';
import { getBalanceEth } from '@/wallet-core/evm/provider.js';
import { simulateEvmTransaction } from '@/wallet-core/evm/simulate.js';
import { getUtxos } from '@/wallet-core/btc/provider.js';

const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, '../SendCrypto.jsx'), 'utf8');

describe('SendCrypto I3 — provider-level fail-closed guards in a deniability session', () => {
  beforeEach(() => setDeniabilitySession(true));
  afterEach(() => setDeniabilitySession(false));

  it('deniability session is active for these assertions', () => {
    expect(isDeniabilitySessionActive()).toBe(true);
  });

  it('getBalanceEth (EVM balance) refuses to touch the network', async () => {
    await expect(getBalanceEth('sepolia', '0x0000000000000000000000000000000000000001'))
      .rejects.toThrow(/deniability/i);
  });

  it('simulateEvmTransaction (tx simulation) refuses to touch the network', async () => {
    await expect(simulateEvmTransaction({
      networkKey: 'sepolia',
      from: '0x0000000000000000000000000000000000000001',
      to: '0x0000000000000000000000000000000000000002',
      valueWei: 0n,
    })).rejects.toThrow(/deniability/i);
  });

  it('getUtxos (BTC Esplora read) refuses to touch the network', async () => {
    await expect(getUtxos('testnet', 'tb1qexampleexampleexampleexampleexampleex'))
      .rejects.toThrow(/deniability/i);
  });
});

describe('SendCrypto I3 — the three live-RPC useQuery blocks gate on the deniability session', () => {
  it('imports the deniability-session predicate', () => {
    expect(src).toMatch(/isDeniabilitySessionActive/);
  });

  it('liveBalance / txSim / btcSim enabled clauses are deniability-gated (not just !demoActive)', () => {
    // Collect only the single-line `enabled:` clauses that drive a live RPC read
    // (they reference demoActive / DEMO plus an EVM/BTC family predicate). Line-based
    // scan — no multiline regex (a greedy one backtracks catastrophically on this file).
    const rpcEnabledLines = src
      .split('\n')
      .filter((l) => l.trimStart().startsWith('enabled:'))
      .filter((l) => /isEvmFamily|isBtc|canReceive/.test(l));
    // liveBalance (canReceive+isEvmFamily), txSim (isEvmFamily), btcSim (isBtc).
    expect(rpcEnabledLines.length).toBeGreaterThanOrEqual(3);
    // Each enabled clause MUST contain !isDeniabilitySessionActive() specifically.
    // Using an OR with !isDecoy&&!isHidden would make this vacuous (those are always
    // present); we require the H-1 addition independently so the test fails if it is
    // removed even if the older predicates remain.
    for (const line of rpcEnabledLines) {
      expect(line).toMatch(/!isDeniabilitySessionActive\(\)/);
    }
  });
});
