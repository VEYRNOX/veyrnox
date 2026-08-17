// EntryTiles — pre-vault entry picker. No wallet state, no I3 gate needed by
// construction (never rendered post-vault).
//
// Slice D1 (docs/superpowers/plans/2026-08-10-entry-tiles-slice-d1.md): replaces
// WelcomeHero's single "Get Started" action with a 3-tile choice (New / Have /
// Advanced). Each tile fires `onSelect(path)`; WalletEntry decides where each
// path routes.
//
// Slice K (2026-08-11): hero chrome extracted to <VeyrnoxHero>. This file now
// owns only the tile buttons; VeyrnoxHero owns the aurora + lamp + halo + logo
// + wordmark + tagline. Same DOM shape from the user's perspective.

import { Wallet, Download, FileArchive, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import VeyrnoxHero from "@/components/VeyrnoxHero";

const TILES = [
  {
    path: "new",
    icon: Wallet,
    label: "New wallet",
    subtitle: "Create a fresh wallet",
    tone: "text-primary",
  },
  {
    path: "have",
    icon: Download,
    label: "Have a wallet",
    subtitle: "Import a seed phrase",
    tone: "text-primary",
  },
  {
    path: "advanced",
    icon: FileArchive,
    label: "File backup",
    subtitle: "Restore from a .enc backup file",
    tone: "text-sky-400",
  },
  {
    path: "shares",
    icon: KeyRound,
    label: "Recovery Shares",
    subtitle: "Restore from 2 of 3 shares",
    tone: "text-amber-400",
  },
];

export default function EntryTiles({ onSelect }) {
  return (
    <VeyrnoxHero>
      <div className="space-y-3">
        {TILES.map(({ path, icon: Icon, label, subtitle, tone }) => (
          <Button
            key={path}
            type="button"
            variant="outline"
            className="w-full h-auto py-4 flex-col items-start gap-1 text-start"
            aria-label={label}
            onClick={() => onSelect(path)}
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              <Icon className={`h-4 w-4 ${tone || 'text-primary'}`} /> {label}
            </span>
            <span className="text-xs font-normal text-muted-foreground">{subtitle}</span>
          </Button>
        ))}
      </div>
    </VeyrnoxHero>
  );
}
