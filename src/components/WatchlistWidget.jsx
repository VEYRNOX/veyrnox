import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Plus, Star, Trash2, TrendingUp, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TOP_CRYPTOS } from "@/lib/cryptos";
import CoinLogo from "@/components/CoinLogo";

// Reference prices for the top 10 by market cap, from the canonical source.
const MOCK_PRICES = Object.fromEntries(
  TOP_CRYPTOS.map(c => [c.symbol, { price: c.usd, change: c.change24h }])
);

export default function WatchlistWidget() {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [symbol, setSymbol] = useState("");

  const { data: items = [] } = useQuery({
    queryKey: ["watchlist"],
    queryFn: () => base44.entities.PersonalWatchlist.list(),
  });

  const add = useMutation({
    mutationFn: (/** @type {any} */ data) => base44.entities.PersonalWatchlist.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["watchlist"] }); setAdding(false); setSymbol(""); },
  });

  const remove = useMutation({
    mutationFn: (/** @type {any} */ id) => base44.entities.PersonalWatchlist.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["watchlist"] }),
  });

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Star className="h-4 w-4 text-caution fill-caution" />
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Watchlist</p>
        </div>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setAdding(v => !v)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add
        </Button>
      </div>

      {adding && (
        <div className="flex gap-2 mb-3">
          <Input
            value={symbol}
            onChange={e => setSymbol(e.target.value.toUpperCase())}
            placeholder="BTC, ETH, SOL..."
            className="h-8 text-xs flex-1"
          />
          <Button size="sm" className="h-8 text-xs" onClick={() => symbol && add.mutate({ symbol, name: symbol })}>
            Add
          </Button>
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">No assets — add some to watch</p>
      ) : (
        <div className="space-y-2">
          {items.map(item => {
            const data = MOCK_PRICES[item.symbol] || { price: 0, change: 0 };
            const up = data.change >= 0;
            return (
              <div key={item.id} className="flex items-center gap-2 group">
                <CoinLogo symbol={item.symbol} size={28} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{item.symbol}</p>
                  {item.note && <p className="text-[10px] text-muted-foreground truncate">{item.note}</p>}
                </div>
                <div className="text-right mr-1">
                  <p className="text-sm font-semibold">${data.price.toLocaleString()}</p>
                  <p className={`text-[10px] flex items-center gap-0.5 justify-end ${up ? "text-success" : "text-destructive"}`}>
                    {up ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                    {up ? "+" : ""}{data.change}%
                  </p>
                </div>
                <button
                  onClick={() => remove.mutate(item.id)}
                  aria-label={`Remove ${item.symbol} from watchlist`}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 hover:text-destructive transition-all"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}