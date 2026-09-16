// @ts-nocheck
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Plus, Trash2, Star, Edit2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TOP_SYMBOLS } from "@/lib/cryptos";
import CoinLogo from "@/components/CoinLogo";
import { parseLocaleNumber, resolveLocale } from "@/lib/locale";
import { useAdvisorSnapshot } from "@/lib/useAdvisorSnapshot";
import { useWallet } from "@/lib/WalletProvider";
import { DEMO } from "@/api/demoClient";
import { isDeniabilityOrDemoActive } from "@/wallet-core/deniabilitySession";
import { getAsset } from "@/wallet-core/assets";
import { useBasketPrices } from "@/hooks/useBasketPrices";
import { formatUsd } from "@/lib/locale";

const POPULAR = TOP_SYMBOLS;

export default function WatchlistPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ symbol: "", name: "", note: "", target_buy: "", target_sell: "" });
  // Watchlist rows used to render a hardcoded "Price unavailable / Connect a
  // live feed" for every asset — no price hook was imported at all, so the one
  // thing this screen exists to show was permanently absent. This reads the
  // SAME fixed market basket the token list already polls: the watchlist
  // symbols are never sent upstream, so a watchlist cannot leak (I2).
  const { priceFor, changeFor, isLive } = useBasketPrices();

  // K-2 (I3): PersonalWatchlist rows live in the SHARED veyrnox-appdata store
  // with no per-session partitioning, and a watchlist plus its buy/sell targets
  // is a statement about the real user's intentions. components/WatchlistWidget
  // was gated for exactly this reason; this page — the one that can also ADD,
  // EDIT and DELETE those rows — was not. Same near-miss-neighbour shape as
  // AddressBook/FraudDetection in #2537. Masking as well as gating, because
  // nothing clears the react-query cache on a session flip.
  const { isDecoy, isHidden } = useWallet();
  const deniable = DEMO || isDecoy || isHidden || isDeniabilityOrDemoActive();
  const denyInDeniable = () => {
    throw Object.assign(new Error('Watchlist is not available in this session'), { code: 'DENIABILITY_BLOCKED' });
  };

  const { data: itemsRaw = [], isLoading, isError } = useQuery({
    queryKey: ["watchlist"],
    queryFn: () => base44.entities.PersonalWatchlist.list(),
    enabled: !deniable,
  });
  const items = deniable ? [] : itemsRaw;

  const add = useMutation({
    mutationFn: (/** @type {any} */ d) => { if (deniable) denyInDeniable(); return base44.entities.PersonalWatchlist.create(d); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["watchlist"] }); setOpen(false); setForm({ symbol: "", name: "", note: "", target_buy: "", target_sell: "" }); },
  });

  const update = useMutation({
    mutationFn: (/** @type {any} */ vars) => { if (deniable) denyInDeniable(); const { id, ...d } = vars; return base44.entities.PersonalWatchlist.update(id, d); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["watchlist"] }); setEditId(null); },
  });

  const remove = useMutation({
    mutationFn: (/** @type {any} */ id) => { if (deniable) denyInDeniable(); return base44.entities.PersonalWatchlist.delete(id); },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["watchlist"] }),
  });

  function addQuick(symbol) {
    if (items.find(i => i.symbol === symbol)) return;
    add.mutate({ symbol, name: symbol });
  }

  useAdvisorSnapshot({
    watchlist_page: {
      watched_count: items.length,
      editing: editId != null,
      dialog_open: open,
      loading: isLoading,
    },
  });

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><Star className="h-5 w-5 text-yellow-400 fill-yellow-400" /> Watchlist</h1>
          <p className="text-sm text-muted-foreground">{items.length} assets tracked</p>
        </div>
        <Button onClick={() => setOpen(true)} size="sm"><Plus className="h-4 w-4 me-1" /> Add Asset</Button>
      </div>

      {/* Quick Add Popular */}
      <div>
        <p className="text-xs text-muted-foreground mb-2">Quick Add Popular</p>
        <div className="flex flex-wrap gap-2">
          {POPULAR.map(s => {
            const has = items.find(i => i.symbol === s);
            return (
              <button key={s} onClick={() => addQuick(s)} disabled={!!has}
                className={`text-xs px-3 min-h-[44px] inline-flex items-center justify-center rounded-full border transition-colors ${has ? "border-primary/50 text-primary bg-primary/10 cursor-default" : "border-border text-muted-foreground hover:border-primary hover:text-primary"}`}>
                {has ? <Check className="inline h-3 w-3 me-1" /> : null}{s}
              </button>
            );
          })}
        </div>
      </div>

      {/* Watchlist Table */}
      {isLoading ? (
        <div className="text-center py-12 text-sm text-muted-foreground">Loading...</div>
      ) : isError ? (
        <div className="text-center py-12 text-sm text-destructive">Couldn't load your watchlist. Please try again.</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16">
          <Star className="h-10 w-10 text-yellow-400/30 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">Add assets to track their prices</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(item => {
            // ARB/OP hold native ETH on their rollups, so the registry points
            // them at ETH's feed; the raw ticker resolves to the governance
            // token and showed the wrong price and 24h move. Same resolution
            // WalletPortfolioPage and portfolioBalances already do.
            const priceKey = getAsset(item.symbol)?.priceSymbol || item.symbol;
            const price = priceFor(priceKey);
            const change = changeFor(priceKey);
            return (
              <div key={item.id} className="bg-card border border-border rounded-2xl p-4 transition-colors">
                <div className="flex items-center gap-3">
                  <CoinLogo symbol={item.symbol} size={40} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{item.symbol}</p>
                    </div>
                    {item.note && <p className="text-xs text-muted-foreground truncate">{item.note}</p>}
                    {(item.target_buy || item.target_sell) && (
                      <p className="text-[10px] text-muted-foreground">
                        {item.target_buy ? `Buy target: $${item.target_buy}` : ""}
                        {item.target_buy && item.target_sell ? " · " : ""}
                        {item.target_sell ? `Sell target: $${item.target_sell}` : ""}
                      </p>
                    )}
                  </div>
                  <div className="text-end">
                    {price != null ? (
                      <>
                        <p className="text-sm font-semibold mono-value">
                          {formatUsd(price, undefined, { maximumFractionDigits: price < 1 ? 4 : 2, minimumFractionDigits: 2 })}
                        </p>
                        {change != null && (
                          <p className={`text-[10px] mono-value ${change >= 0 ? "text-primary" : "text-risk"}`}>
                            {change >= 0 ? "+" : ""}{change.toFixed(2)}%
                          </p>
                        )}
                      </>
                    ) : (
                      // I4 fail-honest: feed off, deniable/demo session, or a symbol
                      // outside the fixed basket renders NO number — never a stale or
                      // placeholder price.
                      <p className="text-sm text-muted-foreground mono-value" title={isLive ? "No price for this symbol" : "Live prices are off"}>—</p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => { setEditId(item.id); setForm({ symbol: item.symbol, name: item.name || "", note: item.note || "", target_buy: item.target_buy || "", target_sell: item.target_sell || "" }); }}
                      aria-label={`Edit ${item.symbol}`}
                      className="p-1.5 min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground transition-colors">
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => remove.mutate(item.id)}
                      aria-label={`Remove ${item.symbol} from watchlist`}
                      className="p-1.5 min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {editId === item.id && (
                  <div className="mt-3 pt-3 border-t border-border grid grid-cols-2 gap-2">
                    <div>
                      <Label htmlFor="watchlist-buy-below" className="text-[10px]">Buy below ($)</Label>
                      <Input id="watchlist-buy-below" value={form.target_buy} onChange={e => setForm(f => ({ ...f, target_buy: e.target.value }))} placeholder="65000" type="text" inputMode="decimal" className="h-11 text-xs mt-0.5" />
                    </div>
                    <div>
                      <Label htmlFor="watchlist-sell-above" className="text-[10px]">Sell above ($)</Label>
                      <Input id="watchlist-sell-above" value={form.target_sell} onChange={e => setForm(f => ({ ...f, target_sell: e.target.value }))} placeholder="75000" type="text" inputMode="decimal" className="h-11 text-xs mt-0.5" />
                    </div>
                    <div className="col-span-2">
                      <Label htmlFor="watchlist-note" className="text-[10px]">Note</Label>
                      <Input id="watchlist-note" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Your note..." className="h-11 text-xs mt-0.5" />
                    </div>
                    <Button size="sm" className="h-11 text-xs" onClick={() => update.mutate({ id: item.id, ...form, target_buy: form.target_buy ? parseLocaleNumber(form.target_buy, resolveLocale()) : undefined, target_sell: form.target_sell ? parseLocaleNumber(form.target_sell, resolveLocale()) : undefined })}>
                      <Check className="h-3 w-3 me-1" /> Save
                    </Button>
                    <Button size="sm" variant="ghost" className="h-11 text-xs" onClick={() => setEditId(null)}>Cancel</Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add to Watchlist</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label htmlFor="watchlist-add-symbol">Symbol</Label>
              <Input id="watchlist-add-symbol" value={form.symbol} onChange={e => setForm(f => ({ ...f, symbol: e.target.value.toUpperCase() }))} placeholder="BTC, ETH, SOL..." className="mt-1.5" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="watchlist-add-buy-below">Buy Below (USD)</Label>
                <Input id="watchlist-add-buy-below" value={form.target_buy} onChange={e => setForm(f => ({ ...f, target_buy: e.target.value }))} placeholder="Optional" type="text" inputMode="decimal" className="mt-1.5" />
              </div>
              <div>
                <Label htmlFor="watchlist-add-sell-above">Sell Above (USD)</Label>
                <Input id="watchlist-add-sell-above" value={form.target_sell} onChange={e => setForm(f => ({ ...f, target_sell: e.target.value }))} placeholder="Optional" type="text" inputMode="decimal" className="mt-1.5" />
              </div>
            </div>
            <div>
              <Label htmlFor="watchlist-add-note">Note (optional)</Label>
              <Input id="watchlist-add-note" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Your note..." className="mt-1.5" />
            </div>
            <Button className="w-full" disabled={!form.symbol || add.isPending} onClick={() => add.mutate({ ...form, target_buy: form.target_buy ? parseLocaleNumber(form.target_buy, resolveLocale()) : undefined, target_sell: form.target_sell ? parseLocaleNumber(form.target_sell, resolveLocale()) : undefined })}>
              {add.isPending ? "Adding..." : "Add to Watchlist"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}