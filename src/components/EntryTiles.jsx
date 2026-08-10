// EntryTiles — pre-vault entry picker. No wallet state, no I3 gate needed by
// construction (never rendered post-vault).
//
// Slice D1 (docs/superpowers/plans/2026-08-10-entry-tiles-slice-d1.md): replaces
// WelcomeHero's single "Get Started" action with a 3-tile choice (New / Have /
// Advanced). Each tile fires `onSelect(path)`; WalletEntry decides where each
// path routes (New/Have -> PIN-first; Advanced -> the existing .enc restore
// flow, which carries its own credential and does not need a PIN first).

import { Wallet, Download, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";

const TILES = [
  {
    path: "new",
    icon: Wallet,
    label: "New wallet",
    subtitle: "Create a fresh wallet",
  },
  {
    path: "have",
    icon: Download,
    label: "Have a wallet",
    subtitle: "Import a seed phrase",
  },
  {
    path: "advanced",
    icon: Shield,
    label: "Advanced",
    subtitle: "Restore from a backup file",
  },
];

export default function EntryTiles({ onSelect }) {
  return (
    <div className="w-full space-y-3">
      {TILES.map(({ path, icon: Icon, label, subtitle }) => (
        <Button
          key={path}
          type="button"
          variant="outline"
          className="w-full h-auto py-4 flex-col items-start gap-1 text-start"
          onClick={() => onSelect(path)}
        >
          <span className="flex items-center gap-2 text-sm font-medium">
            <Icon className="h-4 w-4 text-primary" /> {label}
          </span>
          <span className="text-xs font-normal text-muted-foreground">{subtitle}</span>
        </Button>
      ))}
    </div>
  );
}
