// lib/__tests__/securityPosture.test.js
//
// Unit tests for the Security Dashboard's PURE aggregation layer. These assert
// that the dashboard reuses the existing detection modules faithfully — the same
// "UNLIMITED" classification as the confirm screen (approvals), the same spam
// classifier, and the same poison/flagged screening — and that the posture
// summary NEVER fabricates a "safe" verdict (empty review list = no KNOWN items).
//
// Fixtures mirror the real demo seeds in src/api/demoClient.js so the test tracks
// what the dashboard actually renders in demo mode.

import { describe, it, expect } from 'vitest';
import {
  summarizeApprovals,
  summarizeSpamTokens,
  screenAddressHistory,
  buildReviewItems,
} from '../securityPosture';

const MAX_UINT256 =
  '115792089237316195423570985008687907853269984665640564039457584007913129639935';

// Mirrors demoClient.js TokenApproval seeds: 2 unlimited (1 untrusted=high,
// 1 trusted=medium), 1 finite trusted, 1 revoked.
const APPROVALS = [
  { token_symbol: 'USDC', decimals: 6, spender_address: '0xe592427a0aece92de3edee1f18e0157c05861564', allowance_raw: MAX_UINT256, trusted: true, status: 'active' },
  { token_symbol: 'USDC', decimals: 6, spender_address: '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad', allowance_raw: MAX_UINT256, trusted: false, status: 'active' },
  { token_symbol: 'USDC', decimals: 6, spender_address: '0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2', allowance_raw: '1000000000', trusted: true, status: 'active' },
  { token_symbol: 'USDC', decimals: 6, spender_address: '0x00000000000000adc04c56bf30ac9d3c0aaf14dc', allowance_raw: '0', trusted: true, status: 'revoked' },
];

// Mirrors demoClient.js WalletToken seeds: 2 verified, 4 scam-airdrop tokens.
const TOKENS = [
  { id: 'tok1', symbol: 'USDC', name: 'USD Coin', balance: 1250, value_usd: 1250, acquired_via: 'purchase', verified: true },
  { id: 'tok2', symbol: 'WETH', name: 'Wrapped Ether', balance: 0.42, value_usd: 1344, acquired_via: 'purchase', verified: true },
  { id: 'tok3', symbol: 'USDC', name: 'USDC-Rewards.com', balance: 5000, value_usd: 0, acquired_via: 'airdrop', verified: false },
  { id: 'tok4', symbol: 'CLAIM', name: 'Claim 5,000 USDT Reward', balance: 5000, value_usd: 0, acquired_via: 'airdrop', verified: false },
  { id: 'tok5', symbol: '🎁GIFT', name: 'Free Gift Token', balance: 1000000, value_usd: 0, acquired_via: 'airdrop', verified: false },
  { id: 'tok6', symbol: 'AIRDROP', name: 't.me/airdropclaim', balance: 250, value_usd: 0, acquired_via: 'airdrop', verified: false },
];

describe('summarizeApprovals', () => {
  it('counts active, unlimited, and high-risk (unlimited+untrusted) approvals', () => {
    const r = summarizeApprovals(APPROVALS);
    expect(r.total).toBe(4);
    expect(r.active).toBe(3);
    expect(r.unlimited).toBe(2); // both MaxUint256 rows
    expect(r.highRisk).toBe(1);  // only the untrusted unlimited one
  });

  it('an unlimited approval to a TRUSTED spender is unlimited but not high-risk', () => {
    const r = summarizeApprovals([APPROVALS[0]]); // trusted + MaxUint256
    expect(r.unlimited).toBe(1);
    expect(r.highRisk).toBe(0);
  });

  it('a finite allowance is neither unlimited nor high-risk', () => {
    const r = summarizeApprovals([APPROVALS[2]]); // 1,000 USDC
    expect(r.unlimited).toBe(0);
    expect(r.highRisk).toBe(0);
  });

  it('handles an empty list without throwing', () => {
    expect(summarizeApprovals()).toEqual({ total: 0, active: 0, unlimited: 0, highRisk: 0 });
  });
});

describe('summarizeSpamTokens', () => {
  it('flags the scam-airdrop tokens and leaves verified ones alone', () => {
    const r = summarizeSpamTokens(TOKENS);
    expect(r.total).toBe(6);
    expect(r.spam).toBe(4); // the 4 unverified airdrop lures
  });

  it('a verified token is never spam even with lure wording', () => {
    const r = summarizeSpamTokens([
      { id: 'x', symbol: 'CLAIM', name: 'Claim Reward', value_usd: 0, balance: 1, acquired_via: 'airdrop', verified: true },
    ]);
    expect(r.spam).toBe(0);
  });
});

describe('screenAddressHistory', () => {
  it('flags a known-bad/burn address that appears in activity', () => {
    const r = screenAddressHistory([
      { to_address: '0x000000000000000000000000000000000000dead' },
      { to_address: '0xa11ce1234567890abcdef1234567890abcc0ffee' },
    ]);
    expect(r.flagged).toBe(1);
    expect(r.lookAlikePairs).toBe(0);
  });

  it('detects a look-alike pair (poisoning footprint) and counts it once', () => {
    const known = '0xa11ce1234567890abcdef1234567890abcc0ffee';
    const poison = '0xa11cefedcba0987654321fedcba0987654c0ffee'; // same a11c…c0ffee
    const r = screenAddressHistory([{ to_address: known }, { to_address: poison }]);
    expect(r.lookAlikePairs).toBe(1);
  });

  it('clean history with one counterparty yields no flags (but is NOT called "safe")', () => {
    const r = screenAddressHistory([{ to_address: '0xa11ce1234567890abcdef1234567890abcc0ffee' }]);
    expect(r).toMatchObject({ flagged: 0, lookAlikePairs: 0 });
    expect(r.screened).toBe(1);
  });
});

describe('buildReviewItems', () => {
  it('surfaces high-risk approvals, medium unlimited, spam, and address risks as review items', () => {
    const { review } = buildReviewItems({
      approvals: { highRisk: 1, unlimited: 2 },
      spam: { spam: 4 },
      addresses: { flagged: 0, lookAlikePairs: 0 },
      features: { autoLockNever: false },
    });
    // 1 high-risk + 1 medium unlimited (2-1) + 4 spam
    expect(review).toHaveLength(3);
    expect(review.some((r) => r.severity === 'high' && r.path === '/token-approvals')).toBe(true);
    expect(review.some((r) => r.path === '/spam-filter')).toBe(true);
  });

  it('flags auto-lock=never as a gap', () => {
    const { review } = buildReviewItems({
      approvals: { highRisk: 0, unlimited: 0 },
      spam: { spam: 0 },
      addresses: { flagged: 0, lookAlikePairs: 0 },
      features: { autoLockNever: true },
    });
    expect(review).toHaveLength(1);
    expect(review[0].path).toBe('/settings');
  });

  it('returns an EMPTY review list when nothing is locally detectable (never claims "safe")', () => {
    const { review } = buildReviewItems({
      approvals: { highRisk: 0, unlimited: 0 },
      spam: { spam: 0 },
      addresses: { flagged: 0, lookAlikePairs: 0 },
      features: { autoLockNever: false },
    });
    expect(review).toEqual([]);
  });
});
