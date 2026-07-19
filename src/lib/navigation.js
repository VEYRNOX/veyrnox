// lib/navigation.js — the SINGLE source of truth for the app's feature/page
// navigation.
//
// Both the sidebar / mobile "More" drawer (components/Layout.jsx) and the
// command palette / search (components/CommandPalette.jsx) consume this list, so
// they can never drift apart again. Previously the palette carried its OWN
// hand-maintained ~28-entry copy that had fallen far behind the ~90 real routes,
// so most features were unreachable from search. Sourcing both from here fixes
// that and keeps them in lockstep going forward.
//
// Each item is { path, label, icon }. Groups carry a `label` used for the
// section heading and the group accent colour. Adding a feature here adds it to
// BOTH the nav and search automatically.

import {
  LayoutDashboard, Send, Download, Settings, ShieldCheck, Plug, Calculator, BarChart2, Zap,
  Receipt, Repeat, ShieldAlert, Image,
  BarChart3, Camera, TrendingUp, Network, PieChart, BellRing, Link2, Users,
  Activity, Layers, Fingerprint, Cpu,
  Leaf, ScrollText, Newspaper,
  Target, Eye, BookOpen,
  MapPin, QrCode, History, ShieldQuestion, Lock, Grid2X2,
  Gift, Key, LayoutGrid, Fuel,
  RotateCcw, Mic,
  ShieldOff, Gauge, KeyRound, ScanLine, Frame, Wifi, Pen,
  CloudUpload, Compass, ScanSearch, Ghost, Bomb, Scissors,
  CreditCard,
} from "lucide-react";
import { isCut } from './featureRegistry';

// Brand teal is the primary accent (active destination). Each feature group also
// carries a SUBTLE secondary hue, used only as a low-intensity tint/border in the
// "More" drawer so the sections are easy to tell apart — never as loud fills. The
// palette is drawn from the design-system semantic colours (info / teal / amber /
// coral) plus a few harmonious neighbours, so it reads calm, not casino.
export const GROUP_ACCENT = "#4ADAC2";
export const GROUP_COLORS = {
  Overview: "#6FA8FF", // info blue
  Wallet:   "#4ADAC2", // brand teal
  Invest:   "#5FD08A", // green
  Assets:   "#E7B14C", // amber
  Finance:  "#56C7D8", // cyan
  Security: "#F06A5A", // coral
  Connect:  "#B98CF0", // violet
  Preferences: "#8FA0B5", // slate
};
export const groupColor = (label) => GROUP_COLORS[label] || GROUP_ACCENT;

const RAW_NAV_GROUPS = [
  {
    label: "Overview",
    items: [
      { path: "/", label: "Dashboard", icon: LayoutDashboard },
      { path: "/notifications", label: "Notifications", icon: BellRing },
      { path: "/analytics", label: "Analytics", icon: BarChart2 },
      { path: "/advanced-analytics", label: "Advanced Analytics", icon: Activity },
      { path: "/risk-score", label: "Risk Score", icon: ShieldQuestion },
      { path: "/correlation", label: "Correlation Matrix", icon: Grid2X2 },
      { path: "/correlation-timeline", label: "Event Timeline", icon: Newspaper },
      { path: "/dashboard-widgets", label: "Custom Widgets", icon: LayoutGrid },
      { path: "/referrals", label: "Referral Tracker", icon: Gift },
      { path: "/news-sentiment", label: "News Sentiment", icon: Newspaper },
    ],
  },
  {
    label: "Wallet",
    items: [
      { path: "/hd-wallet", label: "Wallet Manager", icon: Layers, keywords: "hd wallet manager add new create account seed" },
      { path: "/send", label: "Send", icon: Send, keywords: "bitcoin btc ethereum eth usdc usdt matic polygon arbitrum arb optimism op avalanche avax bnb binance solana sol transfer crypto" },
      { path: "/receive", label: "Receive", icon: Download, keywords: "bitcoin btc ethereum eth usdc usdt matic polygon arbitrum arb optimism op avalanche avax bnb binance solana sol deposit crypto" },
      { path: "/tx-history", label: "Transaction History", icon: History, keywords: "bitcoin btc ethereum eth transactions history activity" },
      { path: "/split-bill", label: "Split Bill", icon: Scissors },
      { path: "/receipt", label: "TX Receipts", icon: Receipt },
      { path: "/fee-analytics", label: "Fee Analytics", icon: Fuel },
      { path: "/crypto-signing", label: "Crypto Signing", icon: Pen },
      { path: "/recurring", label: "Recurring Payments", icon: Repeat },
      { path: "/calculator", label: "Convert", icon: Calculator },
    ],
  },
  {
    label: "Invest",
    items: [
      { path: "/price-charts", label: "Price Charts", icon: BarChart3 },
      { path: "/alerts", label: "Price Alerts", icon: BellRing },
      { path: "/portfolio-rewind", label: "Portfolio Rewind", icon: RotateCcw },
    ],
  },
  {
    label: "Assets",
    items: [
      { path: "/watchlist", label: "Watchlist", icon: Eye },
      { path: "/nft", label: "NFT Portfolio", icon: Image },
      { path: "/nft-multichain", label: "Multi-Chain NFT", icon: Layers },
      { path: "/spending", label: "Spending", icon: PieChart },
      { path: "/snapshots", label: "Snapshots", icon: Camera },
      { path: "/onchain", label: "On-Chain", icon: Network },
    ],
  },
  {
    label: "Finance",
    items: [
      { path: "/savings", label: "Savings Goals", icon: Target },
      { path: "/budget", label: "Budget Limits", icon: PieChart },
      { path: "/net-worth", label: "Net Worth", icon: TrendingUp },
    ],
  },
  {
    label: "Security",
    items: [
      { path: "/security-dashboard", label: "Security Dashboard", icon: ShieldCheck },
      { path: "/security", label: "Security Center", icon: ShieldAlert },
      { path: "/wallet-access", label: "Access & Recovery", icon: KeyRound },
      { path: "/session-manager", label: "Session Manager", icon: ShieldCheck },
      { path: "/login-activity", label: "Login Activity", icon: Activity },
      { path: "/duress-pin", label: "Duress PIN", icon: Lock },
      { path: "/stealth-wallets", label: "Stealth Wallets", icon: Ghost },
      { path: "/panic-wipe", label: "Panic Wipe", icon: Bomb },
      { path: "/address-checker", label: "Address Screening", icon: ShieldQuestion },
      { path: "/wallet-seed-qr", label: "Seed Key QR", icon: Key },
      { path: "/hardware-wallet", label: "Hardware Wallets", icon: Cpu },
      { path: "/personal-backup", label: "Personal Backup", icon: CloudUpload },
      { path: "/dapp-alerts", label: "dApp Domain Check", icon: ShieldAlert },
      { path: "/security-scanner", label: "Pre-Sign Scanner", icon: ScanSearch },
      { path: "/biometric-auth", label: "Biometric Auth", icon: Fingerprint },
      { path: "/anomaly-detection", label: "Anomaly Detection", icon: ShieldAlert },
      { path: "/rasp-security", label: "RASP Security", icon: Cpu },
      { path: "/voice-commands", label: "Voice Commands", icon: Mic },
      { path: "/token-approvals", label: "Token Approvals", icon: ShieldOff },
      { path: "/trust-score", label: "Token Spam Screening", icon: ScanLine },
      { path: "/fraud", label: "Fraud Detection", icon: ShieldAlert },
    ],
  },
  {
    label: "Connect",
    items: [
      { path: "/address-book", label: "Address Book", icon: Users },
      { path: "/watch-wallets", label: "Watch Wallets", icon: Eye },
      { path: "/live-balances", label: "Live Balances (RPC)", icon: Wifi },
      { path: "/network-manager", label: "Network Manager", icon: Network },
      { path: "/solana", label: "Solana / SPL", icon: Layers },
      { path: "/gas-fees", label: "Gas Fees", icon: Gauge },
      { path: "/walletconnect", label: "dApp Connector", icon: Link2 },
      { path: "/connect", label: "Connect Wallet", icon: Plug },
    ],
  },
  {
    label: "Preferences",
    items: [
      { path: "/settings", label: "Settings", icon: Settings },
      { path: "/plans", label: "Subscriptions", icon: CreditCard },
      { path: "/docs", label: "Documentation", icon: BookOpen },
      { path: "/features", label: "Features", icon: LayoutGrid },
    ],
  },
];

// Cut features (feature registry) are removed from nav + search entirely; the
// route also resolves to Not Found via FeatureGate. Disabled features stay
// visible here and render an honest notice when opened. Empty RAW_NAV_GROUPS groups are dropped.
export const navGroups = RAW_NAV_GROUPS
  .map((group) => ({ ...group, items: group.items.filter((item) => !isCut(item.path)) }))
  .filter((group) => group.items.length > 0);

// Flattened { path, label, group, icon } list for the command palette / search.
// Derived from navGroups so search ALWAYS covers the full current feature set
// rather than a stale hand-maintained subset.
export const searchableRoutes = navGroups.flatMap((group) =>
  group.items.map((item) => ({ ...item, group: group.label })),
);
