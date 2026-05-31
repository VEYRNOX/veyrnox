import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Smartphone, CheckCircle, Copy, Check } from "lucide-react";

const USD_RATES = { BTC: 68000, ETH: 3200, USDT: 1, BNB: 590, SOL: 165, USDC: 1, XRP: 0.52, DOGE: 0.16, ADA: 0.45, TRX: 0.13 };

const steps = {
  ios: [
    { step: 1, title: "Open this app in Safari", detail: "Must be Safari — Chrome does not support Add to Home Screen" },
    { step: 2, title: "Tap the Share button", detail: "The box-with-arrow icon at the bottom of Safari" },
    { step: 3, title: "Select 'Add to Home Screen'", detail: "Scroll down in the share sheet to find this option" },
    { step: 4, title: "Tap 'Add'", detail: "The app icon will appear on your home screen like a native app" },
    { step: 5, title: "Long press the icon → Add Widget", detail: "On iOS 16+, long press the home screen → + button → Web Clip" },
  ],
  android: [
    { step: 1, title: "Open this app in Chrome", detail: "Chrome on Android supports installing Progressive Web Apps" },
    { step: 2, title: "Tap the 3-dot menu", detail: "Top right of Chrome browser" },
    { step: 3, title: "Select 'Add to Home Screen'", detail: "Or 'Install App' if the banner appears at the bottom" },
    { step: 4, title: "Confirm Install", detail: "Tap 'Install' in the prompt dialog" },
    { step: 5, title: "Pin widget to screen", detail: "Long press the app icon → Widget → select size" },
  ],
};

export default function MobileWidgetPage() {
  const [platform, setPlatform] = useState("ios");
  const [copied, setCopied] = useState(false);

  const { data: wallets = [] } = useQuery({ queryKey: ["wallets"], queryFn: () => base44.entities.Wallet.list() });
  const totalUSD = wallets.reduce((s, w) => s + (w.balance || 0) * (USD_RATES[w.currency] || 1), 0);

  const copyUrl = () => { navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div><h1 className="text-xl font-bold">Mobile Widget</h1><p className="text-sm text-muted-foreground">Install Veyrnox as a native app with home screen widget</p></div>

      {/* Widget preview */}
      <div className="flex justify-center">
        <div className="w-36 h-36 rounded-3xl bg-gradient-to-br from-primary/80 to-primary shadow-2xl flex flex-col items-center justify-center text-white p-4">
          <p className="text-[10px] font-medium opacity-80">Portfolio</p>
          <p className="text-xl font-bold mt-1">${totalUSD > 1000 ? (totalUSD / 1000).toFixed(1) + "k" : totalUSD.toFixed(0)}</p>
          <p className="text-[10px] opacity-70 mt-1">{wallets.length} wallets</p>
          <div className="flex gap-1 mt-2">
            <div className="h-1 w-8 rounded bg-white/30" />
            <div className="h-1 w-4 rounded bg-white/50" />
            <div className="h-1 w-6 rounded bg-white/30" />
          </div>
        </div>
      </div>

      {/* Platform toggle */}
      <div className="flex rounded-xl border border-border p-1 bg-secondary/30">
        {["ios", "android"].map(p => (
          <button key={p} onClick={() => setPlatform(p)} className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors capitalize ${platform === p ? "bg-card shadow text-foreground" : "text-muted-foreground"}`}>{p === "ios" ? "📱 iOS" : "🤖 Android"}</button>
        ))}
      </div>

      {/* Steps */}
      <div className="space-y-3">
        {steps[platform].map(s => (
          <div key={s.step} className="flex items-start gap-3 p-4 rounded-xl border border-border bg-card">
            <div className="h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">{s.step}</div>
            <div><p className="text-sm font-medium">{s.title}</p><p className="text-xs text-muted-foreground mt-0.5">{s.detail}</p></div>
          </div>
        ))}
      </div>

      {/* Share link */}
      <div className="p-4 rounded-xl border border-border bg-card">
        <p className="text-sm font-semibold mb-2">Share App URL</p>
        <div className="flex items-center gap-2 bg-secondary rounded-lg p-2.5">
          <span className="flex-1 text-xs font-mono text-muted-foreground truncate">{window.location.origin}</span>
          <button onClick={copyUrl} className="shrink-0 p-1 hover:text-foreground text-muted-foreground">
            {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="p-3 rounded-xl bg-secondary/30 border border-border">
        <p className="text-xs font-semibold mb-1 flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-green-500" /> PWA Features</p>
        <ul className="text-xs text-muted-foreground space-y-0.5">
          <li>✓ Works offline for viewing balances</li>
          <li>✓ Push notifications (if enabled)</li>
          <li>✓ Full screen native-like experience</li>
          <li>✓ No app store download needed</li>
        </ul>
      </div>
    </div>
  );
}