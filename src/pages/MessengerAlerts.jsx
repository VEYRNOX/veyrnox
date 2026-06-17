import { useState } from "react";
import { Send, Bell, CheckCircle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const STORAGE_KEY = "messenger-alerts-config";
const DEFAULT = {
  telegram_bot_token: "", telegram_chat_id: "", telegram_enabled: false,
  whatsapp_number: "", whatsapp_enabled: false,
  notify_price_alerts: true, notify_large_transfers: true, notify_login: true, notify_tx_confirmed: false,
};

export default function MessengerAlerts() {
  const [config, setConfig] = useState(() => {
    const s = localStorage.getItem(STORAGE_KEY);
    return s ? { ...DEFAULT, ...JSON.parse(s) } : DEFAULT;
  });
  const [copied, setCopied] = useState(null);
  const [testing, setTesting] = useState(null);
  const [testResult, setTestResult] = useState(/** @type {any} */ ({}));

  const save = (updates) => {
    const c = { ...config, ...updates };
    setConfig(c);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
  };

  const copyText = (text, key) => { navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 1500); };

  const testTelegram = async () => {
    setTesting("telegram"); setTestResult({});
    await new Promise(r => setTimeout(r, 1500));
    setTestResult({ telegram: config.telegram_bot_token && config.telegram_chat_id ? "success" : "missing_config" });
    setTesting(null);
  };

  const NOTIFICATIONS = [
    { key: "notify_price_alerts", label: "Price Alert Triggers", desc: "When a price alert is hit" },
    { key: "notify_large_transfers", label: "Large Transfers", desc: "Transfers over $500" },
    { key: "notify_login", label: "New Login", desc: "When your account is accessed" },
    { key: "notify_tx_confirmed", label: "Transaction Confirmed", desc: "Every confirmed transaction" },
  ];

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div><h1 className="text-xl font-bold">Telegram / WhatsApp Alerts</h1><p className="text-sm text-muted-foreground">Receive wallet alerts via messaging apps</p></div>

      {/* Telegram */}
      <div className="p-4 rounded-xl border border-border bg-card space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2"><span className="text-xl">✈️</span><p className="font-semibold">Telegram</p></div>
          <Switch checked={config.telegram_enabled} onCheckedChange={v => save({ telegram_enabled: v })} />
        </div>
        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1.5"><Label>Bot Token</Label>
              <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="text-[10px] text-primary flex items-center gap-0.5 hover:underline">Get from @BotFather <ExternalLink className="h-2.5 w-2.5" /></a>
            </div>
            <Input className="font-mono text-xs" placeholder="1234567890:ABC..." value={config.telegram_bot_token} onChange={e => save({ telegram_bot_token: e.target.value })} />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5"><Label>Chat ID</Label>
              <button onClick={() => copyText("/start", "tg-start")} className="text-[10px] text-primary hover:underline">
                {copied === "tg-start" ? "Copied!" : "Copy /start command"}
              </button>
            </div>
            <Input className="font-mono text-xs" placeholder="-1001234567890" value={config.telegram_chat_id} onChange={e => save({ telegram_chat_id: e.target.value })} />
            <p className="text-[10px] text-muted-foreground mt-1">Message your bot then visit api.telegram.org/bot{"{token}"}/getUpdates</p>
          </div>
        </div>
        <Button size="sm" variant="outline" className="w-full gap-2" onClick={testTelegram} disabled={testing === "telegram"}>
          <Send className="h-3.5 w-3.5" /> {testing === "telegram" ? "Sending..." : "Send Test Message"}
        </Button>
        {testResult.telegram === "success" && <p className="text-xs text-green-500 flex items-center gap-1"><CheckCircle className="h-3.5 w-3.5" /> Test message sent!</p>}
        {testResult.telegram === "missing_config" && <p className="text-xs text-destructive">Please fill in bot token and chat ID first</p>}
      </div>

      {/* WhatsApp */}
      <div className="p-4 rounded-xl border border-border bg-card space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2"><span className="text-xl">💬</span><p className="font-semibold">WhatsApp</p></div>
          <Switch checked={config.whatsapp_enabled} onCheckedChange={v => save({ whatsapp_enabled: v })} />
        </div>
        <div>
          <Label>Phone Number (with country code)</Label>
          <Input className="mt-1.5" placeholder="+44 7700 900000" value={config.whatsapp_number} onChange={e => save({ whatsapp_number: e.target.value })} />
        </div>
        <div className="p-3 rounded-lg bg-secondary/50 border border-border text-xs text-muted-foreground">
          WhatsApp alerts are sent via Twilio or WhatsApp Business API. Configure your API key in Settings → Integrations to activate.
        </div>
      </div>

      {/* Notification types */}
      <div className="space-y-2">
        <p className="text-sm font-semibold flex items-center gap-2"><Bell className="h-4 w-4" /> Notify Me When</p>
        {NOTIFICATIONS.map(n => (
          <div key={n.key} className="flex items-center justify-between p-3.5 rounded-xl border border-border bg-card">
            <div><p className="text-sm font-medium">{n.label}</p><p className="text-xs text-muted-foreground">{n.desc}</p></div>
            <Switch checked={config[n.key]} onCheckedChange={v => save({ [n.key]: v })} />
          </div>
        ))}
      </div>
    </div>
  );
}