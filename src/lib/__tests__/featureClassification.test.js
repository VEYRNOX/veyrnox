// src/lib/__tests__/featureClassification.test.js
import { describe, it, expect } from 'vitest';
import { ALL_ROUTE_PATHS, CLASSIFICATION, registryEntriesFromClassification } from '../featureClassification';
import { getFeatureStatus } from '../featureRegistry';

const VERDICTS = ['live', 'disabled', 'cut'];

describe('classification completeness', () => {
  // All routes classified by the sweep; this now enforces completeness.
  it('assigns a deliberate verdict to EVERY route (no route left unclassified)', () => {
    const missing = ALL_ROUTE_PATHS.filter((p) => !CLASSIFICATION[p]);
    expect(missing).toEqual([]);
  });

  it('classifies no path that is not a real route', () => {
    const extra = Object.keys(CLASSIFICATION).filter((p) => !ALL_ROUTE_PATHS.includes(p));
    expect(extra).toEqual([]);
  });

  it('every entry has a valid verdict and a non-empty note', () => {
    for (const [path, entry] of Object.entries(CLASSIFICATION)) {
      expect(VERDICTS, `${path} verdict`).toContain(entry.verdict);
      expect(typeof entry.note, `${path} note`).toBe('string');
      expect(entry.note.length, `${path} note`).toBeGreaterThan(0);
    }
  });

  it('every disabled entry carries a reason (leaks|server|unverified)', () => {
    for (const [path, entry] of Object.entries(CLASSIFICATION)) {
      if (entry.verdict === 'disabled') {
        expect(['leaks', 'server', 'unverified'], `${path} reason`).toContain(entry.reason);
      }
    }
  });

  it('every cut entry carries reason off-wedge', () => {
    for (const [path, entry] of Object.entries(CLASSIFICATION)) {
      if (entry.verdict === 'cut') {
        expect(entry.reason, `${path} reason`).toBe('off-wedge');
      }
    }
  });

  it('no unverified or off-wedge page is live in the runtime registry', () => {
    for (const [path, entry] of Object.entries(CLASSIFICATION)) {
      if (entry.reason === 'unverified' || entry.reason === 'off-wedge') {
        expect(getFeatureStatus(path).status, path).not.toBe('live');
      }
    }
  });
});

describe('registryEntriesFromClassification', () => {
  it('omits live routes and maps non-live verdicts to { status, reason, note }', () => {
    const out = registryEntriesFromClassification();
    // No live/unlisted route should appear
    expect(out['/send']).toBeUndefined();
    // A seeded cut entry maps verdict -> status with reason + note
    expect(out['/leaderboard']).toMatchObject({ status: 'cut', reason: 'off-wedge' });
    expect(typeof out['/leaderboard'].note).toBe('string');
    // A seeded disabled entry maps through
    expect(out['/referrals']).toMatchObject({ status: 'disabled', reason: 'server' });
    // Non-live entries: 4 original seeds + 9 Overview-group pages classified in batch 1
    // + 5 Wallet-group pages classified in batch 2
    // + 7 Invest/Finance pages classified in batch 3
    // + 4 Assets-group pages classified in batch 4 (/nft-multichain, /spending, and /watchlist are live)
    // + 2 Security-group pages classified in batch A (/wallet-seed-qr, /hardware-wallet)
    //   (10 Security-A pages are live; only 2 are disabled)
    // + 5 Security-group pages classified in batch B (/anomaly-detection, /messenger-alerts,
    //     /fraud, /smart-alerts, /alerts)
    //   (5 Security-B pages are live: /biometric-auth, /voice-commands, /token-approvals,
    //     /spam-filter, /trust-score — /audit removed in the deniability hide)
    // + 5 Connect/Core pages classified in batch 5 (/watch-wallets, /solana, /price-charts,
    //     /web3, /products)
    //   (10 Connect/Core pages are live: /address-book, /live-balances, /network-manager,
    //     /gas-fees, /connect, /push, /settings, /docs, /features, /plans)
    expect(Object.keys(out).sort()).toEqual(
      [
        '/leaderboard', '/public-profiles', '/referrals', '/shared-portfolio',
        '/analytics', '/advanced-analytics', '/advisor', '/ai-assistant',
        '/benchmark', '/what-if', '/correlation', '/correlation-timeline',
        '/news-sentiment',
        // '/fee-analytics' reclassified disabled→live (Slice 1 native-unit rebuild), so it drops out here.
        // '/calculator' reclassified disabled→live (I2 opt-in gate added), so it drops out here.
        '/receipt', '/recurring', '/split-bill',
        '/portfolio-rewind', '/index-builder', '/ai-rebalancer',
        // '/pl' reclassified disabled→live (CURRENT_PRICES replaced with opt-in live feed), so it drops out here.
        // '/budget' reclassified disabled→live (USD_RATES replaced with opt-in useLivePrices), so it drops out here.
        '/tax',
        // '/watchlist' reclassified disabled→live (real opt-in price feeds), so it drops out here.
        '/nft', '/snapshots', '/onchain', '/erc20-discovery',
        '/wallet-seed-qr', '/hardware-wallet',
        // '/alerts' reclassified disabled→live (I2 opt-in gate added), so it drops out here.
        '/anomaly-detection', '/messenger-alerts', '/fraud', '/smart-alerts',
        '/watch-wallets', '/solana', '/price-charts', '/web3', '/products',
      ].sort(),
    );
  });
});

describe('registry is consistent with the audit', () => {
  it('every non-live verdict is reflected in the runtime registry status', () => {
    for (const [path, entry] of Object.entries(CLASSIFICATION)) {
      if (entry.verdict === 'live') continue;
      expect(getFeatureStatus(path).status, path).toBe(entry.verdict);
    }
  });
});
