import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ShieldAlert, Eye, EyeOff, CheckCircle, Trash2, Plus, Filter } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const STORAGE_KEY = "spam-filter-config";
const DEFAULT_CONFIG = {
  hide_zero_balance: true,
  hide_dust_below_usd: 1,
  hide_unknown_tokens: false,
  auto_hide_airdrops: true,
};

const MOCK_TOKENS = [
  { id: "s1", symbol: "SHIB2", name: "Shiba Inu V2 (fake)", balance: 1000000, value_usd: 0.0001, flagged: true, reason: "Known scam airdrop" },
  { id: "s2", symbol: "FREE", name: "FreeToken Airdrop", balance: 50000, value_usd: 0.0, flagged: true, reason: "Zero-value airdrop" },
  { id: "s3", symbol: "DUST", name: "Unknown Token", balance: 0.000001, value_usd: 0.001, flagged: true, reason: "Dust amount" },
  { id: "s4", symbol: "UNI", name: "Uniswap", balance: 0.0001, value_usd: 0.0009, flagged: false, reason: "Dust balance" },
];

export default function SpamTokenFilter() {
  const [config, setConfig] = useState(() => {
    const s = localStorage.getItem(STORAGE_KEY);
    return s ? { ...DEFAULT_CONFIG, ...JSON.parse(s) } : DEFAULT_CONFIG;
  });
  const [customBlocked, setCustomBlocked] = useState(() => {
    const s = localStorage.getItem("custom-blocked-tokens");
    return s ? JSON.parse(s) : [];
  });
  const [newToken, setNewToken] = useState("");

  const save = (updates) => {
    const c = { ...config, ...updates };
    setConfig(c);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
  };

  const addBlock = () => {
    if (!newToken.trim()) return;
    const list = [...customBlocked, newToken.trim().toUpperCase()];
    setCustomBlocked(list);
    localStorage.setItem("custom-blocked-tokens", JSON.stringify(list));
    setNewToken("");
  };

  const removeBlock = (t) => {
    const list = customBlocked.filter(b => b !== t);
    setCustomBlocked(list);
    localStorage.setItem("custom-blocked-tokens", JSON.stringify(list));
  };

  const RULES = [
    { key: "hide_zero_balance", label: "Hide zero-balance tokens", desc: "Tokens with 0 balance are hidden from the wallet view" },
    { key: "auto_hide_airdrops", label: "Auto-hide suspicious airdrops", desc: "Tokens airdropped without interaction are flagged and hidden" },
    { key: "hide_unknown_tokens", label: "Hide unverified tokens", desc: "Only show tokens from verified contract lists (e.g. CoinGecko)" },
  ];

  const flaggedCount = MOCK_TOKENS.filter(t => t.flagged).length;

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><Filter className="h-5 w-5 text-primary" /> Token Spam Filter</h1>
        <p className="text-sm text-muted-foreground">Hide dust, scam tokens, and unsolicited airdrops</p>
      </div>

      <div className="p-4 rounded-xl border border-yellow-500/30 bg-yellow-500/5 flex items-start gap-3">
        <ShieldAlert className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold">{flaggedCount} suspicious tokens detected</p>
          <p className="text-xs text-muted-foreground mt-0.5">These tokens have been flagged as potential scams or worthless airdrops.</p>
        </div>
      </div>

      {/* Filter rules */}
      <div className="space-y-2">
        <p className="text-sm font-semibold">Filter Rules</p>
        {RULES.map(r => (
          <div key={r.key} className="flex items-center justify-between p-4 rounded-xl border border-border bg-card">
            <div><p className="text-sm font-medium">{r.label}</p><p className="text-xs text-muted-foreground">{r.desc}</p></div>
            <Switch checked={config[r.key]} onCheckedChange={v => save({ [r.key]: v })} />
          </div>
        ))}
        <div className="p-4 rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-sm font-medium">Hide dust below</p>
              <p className="text-xs text-muted-foreground">Hide tokens worth less than this USD amount</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-sm">$</span>
            <Input type="number" min="0" step="0.1" value={config.hide_dust_below_usd} onChange={e => save({ hide_dust_below_usd: parseFloat(e.target.value) || 0 })} className="w-24" />
          </div>
        </div>
      </div>

      {/* Detected spam */}
      <div>
        <p className="text-sm font-semibold mb-2">Detected Spam Tokens</p>
        <div className="space-y-2">
          {MOCK_TOKENS.filter(t => t.flagged).map(t => (
            <div key={t.id} className="flex items-center justify-between p-3 rounded-xl border border-border bg-card">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-destructive/10 text-destructive flex items-center justify-center text-xs font-bold">{t.symbol.slice(0, 2)}</div>
                <div>
                  <p className="text-sm font-medium">{t.symbol} <span className="text-xs text-muted-foreground font-normal">({t.name})</span></p>
                  <p className="text-[10px] text-destructive">{t.reason}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">${t.value_usd.toFixed(4)}</span>
                {config.auto_hide_airdrops || config.hide_zero_balance ? (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Custom blocklist */}
      <div>
        <p className="text-sm font-semibold mb-2">Custom Blocked Tokens</p>
        <div className="flex gap-2 mb-3">
          <Input placeholder="Token symbol e.g. SCAMTOKEN" value={newToken} onChange={e => setNewToken(e.target.value)} onKeyDown={e => e.key === "Enter" && addBlock()} />
          <Button onClick={addBlock} disabled={!newToken.trim()} className="gap-1"><Plus className="h-4 w-4" /> Block</Button>
        </div>
        {customBlocked.length === 0 ? (
          <p className="text-xs text-muted-foreground">No custom blocks added</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {customBlocked.map(t => (
              <div key={t} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-destructive/10 text-destructive text-xs font-semibold border border-destructive/20">
                {t}
                <button onClick={() => removeBlock(t)} className="hover:opacity-70"><Trash2 className="h-3 w-3" /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}