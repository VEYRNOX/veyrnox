import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const USD_RATES = { BTC: 68000, ETH: 3200, SOL: 165, USDC: 1, USDT: 1 };

// Estimate gas cost in USD for a trade
function estimateGasCost(currency) {
  if (currency === 'ETH') return 3.5;
  if (currency === 'BTC') return 5.0;
  if (currency === 'SOL') return 0.01;
  return 0.5; // stablecoins
}

// Batch trades: skip trades smaller than gas cost threshold (not worth it)
function filterGasEfficientTrades(trades) {
  return trades.filter(t => {
    const gasCost = estimateGasCost(t.currency);
    const gasRatio = gasCost / Math.abs(t.deltaUSD);
    // Skip if gas > 2% of trade value
    return gasRatio < 0.02;
  }).sort((a, b) => Math.abs(b.deltaUSD) - Math.abs(a.deltaUSD)); // largest first = fewer txs
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Check auth — allow both user-triggered and scheduled (service role)
    let userId = null;
    try {
      const user = await base44.auth.me();
      userId = user?.id;
    } catch {}

    // Fetch all configs (service role for scheduled runs)
    const configs = await base44.asServiceRole.entities.RebalancingConfig.filter({
      monitoring_enabled: true,
    });

    const results = [];

    for (const config of configs) {
      if (!config.allocations || Object.keys(config.allocations).length === 0) continue;

      // Fetch wallets for this config owner
      const wallets = await base44.asServiceRole.entities.Wallet.filter({
        created_by_id: config.created_by_id,
      });

      // Aggregate holdings
      const holdings = {};
      for (const w of wallets) {
        holdings[w.currency] = (holdings[w.currency] || 0) + (w.balance || 0);
      }

      const totalUSD = Object.entries(holdings).reduce(
        (s, [c, b]) => s + b * (USD_RATES[c] || 1), 0
      );

      if (totalUSD === 0) continue;

      const targets = config.allocations;
      const driftThreshold = config.drift_threshold || 5;

      // Calculate drifts
      const drifts = [];
      const trades = [];

      for (const [currency, targetPct] of Object.entries(targets)) {
        const currentUSD = (holdings[currency] || 0) * (USD_RATES[currency] || 1);
        const currentPct = (currentUSD / totalUSD) * 100;
        const drift = currentPct - targetPct;
        const targetUSD = (totalUSD * targetPct) / 100;
        const deltaUSD = targetUSD - currentUSD;
        const deltaCrypto = deltaUSD / (USD_RATES[currency] || 1);

        if (Math.abs(drift) > driftThreshold) {
          drifts.push({ currency, currentPct, targetPct, drift });
        }

        if (Math.abs(deltaUSD) > 1) {
          trades.push({ currency, currentPct, targetPct, deltaUSD, deltaCrypto, drift });
        }
      }

      if (drifts.length === 0) {
        await base44.asServiceRole.entities.RebalancingConfig.update(config.id, {
          last_checked_at: new Date().toISOString(),
        });
        results.push({ config_id: config.id, status: 'balanced', drifts: 0 });
        continue;
      }

      // Gas-optimised trade list
      const efficientTrades = filterGasEfficientTrades(trades);
      const totalGasSaved = trades.length - efficientTrades.length;

      // Build alert email body
      const driftLines = drifts
        .map(d => `  • ${d.currency}: currently ${d.currentPct.toFixed(1)}% (target ${d.targetPct}%, drift ${d.drift > 0 ? '+' : ''}${d.drift.toFixed(1)}%)`)
        .join('\n');

      const tradeLines = efficientTrades
        .map(t => {
          const action = t.deltaUSD > 0 ? 'BUY' : 'SELL';
          const absUSD = Math.abs(t.deltaUSD).toFixed(2);
          const absCrypto = Math.abs(t.deltaCrypto).toFixed(4);
          return `  • ${action} ${absCrypto} ${t.currency} ≈ $${absUSD}`;
        })
        .join('\n');

      const emailBody = `
Your SafeCrypto portfolio has drifted from your target allocations.

DRIFTED ASSETS (>${driftThreshold}% drift):
${driftLines}

RECOMMENDED TRADES (gas-optimised${totalGasSaved > 0 ? `, ${totalGasSaved} micro-trade${totalGasSaved > 1 ? 's' : ''} skipped to save gas` : ''}):
${tradeLines}

Total portfolio value: $${totalUSD.toLocaleString(undefined, { maximumFractionDigits: 2 })}

Open SafeCrypto Wallet to execute these trades.
      `.trim();

      // Send alert email if configured and not alerted recently (24h cooldown)
      const lastAlert = config.last_alert_at ? new Date(config.last_alert_at) : null;
      const hoursSinceAlert = lastAlert ? (Date.now() - lastAlert.getTime()) / 3600000 : 999;

      if (config.alert_email && hoursSinceAlert >= 24) {
        await base44.integrations.Core.SendEmail({
          to: config.alert_email,
          subject: `⚠️ Portfolio Drift Alert — ${drifts.length} asset${drifts.length > 1 ? 's' : ''} need rebalancing`,
          body: emailBody,
        });

        await base44.asServiceRole.entities.RebalancingConfig.update(config.id, {
          last_checked_at: new Date().toISOString(),
          last_alert_at: new Date().toISOString(),
        });
      } else {
        await base44.asServiceRole.entities.RebalancingConfig.update(config.id, {
          last_checked_at: new Date().toISOString(),
        });
      }

      results.push({
        config_id: config.id,
        status: 'drifted',
        drifts: drifts.length,
        efficient_trades: efficientTrades.length,
        gas_saves: totalGasSaved,
      });
    }

    return Response.json({ checked: configs.length, results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});