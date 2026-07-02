import { Shield, ShieldCheck } from "lucide-react";

const currencyIcons = {
  BTC: "₿",
  ETH: "Ξ",
  SOL: "◎",
  USDC: "$",
  USDT: "₮",
};

const currencyColors = {
  BTC: "from-amber-500/20 to-amber-600/5",
  ETH: "from-primary/20 to-primary/5",
  SOL: "from-purple-500/20 to-purple-600/5",
  USDC: "from-blue-500/20 to-blue-600/5",
  USDT: "from-emerald-500/20 to-emerald-600/5",
};

export default function WalletCard({ wallet, onClick }) {
  return (
    <button
      onClick={() => onClick?.(wallet)}
      className="w-full text-left group relative overflow-hidden rounded-xl border border-border bg-card p-5 transition-all duration-200 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${currencyColors[wallet.currency] || "from-primary/10 to-transparent"} opacity-50`} />
      <div className="relative">
        <div className="flex items-center justify-between mb-4">
          <span className="text-2xl">{currencyIcons[wallet.currency] || "●"}</span>
          {wallet.passkey_registered ? (
            <ShieldCheck className="h-4 w-4 text-primary animate-pulse" />
          ) : (
            <Shield className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
        <p className="text-xs text-muted-foreground mb-1">{wallet.name}</p>
        <p className="text-xl font-bold tracking-tight">
          {wallet.balance?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
          <span className="text-sm font-normal text-muted-foreground ml-1.5">{wallet.currency}</span>
        </p>
        <p className="text-[10px] text-muted-foreground mt-2 font-mono truncate">
          {wallet.address}
        </p>
      </div>
    </button>
  );
}