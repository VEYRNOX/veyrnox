// @ts-nocheck
// WalletAssetPickerSheet — single bottom-sheet that lets the user choose the
// source wallet AND the asset without navigating between two dropdowns.
// Selecting either fires the matching callback; the parent owns state.
// Closing is left to the parent — pass onOpenChange for that.
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Wallet } from "lucide-react";
import CoinLogo from "@/components/CoinLogo";
import { getAssetById } from "@/wallet-core/assets";

export default function WalletAssetPickerSheet({
  open,
  onOpenChange,
  wallets = [],
  enabledAssets = [],
  selectedWalletId,
  selectedAssetSymbol,
  onSelectWallet,
  onSelectAsset,
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="text-start">
          <SheetTitle>From</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium mb-2">Wallet</p>
            <div className="space-y-1.5">
              {wallets.map((w) => {
                const active = w.id === selectedWalletId;
                return (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => onSelectWallet?.(w.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-start ${active ? "border-primary bg-primary/10" : "border-border hover:bg-secondary/40"}`}
                    aria-pressed={active}
                  >
                    <span className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-primary/20 border border-primary/40">
                      <Wallet className="h-3.5 w-3.5 text-primary" />
                    </span>
                    <span className="flex-1 text-sm font-medium">{w.name}</span>
                    {active && <span className="text-[10px] uppercase tracking-widest text-primary">Selected</span>}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium mb-2">Asset</p>
            <div className="space-y-1.5">
              {enabledAssets.map((id) => {
                const a = getAssetById(id);
                const sym = a?.symbol || id;
                const disp = a?.displaySymbol || sym;
                const active = sym === selectedAssetSymbol;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onSelectAsset?.(sym)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-start ${active ? "border-primary bg-primary/10" : "border-border hover:bg-secondary/40"}`}
                    aria-pressed={active}
                  >
                    <CoinLogo symbol={sym} size={24} />
                    <span className="flex-1 text-sm font-medium">{a?.name || sym} <span className="text-muted-foreground">— {disp}</span></span>
                    {active && <span className="text-[10px] uppercase tracking-widest text-primary">Selected</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
