import { describe, expect, it } from 'vitest';

import {
  buildSuspiciousAssetSnapshot,
  evaluateSuspiciousNft,
  evaluateSuspiciousToken,
  evaluateTokenContractRisk,
} from '@/lib/suspiciousAssets';

describe('evaluateTokenContractRisk', () => {
  it('surfaces mint, freeze, transfer-tax, liquidity, holder, and verification concerns', () => {
    const risk = evaluateTokenContractRisk({
      token_contract: '0xdeadbeef00000000000000000000000000000009',
      is_mintable: true,
      is_freezable: true,
      transfer_fee_bps: 700,
      liquidity_usd: 1500,
      holder_count: 42,
      contract_verified: false,
      deployed_at: '2026-08-10T00:00:00.000Z',
    });

    expect(risk.severity).toBe('high');
    expect(risk.issues.map((issue) => issue.kind)).toEqual(
      expect.arrayContaining(['mintable', 'freezable', 'transfer_fee', 'liquidity', 'holder_count', 'contract_verified', 'new_contract', 'placeholder_contract'])
    );
    expect(risk.confidence).toBe('strong_warning');
    expect(risk.knownChecks).toBe(6);
  });

  it('marks limited contract evidence as mostly unknown when coverage stays thin', () => {
    const risk = evaluateTokenContractRisk({
      token_contract: '0x1234567890123456789012345678901234567890',
      contract_verified: false,
    });

    expect(risk.score).toBe(1);
    expect(risk.confidence).toBe('mostly_unknown');
    expect(risk.knownChecks).toBe(1);
    expect(risk.unknowns).toEqual(
      expect.arrayContaining(['mint authority', 'freeze authority', 'transfer tax', 'liquidity depth', 'holder distribution'])
    );
  });

  it('marks medium-risk rows as partial evidence when enough checks are concrete', () => {
    const risk = evaluateTokenContractRisk({
      token_contract: '0x1234567890123456789012345678901234567890',
      liquidity_usd: 1000,
      holder_count: 120,
      transfer_fee_bps: 0,
      contract_verified: true,
    });

    expect(risk.score).toBe(1);
    expect(risk.confidence).toBe('partial_evidence');
    expect(risk.knownChecks).toBe(4);
  });
});

describe('evaluateSuspiciousToken', () => {
  it('combines metadata spam and contract risk', () => {
    const token = evaluateSuspiciousToken({
      symbol: 'USDC',
      name: 'USDC-Rewards.com',
      acquired_via: 'airdrop',
      value_usd: 0,
      balance: 5000,
      contract_verified: false,
    });

    expect(token.suspicious).toBe(true);
    expect(token.spam.spam).toBe(true);
    expect(token.reasons.length).toBeGreaterThan(1);
  });
});

describe('evaluateSuspiciousNft', () => {
  it('flags unsolicited NFTs and blocked remote art', () => {
    const nft = evaluateSuspiciousNft({
      name: 'Claim Reward Pass',
      collection: 'Free Reward',
      acquired_via: 'airdrop',
      image_url: 'https://attacker.example/track.png',
    });

    expect(nft.suspicious).toBe(true);
    expect(nft.reasons.map((reason) => reason.kind)).toEqual(
      expect.arrayContaining(['unsolicited_airdrop', 'remote_image_blocked', 'lure_wording'])
    );
  });
});

describe('buildSuspiciousAssetSnapshot', () => {
  it('summarizes suspicious tokens, contracts, and NFTs together', () => {
    const snapshot = buildSuspiciousAssetSnapshot({
      tokens: [
        { symbol: 'USDC', name: 'USDC-Rewards.com', acquired_via: 'airdrop', value_usd: 0, balance: 5000, contract_verified: false },
      ],
      nfts: [
        { name: 'Claim Reward Pass', collection: 'Free Reward', acquired_via: 'airdrop', image_url: 'https://attacker.example/track.png' },
      ],
    });

    expect(snapshot.totals.suspiciousTokens).toBe(1);
    expect(snapshot.totals.suspiciousNfts).toBe(1);
    expect(snapshot.totals.riskyContracts).toBe(1);
    expect(snapshot.totals.total).toBe(2);
  });

  it('respects spam overrides and dismissed NFT ids', () => {
    const snapshot = buildSuspiciousAssetSnapshot({
      tokens: [
        { id: 'clone', symbol: 'USDC', name: 'USDC-Rewards.com', acquired_via: 'airdrop', value_usd: 0, balance: 5000, contract_verified: false },
      ],
      nfts: [
        { id: 'nft-1', name: 'Claim Reward Pass', collection: 'Free Reward', acquired_via: 'airdrop', image_url: 'https://attacker.example/track.png' },
      ],
      spamOverrides: { clone: 'show' },
      dismissedNftIds: ['nft-1'],
    });

    expect(snapshot.totals.visibleTokens).toBe(1);
    expect(snapshot.totals.hiddenTokens).toBe(0);
    expect(snapshot.totals.suspiciousNfts).toBe(0);
  });
});
