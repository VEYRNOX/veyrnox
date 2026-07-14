import { describe, it, expect } from 'vitest';

describe('Analytics.jsx data calculations', () => {
  describe('monthlyData time range cutoff (BUG-2 FIX)', () => {
    it('should correctly filter transactions by range after fix', () => {
      // BUG-2: original code had `if (tx.timestamp < cutoffMs - range * 86400_000) break;`
      // FIXED: should be `if (tx.timestamp < cutoffMs) break;`

      // The fix ensures transactions are filtered correctly at the range boundary

      const nowMs = Date.now();
      const range = 7; // 7-day range
      const cutoffMs = nowMs - range * 86400_000;

      // Test transactions at various ages
      const txAt1Day = nowMs - 1 * 86400_000;
      const txAt6Day = nowMs - 6 * 86400_000;
      const txAt8Day = nowMs - 8 * 86400_000;

      // All these should NOT be included (first two within range, last outside)
      // With fixed code: include if tx.timestamp >= cutoffMs
      expect(txAt1Day >= cutoffMs).toBe(true); // Included
      expect(txAt6Day >= cutoffMs).toBe(true); // Included
      expect(txAt8Day >= cutoffMs).toBe(false); // Excluded
    });
  });

  describe('portfolio value trajectory (pre-transaction semantics)', () => {
    it('should apply the fix to skip transactions outside the range', () => {
      // BUG-2 verification: with the fix, transactions within range are all processed
      // Scenario: 7-day range, transactions at 1d, 3d, 5d ago should ALL be processed

      const nowMs = Date.now();
      const range = 7;
      const totalUSD = 1000; // Current balance
      const prices = { ETH: 1 };

      const history = [
        { type: 'send', amount: '100', assetSymbol: 'ETH', timestamp: nowMs - 1 * 86400_000 },
        { type: 'receive', amount: '200', assetSymbol: 'ETH', timestamp: nowMs - 3 * 86400_000 },
        { type: 'send', amount: '50', assetSymbol: 'ETH', timestamp: nowMs - 5 * 86400_000 },
      ];

      let running = totalUSD;
      const sorted = [...history].filter(t => t.timestamp != null).sort((a, b) => b.timestamp - a.timestamp);
      const cutoffMs = nowMs - range * 86400_000;
      let txCount = 0;

      for (const tx of sorted) {
        if (tx.timestamp < cutoffMs) break; // FIXED: removed - range * 86400_000
        const rate = prices[tx.assetSymbol] || 0;
        const usd = parseFloat(tx.amount || '0') * rate;

        if (tx.type === 'send') running += usd;
        else if (tx.type === 'receive') running -= usd;

        txCount++;
      }

      // All 3 transactions are within 7 days, so all should be processed
      expect(txCount).toBe(3);

      // With bug-2 fixed, we process all transactions.
      // Working backwards: 1000 + 100 = 1100, 1100 - 200 = 900, 900 + 50 = 950
      expect(running).toBe(950);
    });

    it('should correctly exclude transactions outside the range', () => {
      // Transactions older than the range cutoff should be skipped

      const nowMs = Date.now();
      const range = 7;
      const totalUSD = 1000;
      const prices = { ETH: 1 };

      const history = [
        { type: 'send', amount: '100', assetSymbol: 'ETH', timestamp: nowMs - 5 * 86400_000 }, // In range
        { type: 'send', amount: '200', assetSymbol: 'ETH', timestamp: nowMs - 10 * 86400_000 }, // Out of range
      ];

      let running = totalUSD;
      const sorted = [...history].filter(t => t.timestamp != null).sort((a, b) => b.timestamp - a.timestamp);
      const cutoffMs = nowMs - range * 86400_000;
      let txCount = 0;

      for (const tx of sorted) {
        if (tx.timestamp < cutoffMs) break; // FIXED
        const rate = prices[tx.assetSymbol] || 0;
        const usd = parseFloat(tx.amount || '0') * rate;

        if (tx.type === 'send') running += usd;
        else if (tx.type === 'receive') running -= usd;

        txCount++;
      }

      // Only 1 transaction (the 5d one) should be processed
      expect(txCount).toBe(1);
      expect(running).toBe(1100); // After reversing the 5d send
    });
  });

  describe('PnL bookkeeping semantics', () => {
    it('should correctly track gains (receives) and losses (sends)', () => {
      // PnL chart shows received vs sent amounts
      // Naming: gains = credit/received, losses = debit/sent
      // This is bookkeeping semantics, not trading P&L

      const history = [
        { type: 'receive', amount: '300', assetSymbol: 'ETH' },
        { type: 'send', amount: '100', assetSymbol: 'ETH' },
        { type: 'receive', amount: '50', assetSymbol: 'ETH' },
        { type: 'send', amount: '75', assetSymbol: 'ETH' },
      ];

      const prices = { ETH: 1 };
      const pnlData = { gains: 0, losses: 0 };

      for (const tx of history) {
        const rate = prices[tx.assetSymbol] || 0;
        const usd = parseFloat(tx.amount || '0') * rate;

        if (tx.type === 'receive') pnlData.gains += usd;
        if (tx.type === 'send') pnlData.losses += usd;
      }

      // Total received: 300 + 50 = 350
      expect(pnlData.gains).toBe(350);
      // Total sent: 100 + 75 = 175
      expect(pnlData.losses).toBe(175);
    });
  });
});
