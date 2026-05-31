import { useState, useEffect, lazy, Suspense, useCallback } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { usePriceAlertNotifier } from "../hooks/usePriceAlertNotifier";
import AccessibilityWrapper from "./AccessibilityWrapper";
import SafeSuspense from "./SafeSuspense";
import {
  LayoutDashboard, Send, Download, Settings, Shield, LogOut, ShieldCheck,
  ArrowDownUp, Plug, Building2, Bell, Calculator, BarChart2, Sliders, Zap,
  Receipt, MoreHorizontal, Repeat, ShieldAlert, ClipboardList, Globe, Image,
  BarChart3, Camera, TrendingUp, Network, PieChart, Sparkles, BellRing,
  CreditCard, Link2, BellDot, ShieldHalf, Shuffle, Users, DollarSign,
  Activity, Landmark, Sprout, Bot, Layers, GitMerge, Fingerprint, Cpu,
  MessageSquare, Leaf, Vote, ScrollText, Newspaper, Copy,
  Target, Banknote, FileText, Eye, Search, ChevronLeft, ChevronRight, X, ChevronDown,
  MapPin, QrCode, History, Briefcase, Scissors, ShieldQuestion, Lock, Grid2X2,
  Share2, Gift, Key, LayoutGrid, Fuel,
  TrendingDown, RotateCcw, RefreshCw, Smartphone, Mic, Trophy, Star, Users2, GitBranch,
  ShieldOff, Gauge, FilterX, KeyRound, Atom, ScanLine, Frame, Wifi, Pen,
  AtSign, Code2, Coins,
  CloudUpload, ArrowDownToLine, ArrowUpFromLine, Compass, LineChart, Palette, Hexagon, ScanSearch,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import CommandPalette from "./CommandPalette";
import PullToRefreshContainer from "./PullToRefreshContainer";
import { ErrorBoundary } from "./ErrorBoundary";
import VeyrnoxLogo from "./VeyrnoxLogo";
import { useQueryClient } from "@tanstack/react-query";

const DashboardPage     = lazy(() => import('../pages/Dashboard'));
const SendCryptoPage    = lazy(() => import('../pages/SendCrypto'));
const ReceiveCryptoPage = lazy(() => import('../pages/ReceiveCrypto'));
const SwapPage          = lazy(() => import('../pages/Swap'));
const TabSpinner = () => (
  <div className="flex justify-center items-center p-8" role="status" aria-label="Loading">
    <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    <span className="sr-only">Loading tab content...</span>
  </div>
);

// Each feature group gets its own accent colour so the menus read as
// colour-coded sections rather than one long undifferentiated list.
const GROUP_COLORS = {
  Overview: "#3b82f6", // blue
  Wallet:   "#8b5cf6", // violet
  Invest:   "#22c55e", // green
  Assets:   "#f59e0b", // amber
  Finance:  "#06b6d4", // cyan
  Security: "#ef4444", // red
  Connect:  "#ec4899", // pink
};
const groupColor = (label) => GROUP_COLORS[label] || "#8b5cf6";

const navGroups = [
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
      { path: "/trade-signals", label: "Trade Signals", icon: Star },
      { path: "/public-profiles", label: "Public Profile", icon: Users2 },
      { path: "/news-sentiment", label: "News Sentiment", icon: Newspaper },
    ],
  },
  {
    label: "Wallet",
    items: [
      { path: "/send", label: "Send", icon: Send },
      { path: "/receive", label: "Receive", icon: Download },
      { path: "/swap", label: "Swap", icon: ArrowDownUp },
      { path: "/dex", label: "DEX Swap", icon: Shuffle },
      { path: "/bridge", label: "Cross-Chain Bridge", icon: GitMerge },
      { path: "/payment-links", label: "Payment Links", icon: Link2 },
      { path: "/merchant-qr", label: "Merchant QR", icon: QrCode },
      { path: "/split-bill", label: "Split Bill", icon: Scissors },
      { path: "/receipt", label: "TX Receipts", icon: Receipt },
      { path: "/fee-analytics", label: "Fee Analytics", icon: Fuel },
      { path: "/tax-harvest", label: "Tax Harvesting", icon: TrendingDown },
      { path: "/subscriptions", label: "Subscriptions", icon: RefreshCw },
      { path: "/bank-link", label: "Bank Accounts", icon: Landmark },
      { path: "/conditional-swap", label: "Conditional Swap", icon: GitBranch },
      { path: "/hd-wallet", label: "HD Wallet Manager", icon: KeyRound },
      { path: "/crypto-signing", label: "Crypto Signing (Live)", icon: Pen },
      { path: "/live-fiat", label: "Fiat On-Ramp (Live)", icon: CreditCard },
      { path: "/webhook-builder", label: "Webhooks", icon: Zap },
      { path: "/recurring", label: "Recurring Payments", icon: Repeat },
      { path: "/fiat", label: "Fiat Ramp", icon: CreditCard },
      { path: "/perps", label: "Perps Trading", icon: Zap },
      { path: "/native-pay", label: "Apple / Google Pay", icon: CreditCard },
      { path: "/off-ramp", label: "Sell Crypto (Off-Ramp)", icon: ArrowUpFromLine },
      { path: "/cex-deposit", label: "Deposit from CEX", icon: ArrowDownToLine },
      { path: "/deploy-contract", label: "Deploy Contract", icon: Code2 },
      { path: "/fiat-wallets", label: "Fiat Wallets", icon: DollarSign },
      { path: "/calculator", label: "Convert", icon: Calculator },
    ],
  },
  {
    label: "Invest",
    items: [
      { path: "/staking", label: "Staking", icon: Zap },
      { path: "/portfolio-rewind", label: "Portfolio Rewind", icon: RotateCcw },
      { path: "/index-builder", label: "Custom Index", icon: LayoutGrid },
      { path: "/ai-rebalancer", label: "AI Rebalancer", icon: Sparkles },
      { path: "/dca", label: "DCA", icon: Repeat },
      { path: "/rebalance", label: "Rebalance", icon: Sliders },
      { path: "/lending", label: "Lending", icon: Landmark },
      { path: "/yield", label: "Yield Farming", icon: Sprout },
      { path: "/options", label: "Options", icon: BarChart3 },
      { path: "/pl", label: "P&L Tracking", icon: TrendingUp },
      { path: "/trading-bots", label: "Trading Bots", icon: Bot },
      { path: "/social-trading", label: "Social Trading", icon: Copy },
      { path: "/automation", label: "Automation", icon: Bot },
      { path: "/risk", label: "Risk Scoring", icon: ShieldCheck },
      { path: "/rebalancing-history", label: "Rebalance History", icon: History },
    ],
  },
  {
    label: "Assets",
    items: [
      { path: "/watchlist", label: "Watchlist", icon: Eye },
      { path: "/nft-gallery", label: "NFT Gallery", icon: Frame },
      { path: "/nft", label: "NFT Portfolio", icon: Image },
      { path: "/nft-multichain", label: "Multi-Chain NFT", icon: Layers },
      { path: "/spending", label: "Spending", icon: PieChart },
      { path: "/snapshots", label: "Snapshots", icon: Camera },
      { path: "/onchain", label: "On-Chain", icon: Network },
      { path: "/carbon", label: "Carbon Tracker", icon: Leaf },
      { path: "/erc20-discovery", label: "ERC-20 Discovery", icon: Coins },
      { path: "/tokenized-stocks", label: "Tokenized Stocks", icon: LineChart },
      { path: "/nft-minting", label: "NFT Minting Studio", icon: Palette },
    ],
  },
  {
    label: "Finance",
    items: [
      { path: "/payroll", label: "Crypto Payroll", icon: Briefcase },
      { path: "/savings", label: "Savings Goals", icon: Target },
      { path: "/budget", label: "Budget Limits", icon: PieChart },
      { path: "/loan-calculator", label: "Loan Calculator", icon: Calculator },
      { path: "/net-worth", label: "Net Worth", icon: TrendingUp },
      { path: "/loans", label: "Crypto Loans", icon: Banknote },
      { path: "/invoices", label: "Invoice Generator", icon: FileText },
      { path: "/tax", label: "Tax Report", icon: Receipt },
      { path: "/dao", label: "DAO Governance", icon: Vote },
      { path: "/will", label: "Crypto Will", icon: ScrollText },
      { path: "/community", label: "Community", icon: Users },
    ],
  },
  {
    label: "Security",
    items: [
      { path: "/security", label: "Security Center", icon: ShieldAlert },
      { path: "/login-map", label: "Login Activity Map", icon: MapPin },
      { path: "/session-manager", label: "Session Manager", icon: ShieldCheck },
      { path: "/duress-pin", label: "Duress PIN", icon: Lock },
      { path: "/address-checker", label: "Address Checker", icon: ShieldQuestion },
      { path: "/wallet-seed-qr", label: "Seed Key QR", icon: Key },
      { path: "/hardware-wallet", label: "Hardware Wallets", icon: Cpu },
      { path: "/samsung-keystore", label: "Samsung Keystore", icon: Smartphone },
      { path: "/cloud-backup", label: "Encrypted Cloud Backup", icon: CloudUpload },
      { path: "/dapp-alerts", label: "dApp Security Alerts", icon: ShieldAlert },
      { path: "/security-scanner", label: "Pre-Sign Scanner", icon: ScanSearch },
      { path: "/biometric-auth", label: "Biometric Auth", icon: Fingerprint },
      { path: "/anomaly-detection", label: "Anomaly Detection", icon: ShieldAlert },
      { path: "/messenger-alerts", label: "Messenger Alerts", icon: MessageSquare },
      { path: "/voice-commands", label: "Voice Commands", icon: Mic },
      { path: "/mobile-widget", label: "Mobile Widget", icon: Smartphone },
      { path: "/token-approvals", label: "Token Approvals", icon: ShieldOff },
      { path: "/spam-filter", label: "Spam Filter", icon: FilterX },
      { path: "/trust-score", label: "Token Trust Score", icon: ScanLine },
      { path: "/kyc", label: "Verification", icon: ShieldCheck },
      { path: "/audit", label: "Audit Log", icon: ClipboardList },
      { path: "/geo-blocking", label: "Geo-Blocking", icon: Globe },
      { path: "/fraud", label: "Fraud Detection", icon: ShieldAlert },
      { path: "/rasp", label: "RASP Security", icon: Cpu },
      { path: "/multisig", label: "Multi-Sig", icon: ShieldHalf },
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
      { path: "/dapp-connect", label: "dApp Connector", icon: Plug },
      { path: "/mobile-install", label: "Mobile Install (PWA)", icon: Smartphone },
      { path: "/network-manager", label: "Network Manager", icon: Network },
      { path: "/solana", label: "Solana / SPL", icon: Layers },
      { path: "/cosmos", label: "Cosmos / IBC", icon: Atom },
      { path: "/tron", label: "TRON / TRX", icon: Zap },
      { path: "/price-charts", label: "Price Charts", icon: BarChart3 },
      { path: "/gas-fees", label: "Gas Fees", icon: Gauge },
      { path: "/connect", label: "Connect Wallet", icon: Plug },
      { path: "/exchanges", label: "Exchanges", icon: Building2 },
      { path: "/walletconnect", label: "WalletConnect", icon: Link2 },
      { path: "/web3", label: "Web3 Browser", icon: Globe },
      { path: "/messaging", label: "Encrypted Messaging", icon: MessageSquare },
      { path: "/did", label: "Digital Identity", icon: Fingerprint },
      { path: "/account-access", label: "Account Access", icon: Users },
      { path: "/push", label: "Notifications", icon: BellDot },
      { path: "/ens-register", label: "ENS Registration", icon: AtSign },
      { path: "/web-bridge", label: "Web Bridge", icon: Wifi },
      { path: "/block-explorer", label: "Block Explorer", icon: Compass },
      { path: "/sui", label: "Sui Network", icon: Hexagon },
    ],
  },
];

const mobileBottomNav = [
  { path: "/", label: "Home", icon: LayoutDashboard },
  { path: "/send", label: "Send", icon: Send },
  { path: "/receive", label: "Receive", icon: Download },
  { path: "/swap", label: "Swap", icon: ArrowDownUp },
  { path: "/settings", label: "More", icon: MoreHorizontal },
];

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const ROOT_TABS = ['/', '/send', '/receive', '/swap', '/settings'];
  const isRootTab = ROOT_TABS.includes(location.pathname);
  const MOBILE_TABS = ['/', '/send', '/receive', '/swap'];
  const [mobileTab, setMobileTab] = useState(
    MOBILE_TABS.includes(location.pathname) ? location.pathname : '/'
  );
  const [cmdOpen, setCmdOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState({ Overview: true, Wallet: true });
  const toggleGroup = (label) => setOpenGroups(prev => ({ ...prev, [label]: !prev[label] }));

  useEffect(() => {
    if (MOBILE_TABS.includes(location.pathname)) {
      setMobileTab(location.pathname);
    }
  }, [location.pathname]);

  const handleMobileTabClick = useCallback((path) => {
    if (mobileTab === path && MOBILE_TABS.includes(location.pathname)) {
      const mainScroll = document.getElementById('main-scroll');
      if (mainScroll) {
        mainScroll.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } else {
      setMobileTab(path);
      navigate(path, { replace: true });
    }
  }, [mobileTab, location.pathname, navigate]);
  usePriceAlertNotifier();
  const queryClient = useQueryClient();
  const handleRefresh = async () => {
    await Promise.all([
      queryClient.refetchQueries({ queryKey: ["wallets"] }),
      queryClient.refetchQueries({ queryKey: ["transactions"] }),
    ]);
  };

  // Global ⌘K / Ctrl+K shortcut
  typeof window !== "undefined" && (window.onkeydown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setCmdOpen(true); }
  });

  return (
    <AccessibilityWrapper>
    <div className="app-shell flex flex-col md:flex-row md:min-h-screen bg-background">

      {/* ── Desktop Sidebar ── */}
      <aside className={`hidden md:flex md:min-h-screen bg-card border-r border-border flex-col shrink-0 transition-all duration-300 ${collapsed ? 'md:w-16' : 'md:w-60'}`}>

        {/* Logo + Search */}
        <div className="flex flex-col border-b border-border">
          <div className="flex items-center gap-3 px-4 py-4">
            <VeyrnoxLogo size={34} className="shadow-sm shrink-0" />
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <h1 className="text-sm font-bold tracking-tight">Veyrnox</h1>
                <p className="text-[9px] text-muted-foreground tracking-widest uppercase">Wallet</p>
              </div>
            )}
            <button
              onClick={() => setCollapsed(c => !c)}
              className="p-1 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          </div>
          {!collapsed && (
            <button
              onClick={() => setCmdOpen(true)}
              className="mx-3 mb-3 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-muted-foreground text-xs transition-colors"
            >
              <Search className="h-3.5 w-3.5" />
              <span className="flex-1 text-left">Search...</span>
              <kbd className="text-[9px] bg-background px-1 py-0.5 rounded">⌘K</kbd>
            </button>
          )}
          {collapsed && (
            <button
              onClick={() => setCmdOpen(true)}
              className="mx-auto mb-3 p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              title="Search (⌘K)"
            >
              <Search className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Nav Groups with Dropdowns */}
        <nav className="flex flex-col flex-1 overflow-y-auto px-2 py-2 gap-0">
          {navGroups.map((group) => (
            <div key={group.label} className="mb-1">
              {!collapsed && (
                <button
                  onClick={() => toggleGroup(group.label)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-[9px] font-bold uppercase tracking-widest hover:bg-secondary/50 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: groupColor(group.label) }} />
                    <span style={{ color: groupColor(group.label) }}>{group.label}</span>
                  </span>
                  <ChevronDown className={`h-3 w-3 text-muted-foreground/50 transition-transform ${openGroups[group.label] ? 'rotate-180' : ''}`} />
                </button>
              )}
              {collapsed && <div className="mt-2" />}
              {(!collapsed && openGroups[group.label]) && (
                <div className="space-y-0.5 mt-1">
                  {group.items.map((item) => {
                    const active = location.pathname === item.path;
                    const color = groupColor(group.label);
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        title={collapsed ? item.label : undefined}
                        className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-[13px] border transition-all duration-150 group ${collapsed ? 'justify-center' : ''} ${
                          active
                            ? "bg-primary text-primary-foreground font-semibold shadow-sm border-transparent"
                            : "text-foreground/80 hover:text-foreground"
                        }`}
                        style={active ? undefined : { background: color + "14", borderColor: color + "33" }}
                        onMouseEnter={active ? undefined : (e) => { e.currentTarget.style.background = color + "22"; }}
                        onMouseLeave={active ? undefined : (e) => { e.currentTarget.style.background = color + "14"; }}
                      >
                        <item.icon className={`h-3.5 w-3.5 shrink-0 ${active ? "text-primary-foreground" : "group-hover:text-foreground"}`} style={active ? undefined : { color }} />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          ))}

          {/* Settings */}
          <div className="mb-1">
            {!collapsed && <p className="px-3 pt-3 pb-1 text-[9px] font-bold text-muted-foreground/50 uppercase tracking-widest">Preferences</p>}
            {collapsed && <div className="mt-2" />}
            <Link
              to="/settings"
              title={collapsed ? "Settings" : undefined}
              className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-[13px] transition-all duration-150 group ${collapsed ? 'justify-center' : ''} ${
                location.pathname === "/settings"
                  ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
            >
              <Settings className="h-3.5 w-3.5 shrink-0" />
              {!collapsed && <span>Settings</span>}
            </Link>
          </div>
        </nav>

        {/* Sign Out */}
        <div className="px-2 pb-4 border-t border-border pt-2">
          <button
            onClick={() => base44.auth.logout()}
            title={collapsed ? "Sign Out" : undefined}
            className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-[13px] text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all w-full ${collapsed ? 'justify-center' : ''}`}
          >
            <LogOut className="h-3.5 w-3.5" />
            {!collapsed && "Sign Out"}
          </button>
        </div>
      </aside>

      {/* Command Palette */}
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />

      {/* ── Mobile Top Bar ── */}
      <header
        className="md:hidden flex items-center justify-between px-4 bg-card border-b border-border sticky top-0 z-30"
        style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top))", paddingBottom: "0.75rem" }}
      >
        <div className="flex items-center gap-2">
          {isRootTab ? (
            <>
              <VeyrnoxLogo size={30} className="shrink-0" />
              <span className="text-sm font-bold tracking-tight">Veyrnox</span>
            </>
          ) : (
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-1 -ml-1 pr-3 min-h-[44px] text-foreground active:opacity-60 transition-opacity select-none"
            >
              <ChevronLeft className="h-5 w-5" />
              <span className="text-sm font-semibold">Back</span>
            </button>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setCmdOpen(true)} className="p-2 rounded-lg text-muted-foreground active:bg-secondary transition-colors">
            <Search className="h-4 w-4" />
          </button>
          <Link to="/notifications" className="p-2 rounded-lg text-muted-foreground active:bg-secondary transition-colors">
            <Bell className="h-4 w-4" />
          </Link>
          <button onClick={() => base44.auth.logout()} className="p-2 rounded-lg text-muted-foreground active:bg-secondary transition-colors">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* ── Main Content — Desktop (unchanged Outlet + animation) ── */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.main
          key={location.pathname}
          initial={{ opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -8 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className="hidden md:flex md:flex-1 flex-col p-8 overflow-auto"
        >
          <PullToRefreshContainer onRefresh={handleRefresh} className="min-h-full">
            <ErrorBoundary key={location.pathname}><Outlet /></ErrorBoundary>
          </PullToRefreshContainer>
        </motion.main>
      </AnimatePresence>

      {/* ── Main Content — Mobile (all 4 root tabs stay mounted) ── */}
      <div id="main-scroll" className="md:hidden flex-1 min-h-0 overflow-auto overscroll-contain [-webkit-overflow-scrolling:touch] pb-28" role="region" aria-label="Main content">
        {/* Sub-pages: rendered via Outlet only when not on a root tab with slide transition */}
        <AnimatePresence mode="wait">
          {!MOBILE_TABS.includes(location.pathname) && (
            <motion.div
              key="subpage"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="p-4"
            >
              <PullToRefreshContainer onRefresh={handleRefresh} className="min-h-full">
                <ErrorBoundary key={location.pathname}><Outlet /></ErrorBoundary>
              </PullToRefreshContainer>
            </motion.div>
          )}
        </AnimatePresence>
        {/* Root tab pages — always mounted, toggled via hidden to preserve state */}
        <div
          id="tab-panel-0"
          role="tabpanel"
          aria-labelledby="tab-0"
          hidden={!MOBILE_TABS.includes(location.pathname) || mobileTab !== '/'}
          className="p-4"
        >
          <SafeSuspense fallback={<TabSpinner />}><DashboardPage /></SafeSuspense>
        </div>
        <div
          id="tab-panel-1"
          role="tabpanel"
          aria-labelledby="tab-1"
          hidden={!MOBILE_TABS.includes(location.pathname) || mobileTab !== '/send'}
          className="p-4"
        >
          <SafeSuspense fallback={<TabSpinner />}><SendCryptoPage /></SafeSuspense>
        </div>
        <div
          id="tab-panel-2"
          role="tabpanel"
          aria-labelledby="tab-2"
          hidden={!MOBILE_TABS.includes(location.pathname) || mobileTab !== '/receive'}
          className="p-4"
        >
          <SafeSuspense fallback={<TabSpinner />}><ReceiveCryptoPage /></SafeSuspense>
        </div>
        <div
          id="tab-panel-3"
          role="tabpanel"
          aria-labelledby="tab-3"
          hidden={!MOBILE_TABS.includes(location.pathname) || mobileTab !== '/swap'}
          className="p-4"
        >
          <SafeSuspense fallback={<TabSpinner />}><SwapPage /></SafeSuspense>
        </div>
      </div>

      {/* ── Mobile Bottom Navigation ── */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur border-t border-border flex items-stretch"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        role="navigation"
        aria-label="Bottom navigation"
      >
        {mobileBottomNav.slice(0, 4).map((item, index) => {
          const active = mobileTab === item.path;
          return (
            <button
              key={item.path}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`tab-panel-${index}`}
              tabIndex={active ? 0 : -1}
              onClick={() => handleMobileTabClick(item.path)}
              className={`flex flex-col items-center justify-center gap-1 py-3 flex-1 transition-colors active:bg-secondary select-none focus:outline-none focus:ring-2 focus:ring-primary focus:ring-inset ${
                active ? "text-primary" : "text-muted-foreground"
              }`}
              aria-label={item.label}
            >
              <item.icon className="h-5 w-5" aria-hidden="true" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </button>
          );
        })}
        <button
          onClick={() => setMoreOpen(true)}
          className="flex flex-col items-center justify-center gap-1 py-3 flex-1 text-muted-foreground active:bg-secondary transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-inset"
          aria-label="More features"
          aria-expanded={moreOpen}
        >
          <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
          <span className="text-[10px] font-medium">More</span>
        </button>
      </nav>

      {/* ── Mobile More Drawer ── */}
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col bg-background">
          <div className="flex items-center justify-between px-4 border-b border-border shrink-0" style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top))", paddingBottom: "0.75rem" }}>
            <span className="font-semibold">All Features</span>
            <button onClick={() => setMoreOpen(false)} className="p-2 rounded-lg hover:bg-secondary"><X className="h-5 w-5" /></button>
          </div>
          <div className="flex-1 min-h-0 overflow-auto overscroll-contain [-webkit-overflow-scrolling:touch] px-3 pt-3 space-y-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {navGroups.map(group => {
              const color = groupColor(group.label);
              return (
              <div key={group.label} className="rounded-2xl p-2.5" style={{ background: color + "0d", border: `1px solid ${color}22` }}>
                <div className="flex items-center gap-2 px-1 pb-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: color }} />
                  <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color }}>{group.label}</p>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {group.items.map(item => {
                    const active = location.pathname === item.path;
                    return (
                      <Link key={item.path} to={item.path} onClick={() => setMoreOpen(false)}
                        className="flex flex-col items-center gap-1 p-2 rounded-xl border transition-colors"
                        style={active
                          ? { background: color + "26", borderColor: color + "55", color }
                          : { background: color + "14", borderColor: color + "33", color }}
                        onMouseEnter={e => { if (!active) e.currentTarget.style.background = color + "22"; }}
                        onMouseLeave={e => { if (!active) e.currentTarget.style.background = color + "14"; }}
                      >
                        <item.icon className="h-5 w-5" />
                        <span className="text-[9px] font-medium text-center leading-tight line-clamp-2 text-foreground/80">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );})}
          </div>
        </div>
      )}
    </div>
    </AccessibilityWrapper>
  );
}