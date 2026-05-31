import { USD_RATES } from "@/lib/cryptos";
import CoinLogo from "@/components/CoinLogo";

export default function TokenList({ wallets, onSelect, selectedId }) {
  return (
    <div className="space-y-1">
      {wallets.map(wallet => {
        const usd = (wallet.balance || 0) * (USD_RATES[wallet.currency] || 1);
        const isSelected = wallet.id === selectedId;
        return (
          <button
            key={wallet.id}
            onClick={() => onSelect(wallet)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
              isSelected ? "bg-primary/10 border border-primary/30" : "hover:bg-secondary border border-transparent"
            }`}
          >
            <CoinLogo symbol={wallet.currency} size={40} />
            <div className="flex-1 text-left min-w-0">
              <p className="text-sm font-semibold">{wallet.currency}</p>
              <p className="text-xs text-muted-foreground truncate">{wallet.name}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-semibold">
                {wallet.balance?.toLocaleString(undefined, { maximumFractionDigits: 6 })}
              </p>
              <p className="text-xs text-muted-foreground">
                ${usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}