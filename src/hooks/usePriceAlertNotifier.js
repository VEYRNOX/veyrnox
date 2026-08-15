import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { fetchMarketPricesUsdCG as fetchMarketPricesUsd } from "@/lib/coinGecko.js";
import { useWallet } from "@/lib/WalletProvider";
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { DEMO } from "@/api/demoClient";

let _localNotifId = 1;
// Codex P2 2026-08-16: track every scheduled notification so lock/panic-wipe
// can dismiss the tray. Prior behaviour left notifications sitting in the
// OS notification centre after lock — a coercer reading the tray after a
// panic-wipe could still see "BTC hit $X (note: rent money)" tying the
// wiped device to real wallet activity.
const _scheduledNativeIds = new Set();       // Capacitor LocalNotifications ids
const _scheduledWebNotifications = new Set(); // Notification handles for close()

async function sendNotification(title, body, deepLink = "/") {
  if (Capacitor.isNativePlatform()) {
    try {
      const id = _localNotifId++;
      await LocalNotifications.schedule({
        notifications: [{ title, body, id, extra: { deepLink } }],
      });
      _scheduledNativeIds.add(id);
    } catch (e) {
      console.warn('[priceAlertNotifier] native schedule failed:', e);
    }
    return;
  }
  // Web: tap the notification to focus the tab and navigate to deepLink.
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    const n = new Notification(title, { body, icon: "/favicon.ico", badge: "/favicon.ico" });
    _scheduledWebNotifications.add(n);
    n.onclose = () => _scheduledWebNotifications.delete(n);
    n.onclick = (e) => {
      e.preventDefault();
      window.focus();
      window.location.href = deepLink;
    };
  } catch (e) {
    console.warn('[priceAlertNotifier] web notification failed:', e);
  }
}

// Codex P2 2026-08-16: dismiss every pending / delivered alert notification.
// Called on APP_LOCK_EVENT (WalletProvider.lock dispatches it — see the
// listener at the end of this file). Native path uses LocalNotifications
// cancel+removeDeliveredNotifications to sweep both scheduled AND
// already-in-tray items; web calls Notification.close() on tracked handles.
async function dismissAllScheduledNotifications() {
  if (Capacitor.isNativePlatform()) {
    try {
      const ids = Array.from(_scheduledNativeIds);
      if (ids.length > 0) {
        await LocalNotifications.cancel({ notifications: ids.map((id) => ({ id })) });
      }
      // Sweep anything delivered to the tray, including ids we may have lost
      // across a hot reload — best-effort, ignore if the plugin lacks it.
      if (typeof LocalNotifications.removeAllDeliveredNotifications === 'function') {
        await LocalNotifications.removeAllDeliveredNotifications();
      }
    } catch (e) {
      console.warn('[priceAlertNotifier] native dismiss failed:', e);
    } finally {
      _scheduledNativeIds.clear();
    }
    return;
  }
  for (const n of _scheduledWebNotifications) {
    try { n.close(); } catch { /* noop */ }
  }
  _scheduledWebNotifications.clear();
}

// Install the lock-event listener ONCE per module load (module-scope guard
// prevents duplicate handlers under HMR). APP_LOCK_EVENT is fired by
// WalletProvider.lock() for every lock path (panic, duress, idle,
// background, session ceiling) — one chokepoint covers them all.
if (typeof window !== 'undefined' && !window.__veyrnoxPriceAlertLockHook) {
  window.__veyrnoxPriceAlertLockHook = true;
  window.addEventListener('veyrnox:app-lock', () => {
    void dismissAllScheduledNotifications();
  });
}

export function usePriceAlertNotifier() {
  const queryClient = useQueryClient();
  // I3 (deniability): the local entity store is shared across wallet sets, so a
  // decoy/duress (or locked) session must NOT subscribe/poll/notify — otherwise it
  // would fire OS notifications about the REAL session's price alerts (incl. the
  // user-authored note). DEMO is also gated (I2: no coingecko egress on the demo
  // tour, no fake alerts). Mirrors the gate in notify/useReceiveDetector.js.
  const { isUnlocked, isDecoy, isHidden } = useWallet();
  const prevPricesRef = useRef({});
  const notifiedRef   = useRef(new Set()); // track already-notified alert IDs

  // ── 1. Real-time subscription: fire notification when alert status → "triggered" ──
  useEffect(() => {
    if (!isUnlocked || isDecoy || isHidden || DEMO) return; // I3: no real-set alerts in deniability mode / when locked / in demo
    const unsub = base44.entities.PriceAlert?.subscribe?.((event) => {
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
  }, [queryClient, isUnlocked, isDecoy, isHidden]);

  // ── 2. In-app polling: fire notification when a price-target is hit or a ──
  //       price swings ≥ a volatility threshold. This is the on-device
  //       replacement for the old `checkPriceAlerts` server cron: it runs every
  //       60s WHILE THE APP IS OPEN against the same cryptocompare feed (no new
  //       endpoint). Background-while-closed firing would need a push server,
  //       which this local build doesn't ship.
  useEffect(() => {
    if (!isUnlocked || isDecoy || isHidden || DEMO) return; // I3: no polling/notifications in deniability mode / when locked / in demo
    let active = true;

    const triggerAlert = async (alert, price) => {
      await base44.entities.PriceAlert.update(alert.id, {
        status: "triggered",
        triggered_at: new Date().toISOString(),
        triggered_price: price,
      });
      queryClient.invalidateQueries({ queryKey: ["price-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["price-alerts-triggered"] });
    };

    const pollAlerts = async () => {
      try {
        // Local-first: read the active alerts (local IndexedDB) BEFORE any
        // network call. No active alerts ⇒ nothing to evaluate ⇒ NO price
        // egress (I2: no third-party heartbeat for a user who set no alerts).
        const alerts = await base44.entities.PriceAlert.filter({ status: "active" });
        if (alerts.length === 0) return;

        const current = await fetchMarketPricesUsd(); // { [coin]: usdNumber }, fixed MARKET_SYMBOLS
        const prev = prevPricesRef.current;

        for (const alert of alerts) {
          const c = alert.currency;
          if (current[c] == null) continue;

          // Volatility alert: needs a previous sample to measure a swing.
          if (alert.alert_type === "volatility" || alert.volatility_pct > 0) {
            if (!prev[c]) continue;
            const swingPct = Math.abs(((current[c] - prev[c]) / prev[c]) * 100);
            if (swingPct >= alert.volatility_pct) {
              const direction = current[c] > prev[c] ? "📈 up" : "📉 down";
              sendNotification(
                `⚡ ${c} Volatility Alert!`,
                `${c} moved ${direction} ${swingPct.toFixed(2)}% in the last interval (threshold: ${alert.volatility_pct}%)`,
              );
              await triggerAlert(alert, current[c]);
            }
            continue;
          }

          // Price-target alert: evaluable on every poll (no previous sample
          // needed). This is what the server cron used to do.
          if (alert.target_price == null) continue;
          const hit =
            (alert.direction === "above" && current[c] >= alert.target_price) ||
            (alert.direction === "below" && current[c] <= alert.target_price);
          if (hit) {
            sendNotification(
              `🔔 ${c} Price Alert Triggered!`,
              `${c} hit $${current[c].toLocaleString()} (target: ${alert.direction} $${alert.target_price?.toLocaleString()})${alert.note ? " · " + alert.note : ""}`,
            );
            await triggerAlert(alert, current[c]);
          }
        }

        prevPricesRef.current = current;
      } catch (e) {
        console.warn('[priceAlertNotifier] pollAlerts failed:', e);
      }
    };

    // Poll every 60 seconds
    pollAlerts();
    const interval = setInterval(() => { if (active) pollAlerts(); }, 60_000);
    return () => { active = false; clearInterval(interval); };
  }, [queryClient, isUnlocked, isDecoy, isHidden]);
}