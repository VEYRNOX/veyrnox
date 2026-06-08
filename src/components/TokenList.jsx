import { USD_RATES } from "@/lib/cryptos";
import CoinLogo from "@/components/CoinLogo";
import { useBasketPrices } from "@/hooks/useBasketPrices";

// 24h market-change chip. Renders ONLY for a live, finite value — a null change
// (fetch failed / not live) shows nothing, never a stale figure (fail-honest).
// This is the ASSET's market move, not the user's return; sourced from the
// holdings-decoupled fixed basket (see useBasketPrices.js), keyed by symbol.
function ChangeChip({ change }) {
  if (change == null) return null;
  const up = change >= 0;
  return (
    <span
      className={`mt-0.5 inline-flex items-center gap-0.5 text-[11px] font-mono ${
        up ? "text-[#4ADAC2]" : "text-[#F06A5A]"
      }`}
    >
      {up ? "▲" : "▼"} {Math.abs(change).toFixed(2)}%
    </span>
  );
}

export default function TokenList({ wallets, onSelect, selectedId }) {
  const { changeFor } = useBasketPrices();
  return (
    <div className="space-y-1">
      {wallets.map(wallet => {
        const usd = (wallet.balance || 0) * (USD_RATES[wallet.currency] || 1);
        const isSelected = wallet.id === selectedId;
        const change = changeFor(wallet.currency); // basket lookup, NOT a per-holding fetch
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
            <div className="text-right shrink-0 flex flex-col items-end">
              <p className="text-sm font-semibold">
                {wallet.balance?.toLocaleString(undefined, { maximumFractionDigits: 6 })}
              </p>
              <p className="text-xs text-muted-foreground">
                ${usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </p>
              <ChangeChip change={change} />
            </div>
          </button>
        );
      })}
    </div>
  );
}
