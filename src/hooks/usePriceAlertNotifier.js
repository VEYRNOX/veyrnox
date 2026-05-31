import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

const PRICE_URL = "https://min-api.cryptocompare.com/data/pricemulti?fsyms=BTC,ETH,USDT,BNB,SOL,USDC,XRP,DOGE,ADA,TRX&tsyms=USD&extraParams=safecryptowallet";

function sendNotification(title, body, icon = "/favicon.ico") {
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, icon, badge: "/favicon.ico" });
  } catch {}
}

export function usePriceAlertNotifier() {
  const queryClient = useQueryClient();
  const prevPricesRef = useRef({});
  const notifiedRef   = useRef(new Set()); // track already-notified alert IDs

  // ── 1. Real-time subscription: fire notification when alert status → "triggered" ──
  useEffect(() => {
    const unsub = base44.entities.PriceAlert.subscribe((event) => {
      if (event.type === "update" && event.data?.status === "triggered") {
        const alert = event.data;
        if (notifiedRef.current.has(alert.id)) return;
        notifiedRef.current.add(alert.id);

        const price = alert.triggered_price
          ? `$${alert.triggered_price.toLocaleString()}`
          : "your target";

        sendNotification(
          `🔔 ${alert.currency} Price Alert Triggered!`,
          `${alert.currency} hit ${price} (target: ${alert.direction} $${alert.target_price?.toLocaleString()})${alert.note ? " · " + alert.note : ""}`,
        );

        // Invalidate so Dashboard + PriceAlerts pages refresh
        queryClient.invalidateQueries({ queryKey: ["price-alerts"] });
        queryClient.invalidateQueries({ queryKey: ["price-alerts-triggered"] });
      }
    });
    return unsub;
  }, [queryClient]);

  // ── 2. Volatility polling: fire notification when price swings ≥ threshold ──
  useEffect(() => {
    let active = true;

    const pollVolatility = async () => {
      try {
        const res = await fetch(PRICE_URL);
        const raw = await res.json();
        const current = {};
        for (const [coin, val] of Object.entries(raw)) current[coin] = val.USD;

        const prev = prevPricesRef.current;

        if (Object.keys(prev).length > 0) {
          // Fetch active volatility alerts
          const alerts = await base44.entities.PriceAlert.filter({ status: "active" });
          for (const alert of alerts) {
            if (!alert.volatility_pct || !alert.volatility_pct > 0) continue;
            const c = alert.currency;
            if (!prev[c] || !current[c]) continue;
            const swingPct = Math.abs(((current[c] - prev[c]) / prev[c]) * 100);
            if (swingPct >= alert.volatility_pct) {
              const direction = current[c] > prev[c] ? "📈 up" : "📉 down";
              sendNotification(
                `⚡ ${c} Volatility Alert!`,
                `${c} moved ${direction} ${swingPct.toFixed(2)}% in the last interval (threshold: ${alert.volatility_pct}%)`,
              );
              // Mark alert as triggered
              await base44.entities.PriceAlert.update(alert.id, {
                status: "triggered",
                triggered_at: new Date().toISOString(),
                triggered_price: current[c],
              });
              queryClient.invalidateQueries({ queryKey: ["price-alerts"] });
              queryClient.invalidateQueries({ queryKey: ["price-alerts-triggered"] });
            }
          }
        }

        prevPricesRef.current = current;
      } catch {}
    };

    // Poll every 60 seconds
    pollVolatility();
    const interval = setInterval(() => { if (active) pollVolatility(); }, 60_000);
    return () => { active = false; clearInterval(interval); };
  }, [queryClient]);
}