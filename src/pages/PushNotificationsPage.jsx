import { useState, useEffect } from "react";
import { Bell, CheckCircle2, AlertTriangle, TestTube2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

const NOTIFICATION_TYPES = [
  { key: "price_alerts", label: "Price Alerts", desc: "Notify when price targets are hit" },
  { key: "transaction_confirmed", label: "Transaction Confirmed", desc: "Notify when a tx is confirmed" },
  { key: "low_balance", label: "Low Balance Warning", desc: "Notify when wallet balance is low" },
  { key: "staking_rewards", label: "Staking Rewards", desc: "Notify when rewards are available" },
  { key: "security_events", label: "Security Events", desc: "Login attempts and suspicious activity" },
  { key: "dca_execution", label: "DCA Execution", desc: "Notify when DCA purchases run" },
  { key: "rebalancing", label: "Rebalancing Drift", desc: "Notify when portfolio drifts" },
  { key: "smart_alerts", label: "Smart Alerts", desc: "Custom portfolio event notifications" },
];

export default function PushNotificationsPage() {
  const [permission, setPermission] = useState(typeof Notification !== "undefined" ? Notification.permission : "default");
  const [requesting, setRequesting] = useState(false);
  const [prefs, setPrefs] = useState(() => Object.fromEntries(NOTIFICATION_TYPES.map(t => [t.key, true])));

  useEffect(() => {
    // Load saved prefs from localStorage
    const saved = localStorage.getItem("notification_prefs");
    if (saved) { try { setPrefs(JSON.parse(saved)); } catch {} }
  }, []);

  const savePrefs = (newPrefs) => {
    setPrefs(newPrefs);
    localStorage.setItem("notification_prefs", JSON.stringify(newPrefs));
    toast.success("Preferences saved");
  };

  const requestPermission = async () => {
    if (typeof Notification === "undefined") { toast.error("Push notifications not supported in this browser"); return; }
    setRequesting(true);
    const result = await Notification.requestPermission();
    setPermission(result);
    setRequesting(false);
    if (result === "granted") toast.success("Push notifications enabled!");
    else if (result === "denied") toast.error("Notifications blocked. Please enable in browser settings.");
  };

  const sendTestNotification = () => {
    if (permission !== "granted") { toast.error("Enable notifications first"); return; }
    new Notification("VEYRNOX Test", {
      body: "Push notifications are working correctly! 🎉",
      icon: "/favicon.ico",
    });
    toast.success("Test notification sent");
  };

  const isSupported = typeof Notification !== "undefined";
  const isGranted = permission === "granted";
  const isDenied = permission === "denied";

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Push Notifications</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Stay informed about your portfolio activity</p>
      </div>

      {/* Status banner */}
      <div className={`p-4 rounded-xl border flex items-start gap-3 ${!isSupported ? "border-border bg-card" : isGranted ? "border-success/30 bg-success/5" : isDenied ? "border-destructive/30 bg-destructive/5" : "border-border bg-card"}`}>
        {!isSupported ? <AlertTriangle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
          : isGranted ? <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />
          : isDenied ? <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          : <Bell className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />}
        <div className="flex-1">
          <p className="text-sm font-semibold">
            {!isSupported ? "Notifications Not Available"
              : isGranted ? "Notifications Enabled"
              : isDenied ? "Notifications Blocked"
              : "Notifications Not Enabled"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {!isSupported
              ? "Push notifications aren't supported in this app or browser on this device."
              : isGranted ? "You'll receive push notifications for your selected events."
              : isDenied ? "Notifications are blocked by your browser. Go to site settings and allow notifications to re-enable."
              : "Enable push notifications to stay informed about your wallet activity."}
          </p>
        </div>
        {!isGranted && !isDenied && isSupported && (
          <Button size="sm" onClick={requestPermission} disabled={requesting}>
            {requesting ? "Requesting…" : "Enable"}
          </Button>
        )}
      </div>

      {/* Notification types */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground uppercase tracking-widest">Notification Types</p>
          {isGranted && (
            <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs" onClick={sendTestNotification}>
              <TestTube2 className="h-3.5 w-3.5" /> Test
            </Button>
          )}
        </div>
        <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
          {NOTIFICATION_TYPES.map(t => (
            <div key={t.key} className="px-4 py-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{t.label}</p>
                <p className="text-xs text-muted-foreground">{t.desc}</p>
              </div>
              <Switch
                checked={prefs[t.key] ?? true}
                disabled={!isGranted}
                onCheckedChange={v => savePrefs({ ...prefs, [t.key]: v })}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Info card */}
      <div className="p-4 rounded-xl border border-border bg-card space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">How it works</p>
        <ul className="space-y-1.5">
          {[
            "Notifications appear even when VEYRNOX is in the background",
            "Your notification preferences are saved locally on this device",
            "You can revoke permissions at any time in your browser settings",
            "No personal data is shared with third-party notification services",
          ].map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0 mt-0.5" />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}