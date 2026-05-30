import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const USD_RATES = { BTC: 68000, ETH: 3200, SOL: 165, USDC: 1, USDT: 1 };

function getNextRunAt(frequency, from = new Date()) {
  const d = new Date(from);
  if (frequency === "daily")     d.setDate(d.getDate() + 1);
  else if (frequency === "weekly")   d.setDate(d.getDate() + 7);
  else if (frequency === "biweekly") d.setDate(d.getDate() + 14);
  else if (frequency === "monthly")  d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const now = new Date();

    // Fetch all active DCA schedules for this user
    const schedules = await base44.entities.DCASchedule.filter({ status: "active" });
    const due = schedules.filter(s => {
      if (!s.next_run_at) return true; // never run yet
      return new Date(s.next_run_at) <= now;
    });

    const results = [];

    for (const schedule of due) {
      // Get funding wallet
      const fundingWallet = await base44.entities.Wallet.get(schedule.funding_wallet_id);
      if (!fundingWallet) {
        results.push({ id: schedule.id, error: "Funding wallet not found" });
        continue;
      }

      // Check sufficient balance
      if ((fundingWallet.balance || 0) < schedule.amount_per_run) {
        results.push({ id: schedule.id, error: "Insufficient balance", skipped: true });
        continue;
      }

      // Calculate how much target currency we get
      const fromUSD = (USD_RATES[schedule.funding_currency] || 1) * schedule.amount_per_run;
      const toAmount = fromUSD / (USD_RATES[schedule.target_currency] || 1);

      // Deduct from funding wallet
      await base44.entities.Wallet.update(schedule.funding_wallet_id, {
        balance: (fundingWallet.balance || 0) - schedule.amount_per_run,
      });

      // Credit target wallet if provided, otherwise just log
      if (schedule.target_wallet_id) {
        const targetWallet = await base44.entities.Wallet.get(schedule.target_wallet_id);
        if (targetWallet) {
          await base44.entities.Wallet.update(schedule.target_wallet_id, {
            balance: (targetWallet.balance || 0) + toAmount,
          });
        }
      }

      // Record transaction
      const txHash = "0x" + Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
      await base44.entities.Transaction.create({
        wallet_id: schedule.funding_wallet_id,
        type: "swap",
        amount: schedule.amount_per_run,
        currency: schedule.funding_currency,
        status: "confirmed",
        tx_hash: txHash,
        note: `DCA: ${schedule.amount_per_run} ${schedule.funding_currency} → ${toAmount.toFixed(6)} ${schedule.target_currency} (${schedule.label || schedule.frequency})`,
      });

      // Update schedule stats
      await base44.entities.DCASchedule.update(schedule.id, {
        last_run_at: now.toISOString(),
        next_run_at: getNextRunAt(schedule.frequency, now),
        total_invested: (schedule.total_invested || 0) + schedule.amount_per_run,
        total_runs: (schedule.total_runs || 0) + 1,
      });

      results.push({ id: schedule.id, success: true, bought: toAmount, currency: schedule.target_currency });
    }

    return Response.json({ executed: results.filter(r => r.success).length, skipped: results.filter(r => r.skipped).length, results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});