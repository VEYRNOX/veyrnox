// src/lib/__tests__/evidenceOnchain.test.js
//
// Hermetic unit tests for scripts/lib/evidence-onchain.mjs — the pure core of the
// on-chain evidence re-confirmation job. No network, no filesystem: every provider
// response is a fixture. Also asserts the real verified-evidence.json entries all
// map to a known chain (so the CLI can never silently skip an entry).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  collectEvidence,
  normalizeChain,
  chainConfig,
  buildProbe,
  interpretProbe,
  CONFIRMED,
  FAILED,
  UNREACHABLE,
} from '../../../scripts/lib/evidence-onchain.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const readRepo = (p) => readFileSync(join(REPO_ROOT, p), 'utf8');

describe('collectEvidence', () => {
  it('skips "_"-prefixed META keys and entries missing chain/txid', () => {
    const rows = collectEvidence({
      _schema: 'ignored',
      _meta_key: { chain: 'sepolia', txid: '0xabc' },
      evidence: {
        _corrected: 'note',
        Good: { chain: 'sepolia', txid: '0xdead', date: '2026-01-01' },
        NoTxid: { chain: 'sepolia' },
        NoChain: { txid: '0xbeef' },
      },
    });
    expect(rows).toEqual([{ feature: 'Good', chain: 'sepolia', txid: '0xdead', date: '2026-01-01' }]);
  });

  it('returns [] for an empty evidence map', () => {
    expect(collectEvidence({ evidence: {} })).toEqual([]);
    expect(collectEvidence({})).toEqual([]);
  });
});

describe('chain normalization', () => {
  it('resolves aliases to canonical keys', () => {
    expect(normalizeChain('ethereum')).toBe('mainnet');
    expect(normalizeChain('Fuji')).toBe('avalanche-fuji');
    expect(normalizeChain('btc')).toBe('bitcoin-testnet');
    expect(normalizeChain('devnet')).toBe('solana-devnet');
  });
  it('returns a config for known chains and null for unknown', () => {
    expect(chainConfig('sepolia').kind).toBe('evm');
    expect(chainConfig('bitcoin-testnet').kind).toBe('btc-esplora');
    expect(chainConfig('solana-devnet').kind).toBe('solana');
    expect(chainConfig('dogechain')).toBeNull();
  });
});

describe('buildProbe', () => {
  it('builds an eth_getTransactionReceipt POST for EVM chains', () => {
    const p = buildProbe('sepolia', '0xabc');
    expect(p.method).toBe('POST');
    expect(JSON.parse(p.body).method).toBe('eth_getTransactionReceipt');
    expect(JSON.parse(p.body).params).toEqual(['0xabc']);
  });
  it('builds a GET esplora URL for bitcoin', () => {
    const p = buildProbe('bitcoin-testnet', 'deadbeef');
    expect(p.method).toBe('GET');
    expect(p.url).toContain('/tx/deadbeef');
  });
  it('builds a getSignatureStatuses POST for solana with history search', () => {
    const p = buildProbe('solana-devnet', 'sig123');
    expect(JSON.parse(p.body).method).toBe('getSignatureStatuses');
    expect(JSON.parse(p.body).params[1].searchTransactionHistory).toBe(true);
  });
  it('returns null for an unknown chain', () => {
    expect(buildProbe('dogechain', '0x')).toBeNull();
  });
});

describe('interpretProbe — EVM', () => {
  it('CONFIRMED on receipt status 0x1', () => {
    expect(interpretProbe('evm', { result: { status: '0x1', blockNumber: '0x64' } }).verdict).toBe(CONFIRMED);
  });
  it('FAILED on null receipt (tx not found / dropped)', () => {
    expect(interpretProbe('evm', { result: null }).verdict).toBe(FAILED);
  });
  it('FAILED on receipt status 0x0 (reverted)', () => {
    expect(interpretProbe('evm', { result: { status: '0x0' } }).verdict).toBe(FAILED);
  });
  it('UNREACHABLE on an RPC error object', () => {
    expect(interpretProbe('evm', { error: { message: 'limit exceeded' } }).verdict).toBe(UNREACHABLE);
  });
});

describe('interpretProbe — Bitcoin (esplora)', () => {
  it('CONFIRMED when status.confirmed is true', () => {
    expect(interpretProbe('btc-esplora', { status: { confirmed: true, block_height: 4990901 } }).verdict).toBe(CONFIRMED);
  });
  it('FAILED on a 404 sentinel', () => {
    expect(interpretProbe('btc-esplora', { __httpStatus: 404 }).verdict).toBe(FAILED);
  });
  it('FAILED when confirmed is explicitly false (mempool only)', () => {
    expect(interpretProbe('btc-esplora', { status: { confirmed: false } }).verdict).toBe(FAILED);
  });
});

describe('interpretProbe — Solana', () => {
  it('CONFIRMED when finalized with no err', () => {
    expect(interpretProbe('solana', { result: { value: [{ confirmationStatus: 'finalized', slot: 5, err: null }] } }).verdict).toBe(CONFIRMED);
  });
  it('FAILED when the signature is not found (null status)', () => {
    expect(interpretProbe('solana', { result: { value: [null] } }).verdict).toBe(FAILED);
  });
  it('FAILED when the tx carries an err', () => {
    expect(interpretProbe('solana', { result: { value: [{ err: { InstructionError: [0, 'x'] } }] } }).verdict).toBe(FAILED);
  });
});

describe('real verified-evidence.json is fully mappable', () => {
  it('every evidence entry resolves to a known chain config', () => {
    const rows = collectEvidence(JSON.parse(readRepo('docs/verified-evidence.json')));
    expect(rows.length).toBeGreaterThan(0);
    const unmapped = rows.filter((r) => chainConfig(r.chain) === null);
    expect(unmapped.map((r) => `${r.feature} -> ${r.chain}`)).toEqual([]);
  });
});
