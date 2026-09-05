// components/WalletGate.jsx — the on-device access gate.
//
// In the default LOCAL build the SINGLE source of truth for access is the vault
// unlock state, not a hosted account. This gate wraps every protected route: if
// the vault is locked it renders the on-device create/import/unlock front door
// (WalletEntry) instead of the app, so a locked vault genuinely means NO access
// to any wallet screen. When the vault is unlocked it renders the routes.
//
// It is a strict ADDITION to security — it never opens a path that wasn't already
// open. In the demo tour and the hosted (opt-in) build it is a pass-through, so
// those modes are unchanged (demo stays a no-login walkthrough; hosted keeps its
// account layer via ProtectedRoute, which Phase 4 removes with the SDK).

import { Outlet } from "react-router";
import { WALLET_GATE } from "@/api/base44Client";
import WalletEntry from "@/components/WalletEntry";
import WalletEntryErrorBoundary from "@/components/WalletEntryErrorBoundary";

// Dev-only bypass so a design-review sim/browser session can reach protected
// routes (/plans, etc.) without going through onboarding + PIN + KEK enrollment.
// Guarded by BOTH `import.meta.env.DEV` (vite strips this to false in prod
// builds — the whole branch dead-code-eliminates) AND an explicit env flag
// nobody sets by accident. Never trust either alone: DEV alone would open
// every dev preview; the flag alone in a hypothetical prod build with the
// var set would open prod. Both together = design-review only.
const DEV_BYPASS_WALLET_GATE =
  import.meta.env.DEV && import.meta.env.VITE_DEV_BYPASS_WALLET_GATE === '1';

export default function WalletGate() {
  if (DEV_BYPASS_WALLET_GATE) return <Outlet />;
  // Gate-less ONLY for the web demo tour. Every native build — including a
  // demo-data native build — gates here so the app's entry point is always the
  // in-app create/import/unlock front door, never the marketing /landing page.
  if (!WALLET_GATE) return <Outlet />;

  // local build: the vault unlock IS the gate. WalletEntry owns the locked⇄
  // unlocked transition (it renders <Outlet/> once unlocked) so it can hold the
  // user on the one-time seed-backup step right after wallet creation — at which
  // point the vault is already technically unlocked but the app must not show yet.
  return (
    <WalletEntryErrorBoundary>
      <WalletEntry />
    </WalletEntryErrorBoundary>
  );
}
