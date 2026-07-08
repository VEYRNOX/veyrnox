import { useState, useEffect, lazy, useCallback } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { usePriceAlertNotifier } from "../hooks/usePriceAlertNotifier";
import AccessibilityWrapper from "./AccessibilityWrapper";
import SafeSuspense from "./SafeSuspense";
import HelpMenu from "./HelpMenu";
import {
  LayoutDashboard, Send, Download, Settings, LogOut, Search,
  MoreHorizontal, ChevronLeft, ChevronRight, X, ChevronDown,
} from "lucide-react";
import { base44, WALLET_GATE } from "@/api/base44Client";
import { useWallet } from "@/lib/WalletProvider";
import CommandPalette from "./CommandPalette";
import BackButton from "./BackButton";
import SessionRevocationGuard from "./SessionRevocationGuard";
import PullToRefreshContainer from "./PullToRefreshContainer";
import { ErrorBoundary } from "./ErrorBoundary";
import FeatureGate from './FeatureGate';
import VeyrnoxLogo, { VeyrnoxWordmark } from "./VeyrnoxLogo";
import { navGroups, groupColor } from "@/lib/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useNotifications } from "@/notify/useNotifications";
import NotificationToast from "./NotificationToast";
import NotificationBell from "./NotificationBell";
import { useReceiveDetector } from "@/notify/useReceiveDetector";

const DashboardPage     = lazy(() => import('../pages/Dashboard'));
const SendCryptoPage    = lazy(() => import('../pages/SendCrypto'));
const ReceiveCryptoPage = lazy(() => import('../pages/ReceiveCrypto'));
const TabSpinner = () => (
  <div className="flex justify-center items-center p-8" role="status" aria-label="Loading">
    <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    <span className="sr-only">Loading tab content...</span>
  </div>
);

// navGroups + groupColor now live in lib/navigation.js — the single source of
// truth shared with the command palette / search so the two can't drift.

// Viewport gate for the main-content region (Tailwind `md` = 768px). The desktop
// `<main>` (Outlet) and the mobile content (tab panels + sub-page Outlet) were both
// kept in the tree and merely toggled with `hidden md:flex` / `md:hidden` CSS — so
// React MOUNTED BOTH, double-mounting EVERY page (two SendCrypto forms, two preview
// widgets, double RPC/queries/effects). This hook lets us render exactly ONE of the
// two regions, so each page mounts once. It tracks the SAME 768px breakpoint as the
// CSS, so the JS gate and the responsive classes never disagree. No SSR here (Vite
// SPA), so the initial value is correct on first paint — no flash, no double mount.
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(
    () => (typeof window !== "undefined" ? window.matchMedia("(min-width: 768px)").matches : true)
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const handler = (e) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isDesktop;
}

const mobileBottomNav = [
  { path: "/", label: "Home", icon: LayoutDashboard },
  { path: "/send", label: "Send", icon: Send },
  { path: "/receive", label: "Receive", icon: Download },
];

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { lock } = useWallet();
  // Sign out / Exit (base44 removal, Phase 2). In the local build there is no
  // hosted account to log out of — exiting means locking the on-device vault,
  // which the WalletGate then enforces (the unlock front door reappears). We
  // ALWAYS lock first (drops the in-memory secret) and then reset the route so
  // the user lands cleanly on the gate rather than on a now-locked deep page:
  //   - gated (local build OR any native build): navigate to "/" → a locked
  //             vault renders WalletEntry (unlock). A native app must ALWAYS
  //             land on the in-app gate here, never the /landing marketing page.
  //   - web demo: there is no on-device gate, so call the (no-op) hosted logout
  //             and return to the public landing screen so Exit still does
  //             something visible instead of silently no-op'ing.
  const signOut = () => {
    lock();
    if (WALLET_GATE) {
      navigate("/", { replace: true });
    } else {
      base44.auth.logout();
      navigate("/landing", { replace: true });
    }
  };
  const ROOT_TABS = ['/', '/send', '/receive', '/settings'];
  const isRootTab = ROOT_TABS.includes(location.pathname);
  // Render the desktop OR the mobile main-content region — never both — so a page
  // mounts exactly once (see useIsDesktop). The nav chrome (sidebar / top bar /
  // bottom nav) stays CSS-toggled; only the heavy page-hosting regions are gated.
  const isDesktop = useIsDesktop();
  const MOBILE_TABS = ['/', '/send', '/receive'];
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
    } else {
      const mainScroll = document.getElementById('main-scroll');
      if (mainScroll) mainScroll.scrollTop = 0;
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
  useReceiveDetector(); // PR-275: fires emitReceiveDetected on positive active-set balance delta (I3/I4).
  // In-app Notifications v1 (brief PR-2 §3). ONE hook instance for the whole
  // authenticated shell: the toast (latest) and the bell badge (unseenCount) read
  // the same session-scoped queue. Mounted inside WalletGate, so it unmounts and
  // wipes on lock/reload — never hydrated from a store (deniability: no residual).
  // Opening the bell marks all seen and routes to the notification centre.
  const { latest, unseenCount, dismiss, markAllSeen } = useNotifications();
  const openNotifications = useCallback(() => {
    markAllSeen();
    navigate("/notifications");
  }, [markAllSeen, navigate]);
  const queryClient = useQueryClient();
  const handleRefresh = async () => {
    await Promise.all([
      queryClient.refetchQueries({ queryKey: ["wallets"] }),
      queryClient.refetchQueries({ queryKey: ["transactions"] }),
    ]);
  };

  // Global ⌘K / Ctrl+K shortcut. Registered once via useEffect with a matching
  // removeEventListener cleanup so the handler isn't re-added on every render and
  // is torn down on unmount (the previous render-time window.onkeydown assignment
  // leaked across renders).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setCmdOpen(true); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <AccessibilityWrapper>
    {/* Honest local enforcement of session revocation: locks the wallet +
        signs this device out if its own session is revoked. See the component. */}
    <SessionRevocationGuard />
    <div className="app-shell flex flex-col md:flex-row md:min-h-screen bg-background">

      {/* ── Desktop Sidebar ── */}
      <aside className={`hidden md:flex md:min-h-screen bg-card border-r border-border flex-col shrink-0 transition-all duration-300 ${collapsed ? 'md:w-16' : 'md:w-60'}`}>

        {/* Logo + Search */}
        <div className="flex flex-col border-b border-border">
          <div className="flex items-center gap-3 px-4 py-4">
            <VeyrnoxLogo size={34} className="shrink-0" />
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <VeyrnoxWordmark className="text-sm" />
                <p className="text-[9px] text-muted-foreground tracking-widest uppercase">Wallet</p>
              </div>
            )}
            {!collapsed && <NotificationBell unseenCount={unseenCount} onOpen={openNotifications} className="h-8 w-8" />}
            <HelpMenu triggerClassName="p-1 hover:bg-secondary" />
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
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-[9px] font-bold uppercase tracking-widest text-muted-foreground hover:bg-secondary/50 hover:text-foreground transition-colors"
                >
                  <span>{group.label}</span>
                  <ChevronDown className={`h-3 w-3 text-muted-foreground/50 transition-transform ${openGroups[group.label] ? 'rotate-180' : ''}`} />
                </button>
              )}
              {collapsed && <div className="mt-2" />}
              {(!collapsed && openGroups[group.label]) && (
                <div className="space-y-0.5 mt-1">
                  {group.items.map((item) => {
                    const active = location.pathname === item.path;
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        title={collapsed ? item.label : undefined}
                        aria-current={active ? "page" : undefined}
                        className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-[13px] transition-colors duration-150 group ${collapsed ? 'justify-center' : ''} ${
                          active
                            ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                            : "text-foreground/80 hover:text-foreground hover:bg-secondary"
                        }`}
                      >
                        <item.icon className={`h-3.5 w-3.5 shrink-0 ${active ? "text-primary-foreground" : "group-hover:text-foreground"}`} />
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
            {!collapsed && <p className="px-3 pt-3 pb-1 text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Preferences</p>}
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
            onClick={signOut}
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

      {/* In-app notification toast (brief PR-2 §3/§5). Transient, session-scoped:
          shows the latest notification from the one shell-level queue and
          auto-dismisses. Fixed above the mobile bottom nav; identical chrome in
          real and decoy sessions (I3 — nothing here branches on the active set). */}
      <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center md:justify-end px-4 pointer-events-none"
           style={{ paddingBottom: "calc(5.5rem + env(safe-area-inset-bottom))" }}>
        <div className={`w-full max-w-sm ${latest ? 'pointer-events-auto' : 'pointer-events-none'}`}>
          <NotificationToast notification={latest} onDismiss={dismiss} />
        </div>
      </div>

      {/* ── Mobile Top Bar ── */}
      <header
        className="md:hidden flex items-center justify-between px-4 bg-card border-b border-border sticky top-0 z-30"
        style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top))", paddingBottom: "0.75rem" }}
      >
        <div className="flex items-center gap-2">
          {isRootTab ? (
            <>
              <VeyrnoxLogo size={30} className="shrink-0" />
              <VeyrnoxWordmark className="text-sm" />
            </>
          ) : (
            <button
              onClick={() => {
                // A page reached by tapping a tile in the mobile "More" drawer
                // carries { fromMore: true } in its route state. Back from such a
                // page returns to the underlying tab AND reopens the More drawer,
                // so the user lands back on the menu they launched from instead of
                // being dropped onto Home. Any other page does a plain history back.
                if (location.state?.fromMore) {
                  navigate(-1);
                  setMoreOpen(true);
                } else {
                  navigate(-1);
                }
              }}
              className="flex items-center gap-1 -ml-1 pr-3 min-h-[44px] text-foreground active:opacity-60 transition-opacity select-none"
            >
              <ChevronLeft className="h-5 w-5" />
              <span className="text-sm font-semibold">Back</span>
            </button>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setCmdOpen(true)} aria-label="Search" title="Search" className="p-2 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground active:bg-secondary transition-colors inline-flex items-center justify-center min-h-[40px] min-w-[40px]">
            <Search className="h-4 w-4" aria-hidden="true" />
          </button>
          <NotificationBell unseenCount={unseenCount} onOpen={openNotifications} />
          <HelpMenu triggerClassName="p-2 rounded-lg hover:bg-secondary hover:text-foreground active:bg-secondary inline-flex items-center justify-center min-h-[40px] min-w-[40px]" />
          <Link to="/settings" aria-label="Settings" title="Settings" className="p-2 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground active:bg-secondary transition-colors inline-flex items-center justify-center min-h-[40px] min-w-[40px]">
            <Settings className="h-4 w-4" aria-hidden="true" />
          </Link>
          <button onClick={signOut} aria-label="Exit — lock wallet" title="Exit — lock wallet" className="p-2 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground active:bg-secondary transition-colors inline-flex items-center justify-center min-h-[40px] min-w-[40px]">
            <LogOut className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* ── Main Content — Desktop (Outlet + animation) ──
          Mounted ONLY on desktop (isDesktop) so the page isn't also mounted by the
          mobile region below. The `hidden md:flex` class is kept as belt-and-braces
          (same 768px breakpoint as the gate). */}
      {isDesktop && (
      <AnimatePresence mode="wait" initial={false}>
        <motion.main
          key={location.pathname}
          initial={{ opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -8 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className="hidden md:flex md:flex-1 flex-col p-8 overflow-auto"
        >
          {/* Desktop back affordance (item: back nav on every page). The desktop
              layout has no back control of its own — only the sidebar (which
              jumps to top-level destinations) — so a sub-page reached from e.g.
              the Security Dashboard would otherwise strand the user. The mobile
              top bar already provides this; here we mirror it for desktop on
              every non-root-tab page. Root tabs (Dashboard/Send/Receive/Settings)
              are top-level destinations and don't get a back control. */}
          {!isRootTab && <BackButton className="mb-4" />}
          <PullToRefreshContainer onRefresh={handleRefresh} className="min-h-full">
            <ErrorBoundary key={location.pathname}><FeatureGate><Outlet /></FeatureGate></ErrorBoundary>
          </PullToRefreshContainer>
        </motion.main>
      </AnimatePresence>
      )}

      {/* ── Main Content — Mobile (all 3 root tabs stay mounted) ──
          Mounted ONLY on mobile (!isDesktop) so the page isn't also mounted by the
          desktop region above. Within mobile, the three root tab panels stay mounted
          and toggle via `hidden` to preserve per-tab state (the original intent). */}
      {!isDesktop && (
      <div id="main-scroll" className="md:hidden flex-1 min-h-0 overflow-auto overscroll-contain [-webkit-overflow-scrolling:touch] pb-28" role="region" aria-label="Main content">
        {/* Sub-pages: rendered via Outlet only when not on a root tab with slide
            transition. The MOBILE_TABS guard wraps AnimatePresence (not its child)
            ON PURPOSE: when the child was gated INSIDE AnimatePresence, leaving a
            sub-page back to a root tab asked AnimatePresence to exit-animate the
            child — and if that exit never completed, the Outlet stayed mounted and
            rendered a SECOND copy of the now-active root-tab page (a duplicate Send
            form stacked under the real tab panel). Gating the whole AnimatePresence
            makes the mutual exclusion STRUCTURAL: on a root tab React unmounts the
            subtree outright, so no ghost can survive. Sub-page→sub-page still
            animates (key follows the path; AnimatePresence stays mounted while both
            are sub-pages). */}
        {!MOBILE_TABS.includes(location.pathname) && (
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="p-4"
            >
              <PullToRefreshContainer onRefresh={handleRefresh} className="min-h-full">
                <ErrorBoundary key={location.pathname}><FeatureGate><Outlet /></FeatureGate></ErrorBoundary>
              </PullToRefreshContainer>
            </motion.div>
          </AnimatePresence>
        )}
        {/* Root tab pages — always mounted, toggled via hidden to preserve state */}
        <div
          id="tab-panel-0"
          role="tabpanel"
          aria-labelledby="tab-0"
          hidden={!MOBILE_TABS.includes(location.pathname) || mobileTab !== '/'}
          className="p-4"
        >
          <SafeSuspense fallback={<TabSpinner />}><FeatureGate path="/"><DashboardPage /></FeatureGate></SafeSuspense>
        </div>
        <div
          id="tab-panel-1"
          role="tabpanel"
          aria-labelledby="tab-1"
          hidden={!MOBILE_TABS.includes(location.pathname) || mobileTab !== '/send'}
          className="p-4"
        >
          <SafeSuspense fallback={<TabSpinner />}><FeatureGate path="/send"><SendCryptoPage /></FeatureGate></SafeSuspense>
        </div>
        <div
          id="tab-panel-2"
          role="tabpanel"
          aria-labelledby="tab-2"
          hidden={!MOBILE_TABS.includes(location.pathname) || mobileTab !== '/receive'}
          className="p-4"
        >
          <SafeSuspense fallback={<TabSpinner />}><FeatureGate path="/receive"><ReceiveCryptoPage /></FeatureGate></SafeSuspense>
        </div>
      </div>
      )}

      {/* ── Mobile Bottom Navigation ── */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur border-t border-border flex items-stretch"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        role="navigation"
        aria-label="Bottom navigation"
      >
        {mobileBottomNav.map((item, index) => {
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
              className={`flex flex-col items-center justify-center gap-1 py-3 flex-1 transition-colors hover:bg-secondary/60 active:bg-secondary select-none focus:outline-none focus:ring-2 focus:ring-primary focus:ring-inset ${
                active ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
              aria-label={item.label}
            >
              <item.icon className="h-5 w-5" aria-hidden="true" />
              <span className="text-[11px] font-medium">{item.label}</span>
            </button>
          );
        })}
        <button
          onClick={() => setMoreOpen(true)}
          className="flex flex-col items-center justify-center gap-1 py-3 flex-1 text-muted-foreground hover:bg-secondary/60 hover:text-foreground active:bg-secondary transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-inset"
          aria-label="More features"
          aria-expanded={moreOpen}
        >
          <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
          <span className="text-[11px] font-medium">More</span>
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
              <div key={group.label} className="rounded-2xl p-2.5 border" style={{ backgroundColor: color + "0d", borderColor: color + "33" }}>
                <div className="flex items-center gap-2 px-1 pb-2">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ background: color }} />
                  <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{group.label}</p>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {group.items.map(item => {
                    const active = location.pathname === item.path;
                    return (
                      <Link key={item.path} to={item.path} state={{ fromMore: true }} onClick={() => setMoreOpen(false)}
                        aria-current={active ? "page" : undefined}
                        data-active={active ? "" : undefined}
                        className="more-tile flex flex-col items-center justify-center gap-1.5 p-3 min-h-[72px] rounded-xl border cursor-pointer select-none transition-[transform,background-color,border-color,box-shadow] duration-150 text-foreground/90 hover:text-foreground"
                        style={{
                          "--mt-bg": color + "1c", "--mt-bd": color + "40",
                          "--mt-hbg": color + "59", "--mt-hbd": color + "ee", "--mt-glow": color + "b3",
                          "--mt-abg": color + "3a", "--mt-abd": color + "99",
                        }}
                      >
                        <item.icon className="h-6 w-6" style={active ? { color } : undefined} />
                        <span className="text-[11px] font-medium text-center leading-tight line-clamp-2">{item.label}</span>
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