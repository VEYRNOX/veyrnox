import { ArrowUpRight, ArrowDownLeft } from "lucide-react";

const CURRENCY_COLORS = {
  BTC: "#F7931A", ETH: "#627EEA", SOL: "#9945FF", USDC: "#2775CA", USDT: "#26A17B"
};
const CURRENCY_SYMBOLS = {
  BTC: "₿", ETH: "Ξ", SOL: "◎", USDC: "$", USDT: "₮"
};
const USD_RATES = {
  BTC: 68000, ETH: 3200, SOL: 165, USDC: 1, USDT: 1
};

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
            <div
              className="h-10 w-10 rounded-full flex items-center justify-center text-lg font-bold shrink-0"
              style={{ background: CURRENCY_COLORS[wallet.currency] + "20", color: CURRENCY_COLORS[wallet.currency] }}
            >
              {CURRENCY_SYMBOLS[wallet.currency]}
            </div>
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