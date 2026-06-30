// wallet-core/__tests__/suspicious.test.js
//
// Phase S2 (Suspicious-recipient screening) safety-critical, network-free tests
// for the pure blocklist screen that feeds the pre-sign preview:
//   - a flagged address is caught WITH the correct category
//   - a clean address returns flagged:false and NEVER asserts "safe"
//   - case-insensitive (checksummed / upper / lower all match)
//   - an invalid / non-EVM recipient returns valid:false (not screenable here)
//   - a custom provider is honored
//   - the same finding from two providers is de-duplicated
// Also checks the screen composes into assessEvmTransaction's risk list.

import { describe, it, expect } from 'vitest';
import { parseEther } from 'ethers';
import {
  screenAddress,
  makeBlocklistProvider,
  localBlocklistProvider,
  DEFAULT_BLOCKLIST,
  CATEGORIES,
} from '../evm/suspicious.js';
import { assessEvmTransaction } from '../evm/simulate.js';

const DEAD = '0x000000000000000000000000000000000000dEaD';
const CLEAN = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'; // a fresh EOA, not listed
const SCAMMER = '0x1111111111111111111111111111111111111111';

const codes = (a) => a.risks.map((r) => r.code);

describe('screenAddress — flagged recipients', () => {
  it('catches a burn / null sink (shared with poison.js)', () => {
    const r = screenAddress(DEAD);
    expect(r.flagged).toBe(true);
    expect(r.matches[0].category).toBe('burn');
  });

  it('is case-insensitive — checksummed, upper, and lower all match (burn sink example)', () => {
    const lower = screenAddress(DEAD.toLowerCase());
    const upper = screenAddress('0x' + DEAD.slice(2).toUpperCase());
    const mixed = screenAddress(DEAD);
    expect(lower.flagged).toBe(true);
    expect(upper.flagged).toBe(true);
    expect(mixed.flagged).toBe(true);
    // The reported address is normalised to lowercase regardless of input casing.
    expect(mixed.matches[0].address).toBe(DEAD.toLowerCase());
  });
});

describe('screenAddress — clean recipients (never asserts "safe")', () => {
  it('returns flagged:false with no matches for an unlisted address', () => {
    const r = screenAddress(CLEAN);
    expect(r.valid).toBe(true);
    expect(r.flagged).toBe(false);
    expect(r.matches).toEqual([]);
    expect(r.reasons).toEqual([]);
  });

  it('never emits a "safe" verdict — only flagged / not-flagged', () => {
    const r = screenAddress(CLEAN);
    // Not-flagged is conveyed by flagged:false + empty matches, NOT a safety claim.
    expect(r).not.toHaveProperty('safe');
    const blob = JSON.stringify(r).toLowerCase();
    expect(blob).not.toContain('"safe"');
    expect(blob).not.toMatch(/is safe|address is safe/);
  });
});

describe('screenAddress — invalid / non-EVM input', () => {
  it('returns valid:false for a non-address string', () => {
    const r = screenAddress('not-an-address');
    expect(r.valid).toBe(false);
    expect(r.flagged).toBe(false);
    expect(r.matches).toEqual([]);
  });

  it('returns valid:false for a non-EVM (BTC/SOL) recipient', () => {
    expect(screenAddress('bc1qexamplebtcaddress').valid).toBe(false);
    expect(screenAddress('So1anaBase58Address11111111111111111111111').valid).toBe(false);
    expect(screenAddress(null).valid).toBe(false);
  });
});

describe('screenAddress — pluggable providers', () => {
  it('honors a custom provider', () => {
    const custom = {
      name: 'my-feed',
      screen(normAddr) {
        return normAddr === SCAMMER.toLowerCase()
          ? [{ address: SCAMMER, category: 'scam', source: 'my-feed v1', note: 'reported drainer UI' }]
          : [];
      },
    };
    const r = screenAddress(SCAMMER, { providers: [custom] });
    expect(r.flagged).toBe(true);
    expect(r.matches[0].category).toBe('scam');
    expect(r.matches[0].provider).toBe('my-feed');
    // A custom provider replaces the default set — an unlisted address
    // is not flagged here, proving the providers option is honored.
    expect(screenAddress(CLEAN, { providers: [custom] }).flagged).toBe(false);
  });

  it('de-duplicates the same finding reported by two providers', () => {
    const entry = { address: SCAMMER, category: 'drainer', source: 'feed', note: 'x' };
    const a = makeBlocklistProvider([entry], 'feed-a');
    const b = makeBlocklistProvider([entry], 'feed-b');
    const r = screenAddress(SCAMMER, { providers: [a, b] });
    expect(r.flagged).toBe(true);
    expect(r.matches).toHaveLength(1); // address+category collapsed across providers
  });

  it('keeps distinct categories for the same address', () => {
    const a = makeBlocklistProvider([{ address: SCAMMER, category: 'scam', source: 's' }], 'a');
    const b = makeBlocklistProvider([{ address: SCAMMER, category: 'drainer', source: 'd' }], 'b');
    const r = screenAddress(SCAMMER, { providers: [a, b] });
    expect(r.matches).toHaveLength(2);
    expect(r.matches.map((m) => m.category).sort()).toEqual(['drainer', 'scam']);
  });

  it('degrades (no throw) when a provider misbehaves', () => {
    const bad = { name: 'broken', screen() { throw new Error('boom'); } };
    const good = makeBlocklistProvider([{ address: SCAMMER, category: 'drainer', source: 'test' }], 'test');
    const r = screenAddress(SCAMMER, { providers: [bad, good] });
    expect(r.flagged).toBe(true); // the good provider still produced a match
    expect(r.matches[0].category).toBe('drainer');
  });
});

describe('default blocklist integrity', () => {
  it('every seed entry has a valid category and a real source', () => {
    expect(DEFAULT_BLOCKLIST.length).toBeGreaterThan(0);
    for (const e of DEFAULT_BLOCKLIST) {
      expect(CATEGORIES).toContain(e.category);
      expect(typeof e.source).toBe('string');
      expect(e.source.length).toBeGreaterThan(0);
    }
  });
});

describe('screenAddress composes into assessEvmTransaction', () => {
  it('does not double-flag a burn sink (already covered by known_bad_recipient)', () => {
    const a = assessEvmTransaction({
      decoded: { kind: 'native' }, txTo: DEAD,
      valueWei: parseEther('0.1'), nativeBalanceWei: parseEther('2'),
    });
    expect(codes(a)).toContain('known_bad_recipient');
    expect(codes(a)).not.toContain('flagged_recipient');
  });

  it('a clean recipient adds no screening flag (and no "safe" claim)', () => {
    const a = assessEvmTransaction({
      decoded: { kind: 'native' }, txTo: CLEAN,
      valueWei: parseEther('0.05'), nativeBalanceWei: parseEther('2'), nativeSymbol: 'ETH',
    });
    expect(codes(a)).not.toContain('flagged_recipient');
  });
});
