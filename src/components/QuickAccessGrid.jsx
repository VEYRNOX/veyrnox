import { useNavigate } from "react-router-dom";
import { History, ShieldCheck, FileCheck, Search, Filter, BookUser, Fuel } from "lucide-react";

// Colourful quick-access tiles for the live dashboard. EVERY tile links to a
// genuinely BUILT, honest feature — each route was status-checked against
// docs/Feature-Status.md AND its component before inclusion:
//   • no LLM-disabled pages (AI Advisor), no mock-data shells (Analytics, News
//     Sentiment, Risk Scoring, Anomaly Detection), no mainnet-defaulting screens
//     (Network Manager);
//   • nothing from the deniability stack (stealth/duress/panic) — those must
//     never be advertised on a shared surface.
// "Security" points at /security-dashboard (the read-only posture view, PR #53),
// NOT /security (the older session/device screen re-scoped out as
// deniability-conflicting). See the design spec:
// docs/superpowers/specs/2026-06-07-live-dashboard-demo-feel-design.md
const TILES = [
  { label: "History",       icon: History,     path: "/tx-history",         color: "text-blue-400",   bg: "bg-blue-500/10" },
  { label: "Security",      icon: ShieldCheck, path: "/security-dashboard", color: "text-green-400",  bg: "bg-green-500/10" },
  { label: "Approvals",     icon: FileCheck,   path: "/token-approvals",    color: "text-primary",    bg: "bg-primary/10" },
  { label: "Address Check", icon: Search,      path: "/address-checker",    color: "text-purple-400", bg: "bg-purple-500/10" },
  { label: "Spam Filter",   icon: Filter,      path: "/spam-filter",        color: "text-yellow-400", bg: "bg-yellow-500/10" },
  { label: "Address Book",  icon: BookUser,    path: "/address-book",       color: "text-cyan-400",   bg: "bg-cyan-500/10" },
  { label: "Gas & Fees",    icon: Fuel,        path: "/gas-fees",           color: "text-indigo-400", bg: "bg-indigo-500/10" },
];

export default function QuickAccessGrid() {
  const navigate = useNavigate();
  return (
    <div>
      <p className="text-xs text-muted-foreground uppercase tracking-widest mb-3">Quick Access</p>
      <div className="grid grid-cols-4 gap-2">
        {TILES.map((item) => (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-border bg-card hover:bg-secondary active:bg-secondary transition-colors text-center"
          >
            <div className={`h-8 w-8 rounded-lg ${item.bg} flex items-center justify-center`}>
              <item.icon className={`h-4 w-4 ${item.color}`} />
            </div>
            <span className="text-[10px] font-medium text-muted-foreground leading-tight">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
