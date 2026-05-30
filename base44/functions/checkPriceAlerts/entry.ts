import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const CURRENCIES = ["BTC", "ETH", "SOL", "USDC", "USDT"];

async function fetchPrices() {
  const fsyms = CURRENCIES.join(",");
  const res = await fetch(
    `https://min-api.cryptocompare.com/data/pricemulti?fsyms=${fsyms}&tsyms=USD&extraParams=safecryptowallet`
  );
  const data = await res.json();
  const prices = {};
  for (const [coin, val] of Object.entries(data)) {
    prices[coin] = val.USD;
  }
  return prices;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Allow both authenticated calls and scheduled automation (service role)
    let client = base44;
    try {
      const user = await base44.auth.me();
      if (!user) client = base44.asServiceRole;
    } catch {
      client = base44.asServiceRole;
    }

    const prices = await fetchPrices();

    // Fetch all active alerts across all users (service role needed for automation)
    const alerts = await base44.asServiceRole.entities.PriceAlert.filter({ status: "active" });

    const triggered = [];
    for (const alert of alerts) {
      const currentPrice = prices[alert.currency];
      if (currentPrice == null) continue;

      const hit =
        (alert.direction === "above" && currentPrice >= alert.target_price) ||
        (alert.direction === "below" && currentPrice <= alert.target_price);

      if (hit) {
        await base44.asServiceRole.entities.PriceAlert.update(alert.id, {
          status: "triggered",
          triggered_at: new Date().toISOString(),
          triggered_price: currentPrice,
        });
        triggered.push({ id: alert.id, currency: alert.currency, price: currentPrice });
      }
    }

    return Response.json({
      success: true,
      checked: alerts.length,
      triggered: triggered.length,
      prices,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});