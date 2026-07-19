import { useState, useEffect, lazy, useCallback } from "react";
import { Outlet, Link, useLocation, useNavigate, useNavigationType } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { duration as motionDuration, easing as motionEasing } from "@/lib/motion-tokens";
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
import { getParentRoute, isFromMoreDrawer } from "@/lib/parentRoute";
import useRecentPages from "@/hooks/useRecentPages";
import { useQueryClient } from "@tanstack/react-query";
import { useNotifications } from "@/notify/useNotifications";
import NotificationToast from "./NotificationToast";
import NotificationBell from "./NotificationBell";
import { useReceiveDetector } from "@/notify/useReceiveDetector";
import LockSealingOverlay from "./LockSealingOverlay";
import Spinner from "./Spinner";

const DashboardPage     = lazy(() => import('../pages/Dashboard'));
const SendCryptoPage    = lazy(() => import('../pages/SendCrypto'));
const ReceiveCryptoPage = lazy(() => import('../pages/ReceiveCrypto'));
const TabSpinner = () => <Spinner className="p-8" label="Loading tab content..." />;

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

// Routes that host the mobile tab shell (bottom-nav tabs rendered as tab-panels).
const MOBILE_TABS = ['/', '/send', '/receive'];

// Mirrors the `hidden` gate on tab-panel-0: the full-width search pill (F-P2-7)
// lives inside the Home tab panel, so it only exists on a tab route while the
// Home tab is the selected one.
export function isHomeSearchPillVisible(pathname, mobileTab) {
  return MOBILE_TABS.includes(pathname) && mobileTab === '/';
}

// The mobile header search icon is the ONLY other route to the command palette
// on a phone — the sidebar triggers are inside `hidden md:flex` (desktop only)
// and ⌘K needs a hardware keyboard. Deleting it outright (the original "remove
// duplicate search" change) left Send, Receive, every sub-page and the More
// drawer with no search entry point at all.
//
// De-duplicating on Home was the right instinct, so keep that: show the icon
// exactly where the Home pill is NOT rendered. Invariant — for any mobile
// route, exactly one of {header icon, Home pill} is present.
export function shouldShowHeaderSearch(pathname, mobileTab) {
  return !isHomeSearchPillVisible(pathname, mobileTab);
}

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { lock } = useWallet();
  const prefersReducedMotion = useReducedMotion();
  const navType = useNavigationType();
  const isBack = navType === 'POP';
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
  // Full-viewport "vault sealing" overlay played briefly on lock so the moment
  // has ceremony, mirroring the "sealing your wallet into hardware" beat at
  // onboarding. The actual lock() is delayed by the same ~350ms — imperceptibly
  // short and the user has already committed by tapping. See LockSealingOverlay.
  const [sealing, setSealing] = useState(false);
  const signOut = () => {
    if (sealing) return; // debounce double-taps
    setSealing(true);
    setTimeout(() => {
      lock();
      if (WALLET_GATE) {
        navigate("/", { replace: true });
      } else {
        base44.auth.logout();
        navigate("/landing", { replace: true });
      }
      // No need to reset sealing — Layout unmounts as WalletEntry takes over.
    }, 380);
  };
  const ROOT_TABS = ['/', '/send', '/receive', '/settings'];
  const isRootTab = ROOT_TABS.includes(location.pathname);
  // Render the desktop OR the mobile main-content region — never both — so a page
  // mounts exactly once (see useIsDesktop). The nav chrome (sidebar / top bar /
  // bottom nav) stays CSS-toggled; only the heavy page-hosting regions are gated.
  const isDesktop = useIsDesktop();
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
    // Send always navigates fresh — clears ?asset= param and resets the form.
    if (path === '/send') {
      setMobileTab('/send');
      navigate('/send', { replace: true });
      return;
    }
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
  const { recents } = useRecentPages();
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

        </nav>

        {/* Sign Out */}
        <div className="px-2 pb-4 border-t border-border pt-2">
          <button
            onClick={signOut}
            title={collapsed ? "Lock" : undefined}
            className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-[13px] text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all w-full ${collapsed ? 'justify-center' : ''}`}
          >
            <LogOut className="h-3.5 w-3.5" />
            {!collapsed && "Lock"}
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
                const hasHistory = window.history.length > 1 && document.referrer;
                if (location.state?.fromMore || (!hasHistory && isFromMoreDrawer(location.pathname))) {
                  const parent = getParentRoute(location.pathname);
                  navigate(parent, { replace: true });
                  setMoreOpen(true);
                } else if (hasHistory) {
                  navigate(-1);
                } else {
                  navigate(getParentRoute(location.pathname), { replace: true });
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
          {/* Search is reachable on every mobile route: the Home tab shows the
              full-width pill, everywhere else shows this icon. See
              shouldShowHeaderSearch — exactly one of the two renders. */}
          {shouldShowHeaderSearch(location.pathname, mobileTab) && (
            <button onClick={() => setCmdOpen(true)} aria-label="Search" title="Search" className="p-2 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground active:bg-secondary transition-colors inline-flex items-center justify-center min-h-[40px] min-w-[40px]">
              <Search className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
          <NotificationBell unseenCount={unseenCount} onOpen={openNotifications} />
          <HelpMenu triggerClassName="p-2 rounded-lg hover:bg-secondary hover:text-foreground active:bg-secondary inline-flex items-center justify-center min-h-[40px] min-w-[40px]" />
          <Link to="/settings" aria-label="Settings" title="Settings" className="p-2 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground active:bg-secondary transition-colors inline-flex items-center justify-center min-h-[40px] min-w-[40px]">
            <Settings className="h-4 w-4" aria-hidden="true" />
          </Link>
          {/* F-P2-6: mobile Lock button sits next to Settings gear; a mis-tap
              mid-Send would clear session state and force re-auth. Confirm before
              actually locking to prevent that class of mis-tap. */}
          <button
            onClick={() => {
              if (typeof window !== 'undefined' && window.confirm && !window.confirm('Lock this wallet now?')) return;
              signOut();
            }}
            aria-label="Lock"
            title="Lock"
            className="p-2 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground active:bg-secondary transition-colors inline-flex items-center justify-center min-h-[40px] min-w-[40px]"
          >
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
          initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, x: 8 }}
          animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, x: 0 }}
          exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, x: -8 }}
          transition={{ duration: prefersReducedMotion ? 0.15 : motionDuration.normal, ease: motionEasing.out }}
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
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, x: isBack ? -20 : 20 }}
              animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, x: 0 }}
              exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, x: isBack ? 20 : -20 }}
              transition={{ duration: prefersReducedMotion ? 0.15 : motionDuration.normal, ease: motionEasing.out }}
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
          {/* F-P2-7: Mobile search pill — surfaces the command palette on Home since
              ⌘K is desktop-only and the header icon is easy to miss. */}
          <button
            onClick={() => setCmdOpen(true)}
            className="w-full flex items-center gap-2 px-3 py-2 mb-3 rounded-xl bg-secondary/60 hover:bg-secondary text-muted-foreground text-sm transition-colors"
          >
            <Search className="h-4 w-4 shrink-0" />
            <span className="flex-1 text-left">Search features, pages…</span>
          </button>
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
              className={`relative flex flex-col items-center justify-center gap-1 py-3 flex-1 transition-colors hover:bg-secondary/60 active:bg-secondary select-none focus:outline-none focus:ring-2 focus:ring-primary focus:ring-inset ${
                active ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
              aria-label={item.label}
            >
              {/* Shared-element active pill — physically slides between tabs
                  when the active tab changes (skill §7 shared-element-transition,
                  Bento-2.0 signature). Uses layoutId so framer treats it as one
                  element crossfading position across siblings. */}
              {active && (
                <motion.span
                  layoutId="mobile-tab-pill"
                  aria-hidden
                  className="absolute inset-x-3 top-1.5 bottom-1.5 rounded-xl bg-primary/10 border border-primary/25"
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                />
              )}
              <item.icon className="relative h-5 w-5" aria-hidden="true" />
              <span className="relative text-[11px] font-medium">{item.label}</span>
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
            {/* Pinned quick-access + recents (deduplicated against permanent groups) */}
            {(() => {
              const groupPaths = new Set(navGroups.flatMap(g => g.items.map(i => i.path)));
              const dedupedRecents = recents.filter(p => !groupPaths.has(p));
              return dedupedRecents.length > 0 && (
              <div className="rounded-2xl p-2.5 border border-primary/20 bg-primary/5">
                <div className="flex items-center gap-2 px-1 pb-2">
                  <span className="h-2 w-2 rounded-full shrink-0 bg-primary" />
                  <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Recent</p>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {dedupedRecents.map(path => {
                    const item = navGroups.flatMap(g => g.items).find(i => i.path === path);
                    if (!item) return null;
                    const active = location.pathname === path;
                    return (
                      <Link key={path} to={path} state={{ fromMore: true }} onClick={() => setMoreOpen(false)}
                        aria-current={active ? "page" : undefined}
                        className="more-tile flex flex-col items-center justify-center gap-1.5 p-3 min-h-[72px] rounded-xl border cursor-pointer select-none transition-[transform,background-color,border-color,box-shadow] duration-150 text-foreground/90 hover:text-foreground"
                        style={/** @type {React.CSSProperties} */ ({ "--mt-bg": "#4ADAC21c", "--mt-bd": "#4ADAC240", "--mt-hbg": "#4ADAC259", "--mt-hbd": "#4ADAC2ee", "--mt-glow": "#4ADAC2b3", "--mt-abg": "#4ADAC23a", "--mt-abd": "#4ADAC299" })}
                      >
                        <item.icon className="h-6 w-6" style={active ? { color: '#4ADAC2' } : undefined} />
                        <span className="text-[11px] font-medium text-center leading-tight line-clamp-2">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );})()}
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
                        style={/** @type {React.CSSProperties} */ ({
                          "--mt-bg": color + "1c", "--mt-bd": color + "40",
                          "--mt-hbg": color + "59", "--mt-hbd": color + "ee", "--mt-glow": color + "b3",
                          "--mt-abg": color + "3a", "--mt-abd": color + "99",
                        })}
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
      <AnimatePresence>{sealing && <LockSealingOverlay />}</AnimatePresence>
    </div>
    </AccessibilityWrapper>
  );
}