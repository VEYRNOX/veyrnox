import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Send, Download, ArrowDownUp, Zap, Receipt, Sliders, Bell,
  ShieldAlert, BarChart2, Sparkles, CreditCard, Landmark, Sprout, Bot, Leaf,
  Vote, ScrollText, Newspaper, GitMerge, Link2, MessageSquare, Fingerprint,
  Cpu, Users, ShieldCheck, PieChart, TrendingUp, Image, Camera, Network,
  Activity, DollarSign, Shuffle, Layers, ClipboardList, Globe, BarChart3,
  Repeat, Building2, Plug, BellRing, BellDot, ShieldHalf, Copy, Settings,
  Target, Banknote, FileText, Eye,
} from "lucide-react";

const ALL_ROUTES = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard, group: "Overview" },
  { path: "/analytics", label: "Analytics", icon: BarChart2, group: "Overview" },
  { path: "/advanced-analytics", label: "Advanced Analytics", icon: Activity, group: "Overview" },
  { path: "/advisor", label: "AI Advisor", icon: Sparkles, group: "Overview" },
  { path: "/news-sentiment", label: "News Sentiment", icon: Newspaper, group: "Overview" },
  { path: "/notifications", label: "Notification Centre", icon: BellRing, group: "Overview" },
  { path: "/send", label: "Send Crypto", icon: Send, group: "Wallet" },
  { path: "/receive", label: "Receive Crypto", icon: Download, group: "Wallet" },
  { path: "/payment-links", label: "Payment Links", icon: Link2, group: "Wallet" },
  { path: "/recurring", label: "Recurring Payments", icon: Repeat, group: "Wallet" },
  { path: "/calculator", label: "Convert", icon: BarChart3, group: "Wallet" },
  { path: "/rebalance", label: "Rebalance", icon: Sliders, group: "Invest" },
  { path: "/pl", label: "P&L Tracking", icon: TrendingUp, group: "Invest" },
  { path: "/risk", label: "Risk Scoring", icon: ShieldCheck, group: "Invest" },
  { path: "/savings", label: "Savings Goals", icon: Target, group: "Finance" },
  { path: "/invoices", label: "Invoice Generator", icon: FileText, group: "Finance" },
  { path: "/tax", label: "Tax Report", icon: Receipt, group: "Finance" },
  { path: "/will", label: "Crypto Will", icon: ScrollText, group: "Finance" },
  { path: "/nft", label: "NFT Portfolio", icon: Image, group: "Assets" },
  { path: "/watchlist", label: "Watchlist", icon: Eye, group: "Assets" },
  { path: "/spending", label: "Spending", icon: PieChart, group: "Assets" },
  { path: "/snapshots", label: "Snapshots", icon: Camera, group: "Assets" },
  { path: "/onchain", label: "On-Chain", icon: Network, group: "Assets" },
  { path: "/carbon", label: "Carbon Tracker", icon: Leaf, group: "Assets" },
  { path: "/security", label: "Security Center", icon: ShieldAlert, group: "Security" },
  { path: "/audit", label: "Audit Log", icon: ClipboardList, group: "Security" },
  { path: "/fraud", label: "Fraud Detection", icon: ShieldAlert, group: "Security" },
  { path: "/rasp", label: "RASP Security", icon: Cpu, group: "Security" },
  { path: "/multisig", label: "Multi-Sig Wallets", icon: ShieldHalf, group: "Security" },
  { path: "/alerts", label: "Price Alerts", icon: Bell, group: "Security" },
  { path: "/settings", label: "Settings", icon: Settings, group: "Preferences" },
];

export default function CommandPalette({ open, onClose }) {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [selected, setSelected] = useState(0);

  const results = query.trim()
    ? ALL_ROUTES.filter(r =>
        r.label.toLowerCase().includes(query.toLowerCase()) ||
        r.group.toLowerCase().includes(query.toLowerCase())
      )
    : ALL_ROUTES.slice(0, 8);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    setSelected(0);
  }, [query]);

  function handleKeyDown(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelected(s => Math.min(s + 1, results.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
    if (e.key === "Enter" && results[selected]) { navigate(results[selected].path); onClose(); }
    if (e.key === "Escape") onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center" style={{ paddingTop: "calc(2rem + env(safe-area-inset-top))" }} onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg mx-4 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <svg className="h-4 w-4 text-muted-foreground shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search features, pages..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto py-2">
          {results.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">No results</p>
          ) : (
            results.map((r, i) => {
              const Icon = r.icon;
              return (
                <button
                  key={r.path}
                  onClick={() => { navigate(r.path); onClose(); }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    i === selected ? "bg-primary/10 text-primary" : "hover:bg-secondary text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="text-sm flex-1">{r.label}</span>
                  <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">{r.group}</span>
                </button>
              );
            })
          )}
        </div>

        <div className="px-4 py-2 border-t border-border flex items-center gap-3 text-[10px] text-muted-foreground">
          <span>↑↓ navigate</span>
          <span>↵ select</span>
          <span>ESC close</span>
        </div>
      </div>
    </div>
  );
}