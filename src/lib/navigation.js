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
  LayoutDashboard, Send, Download, Settings, ShieldCheck, Plug, Bell, Calculator, BarChart2, Zap,
  Receipt, Repeat, ShieldAlert, Globe, Image,
  BarChart3, Camera, TrendingUp, Network, PieChart, Sparkles, BellRing, Link2, BellDot, Users,
  Activity, Bot, Layers, Fingerprint, Cpu,
  MessageSquare, Leaf, ScrollText, Newspaper,
  Target, FileText, Eye, BookOpen, Package,
  MapPin, QrCode, History, Scissors, ShieldQuestion, Lock, Grid2X2,
  Share2, Gift, Key, LayoutGrid, Fuel,
  TrendingDown, RotateCcw, Mic, Trophy, Users2,
  ShieldOff, Gauge, FilterX, KeyRound, ScanLine, Frame, Wifi, Pen,
  Coins,
  CloudUpload, Compass, ScanSearch, Ghost, Bomb,
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
      { path: "/advisor", label: "AI Advisor", icon: Sparkles },
      { path: "/ai-assistant", label: "AI Assistant", icon: Bot },
      { path: "/benchmark", label: "Benchmarking", icon: BarChart2 },
      { path: "/what-if", label: "What-If Simulator", icon: Calculator },
      { path: "/risk-score", label: "Risk Score", icon: ShieldQuestion },
      { path: "/correlation", label: "Correlation Matrix", icon: Grid2X2 },
      { path: "/correlation-timeline", label: "Event Timeline", icon: Newspaper },
      { path: "/dashboard-widgets", label: "Custom Widgets", icon: LayoutGrid },
      { path: "/shared-portfolio", label: "Share Portfolio", icon: Share2 },
      { path: "/referrals", label: "Referral Tracker", icon: Gift },
      { path: "/leaderboard", label: "Leaderboard", icon: Trophy },
      { path: "/public-profiles", label: "Public Profile", icon: Users2 },
      { path: "/news-sentiment", label: "News Sentiment", icon: Newspaper },
    ],
  },
  {
    label: "Wallet",
    items: [
      { path: "/send", label: "Send", icon: Send },
      { path: "/receive", label: "Receive", icon: Download },
      { path: "/tx-history", label: "Transaction History", icon: History },
      { path: "/payment-links", label: "Payment Links", icon: Link2 },
      { path: "/split-bill", label: "Split Bill", icon: Scissors },
      { path: "/receipt", label: "TX Receipts", icon: Receipt },
      { path: "/fee-analytics", label: "Fee Analytics", icon: Fuel },
      { path: "/tax-harvest", label: "Tax Harvesting", icon: TrendingDown },
      { path: "/hd-wallet", label: "HD Wallet Manager", icon: KeyRound },
      { path: "/crypto-signing", label: "Crypto Signing", icon: Pen },
      { path: "/recurring", label: "Recurring Payments", icon: Repeat },
      { path: "/calculator", label: "Convert", icon: Calculator },
    ],
  },
  {
    label: "Invest",
    items: [
      { path: "/portfolio-rewind", label: "Portfolio Rewind", icon: RotateCcw },
      { path: "/index-builder", label: "Custom Index", icon: LayoutGrid },
      { path: "/ai-rebalancer", label: "AI Rebalancer", icon: Sparkles },
      { path: "/pl", label: "P&L Tracking", icon: TrendingUp },
      { path: "/risk", label: "Risk Scoring", icon: ShieldCheck },
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
      { path: "/erc20-discovery", label: "ERC-20 Discovery", icon: Coins },
    ],
  },
  {
    label: "Finance",
    items: [
      { path: "/savings", label: "Savings Goals", icon: Target },
      { path: "/budget", label: "Budget Limits", icon: PieChart },
      { path: "/net-worth", label: "Net Worth", icon: TrendingUp },
      { path: "/invoices", label: "Invoice Generator", icon: FileText },
      { path: "/tax", label: "Tax Report", icon: Receipt },
    ],
  },
  {
    label: "Security",
    items: [
      { path: "/security-dashboard", label: "Security Dashboard", icon: ShieldCheck },
      { path: "/security", label: "Security Center", icon: ShieldAlert },
      { path: "/wallet-access", label: "Access & Recovery", icon: KeyRound },
      { path: "/session-manager", label: "Session Manager", icon: ShieldCheck },
      { path: "/duress-pin", label: "Duress PIN", icon: Lock },
      { path: "/stealth-wallets", label: "Stealth Wallets", icon: Ghost },
      { path: "/panic-wipe", label: "Panic Wipe", icon: Bomb },
      { path: "/address-checker", label: "Address Screening", icon: ShieldQuestion },
      { path: "/wallet-seed-qr", label: "Seed Key QR", icon: Key },
      { path: "/hardware-wallet", label: "Hardware Wallets", icon: Cpu },
      { path: "/dapp-alerts", label: "dApp Domain Check", icon: ShieldAlert },
      { path: "/security-scanner", label: "Pre-Sign Scanner", icon: ScanSearch },
      { path: "/biometric-auth", label: "Biometric Auth", icon: Fingerprint },
      { path: "/anomaly-detection", label: "Anomaly Detection", icon: ShieldAlert },
      { path: "/messenger-alerts", label: "Messenger Alerts", icon: MessageSquare },
      { path: "/voice-commands", label: "Voice Commands", icon: Mic },
      { path: "/token-approvals", label: "Token Approvals", icon: ShieldOff },
      { path: "/spam-filter", label: "Spam Filter", icon: FilterX },
      { path: "/trust-score", label: "Token Spam Screening", icon: ScanLine },
      { path: "/fraud", label: "Fraud Detection", icon: ShieldAlert },
      { path: "/smart-alerts", label: "Smart Alerts", icon: BellRing },
      { path: "/alerts", label: "Price Alerts", icon: Bell },
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
      { path: "/price-charts", label: "Price Charts", icon: BarChart3 },
      { path: "/gas-fees", label: "Gas Fees", icon: Gauge },
      { path: "/connect", label: "Connect Wallet", icon: Plug },
      { path: "/web3", label: "Web3 Browser", icon: Globe },
      { path: "/push", label: "Notifications", icon: BellDot },
    ],
  },
];

// Cut features (feature registry) are removed from nav + search entirely; the
// route also resolves to Not Found via FeatureGate. Disabled features stay
// visible here and render an honest notice when opened. Empty RAW_NAV_GROUPS groups are dropped.
export const navGroups = RAW_NAV_GROUPS
  .map((group) => ({ ...group, items: group.items.filter((item) => !isCut(item.path)) }))
  .filter((group) => group.items.length > 0);

// Top-level destinations that live OUTSIDE the sidebar feature groups — the
// sidebar renders Settings on its own, and Documentation hangs off the Help
// menu — but they should still be findable from search. Kept separate from
// navGroups so the sidebar/More drawer render exactly the 7 feature groups while
// search covers these too.
const EXTRA_ROUTES = [
  { path: "/settings", label: "Settings", icon: Settings, group: "Preferences" },
  { path: "/docs", label: "Documentation", icon: BookOpen, group: "Preferences" },
  { path: "/features", label: "Features", icon: LayoutGrid, group: "Preferences" },
  { path: "/products", label: "Products", icon: Package, group: "Preferences" },
];

// Flattened { path, label, group, icon } list for the command palette / search.
// Derived from navGroups (+ the top-level extras) so search ALWAYS covers the
// full current feature set rather than a stale hand-maintained subset.
export const searchableRoutes = [
  ...navGroups.flatMap((group) =>
    group.items.map((item) => ({ ...item, group: group.label })),
  ),
  ...EXTRA_ROUTES.filter((item) => !isCut(item.path)),
];
