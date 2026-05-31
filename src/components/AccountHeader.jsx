import { useState } from "react";
import { Copy, CheckCircle2, ChevronDown, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import CoinLogo from "@/components/CoinLogo";

export default function AccountHeader({ wallet, wallets, onWalletChange }) {
  const [copied, setCopied] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const isMobile = useIsMobile();

  const copyAddress = () => {
    if (!wallet?.address) return;
    navigator.clipboard.writeText(wallet.address);
    setCopied(true);
    toast.success("Address copied");
    setTimeout(() => setCopied(false), 2000);
  };

  const shortAddress = (addr) => addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : "";

  if (!wallet) return null;

  const WalletPickerContent = () => (
    <div className="space-y-1 p-2">
      {wallets.map(w => (
        <button
          key={w.id}
          onClick={() => { onWalletChange(w); setShowPicker(false); }}
          className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-secondary transition-colors ${w.id === wallet.id ? "bg-secondary" : ""}`}
        >
          <CoinLogo symbol={w.currency} size={32} />
          <div className="text-left flex-1">
            <p className="text-sm font-medium">{w.name}</p>
            <p className="text-xs text-muted-foreground">{shortAddress(w.address)}</p>
          </div>
          {w.passkey_registered && <ShieldCheck className="h-3.5 w-3.5 text-primary" />}
        </button>
      ))}
    </div>
  );

  return (
    <div className="relative w-full max-w-sm mx-auto">
      {/* Account Selector */}
      {isMobile ? (
        <Drawer open={showPicker} onOpenChange={setShowPicker}>
          <DrawerTrigger asChild>
            <button className="flex items-center gap-2 mx-auto mb-4 px-4 py-1.5 rounded-full bg-secondary border border-border text-sm hover:border-primary/40 transition-colors">
              <CoinLogo symbol={wallet.currency} size={18} />
              <span className="font-medium">{wallet.name}</span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </DrawerTrigger>
          <DrawerContent className="max-h-[70vh]">
            <div className="p-4 border-b border-border">
              <p className="text-sm font-semibold text-center">Select Wallet</p>
            </div>
            <WalletPickerContent />
          </DrawerContent>
        </Drawer>
      ) : (
        <>
          <button
            onClick={() => setShowPicker(!showPicker)}
            className="flex items-center gap-2 mx-auto mb-4 px-4 py-1.5 rounded-full bg-secondary border border-border text-sm hover:border-primary/40 transition-colors"
          >
            <CoinLogo symbol={wallet.currency} size={18} />
            <span className="font-medium">{wallet.name}</span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>

          {showPicker && (
            <div className="absolute top-10 left-1/2 -translate-x-1/2 z-50 w-64 bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
              {wallets.map(w => (
                <button
                  key={w.id}
                  onClick={() => { onWalletChange(w); setShowPicker(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary transition-colors ${w.id === wallet.id ? "bg-secondary" : ""}`}
                >
                  <CoinLogo symbol={w.currency} size={32} />
                  <div className="text-left">
                    <p className="text-sm font-medium">{w.name}</p>
                    <p className="text-xs text-muted-foreground">{shortAddress(w.address)}</p>
                  </div>
                  {w.passkey_registered && <ShieldCheck className="h-3.5 w-3.5 text-primary ml-auto" />}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* Balance */}
      <div className="text-center space-y-1 mb-4">
        <div className="flex items-center justify-center gap-2">
          <p className="text-4xl font-bold tracking-tight">
            {wallet.balance?.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 8 })}
          </p>
          <span className="text-xl font-semibold text-muted-foreground">{wallet.currency}</span>
        </div>
        <button onClick={copyAddress} className="flex items-center gap-1.5 mx-auto text-xs text-muted-foreground hover:text-foreground transition-colors">
          {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
          <span className="font-mono">{shortAddress(wallet.address)}</span>
        </button>
        {wallet.passkey_registered && (
          <div className="flex items-center justify-center gap-1 text-[10px] text-primary">
            <ShieldCheck className="h-3 w-3" />
            <span>FIDO2 Secured</span>
          </div>
        )}
      </div>
    </div>
  );
}