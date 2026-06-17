import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Coins, Plus, Trash2, CheckCircle2, AlertTriangle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { isLivePricesEnabled, useLivePrices } from "@/lib/priceFeed";
import { annotateTokens } from "@/wallet-core/evm/spam";

// Curated well-known ERC-20 tokens for quick-add.
// No contract addresses: this is a reference list, not auto-discovery.
// Balances are read only via Live Balances (direct balanceOf RPC), never via indexer.
const CURATED = [
  { symbol: 'USDC',  name: 'USD Coin',        decimals: 6  },
  { symbol: 'USDT',  name: 'Tether USD',       decimals: 6  },
  { symbol: 'DAI',   name: 'Dai Stablecoin',   decimals: 18 },
  { symbol: 'WBTC',  name: 'Wrapped Bitcoin',  decimals: 8  },
  { symbol: 'WETH',  name: 'Wrapped Ether',    decimals: 18 },
  { symbol: 'LINK',  name: 'Chainlink',        decimals: 18 },
  { symbol: 'UNI',   name: 'Uniswap',          decimals: 18 },
  { symbol: 'AAVE',  name: 'Aave',             decimals: 18 },
  { symbol: 'MKR',   name: 'Maker',            decimals: 18 },
  { symbol: 'COMP',  name: 'Compound',         decimals: 18 },
  { symbol: 'CRV',   name: 'Curve DAO',        decimals: 18 },
  { symbol: 'MATIC', name: 'Polygon',          decimals: 18 },
];

const EVM_ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

function initials(symbol = '') {
  return symbol.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || '?';
}

export default function ERC20Discovery() {
  const liveOn = isLivePricesEnabled();
  const { prices } = useLivePrices();
  const qc = useQueryClient();

  const [addr, setAddr] = useState('');
  const [sym,  setSym]  = useState('');
  const [name, setName] = useState('');
  const [decs, setDecs] = useState('18');
  const [flash, setFlash] = useState(false);

  const { data: tracked = [], isLoading } = useQuery({
    queryKey: ['wallet-tokens'],
    queryFn: () => base44.entities.WalletToken.list(),
  });

  const trackedSet = useMemo(
    () => new Set(tracked.map(t => t.symbol.toUpperCase())),
    [tracked],
  );

  const annotated = useMemo(() => annotateTokens(tracked), [tracked]);

  const addMut = useMutation({
    mutationFn: d => base44.entities.WalletToken.create(d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wallet-tokens'] }),
  });

  const delMut = useMutation({
    mutationFn: id => base44.entities.WalletToken.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wallet-tokens'] }),
  });

  function trackCurated(tok) {
    if (trackedSet.has(tok.symbol.toUpperCase())) return;
    addMut.mutate({
      symbol: tok.symbol,
      name: tok.name,
      decimals: tok.decimals,
      token_contract: '',
      network: 'sepolia',
      balance: 0,
      value_usd: 0,
      verified: true,
      acquired_via: 'manual',
    });
  }

  function addCustom() {
    const s = sym.trim().toUpperCase();
    const n = name.trim();
    if (!s || !n) return;
    if (addr && !EVM_ADDR_RE.test(addr)) return;
    addMut.mutate({
      symbol: s,
      name: n,
      decimals: Math.max(0, Math.min(18, Number(decs) || 18)),
      token_contract: addr.trim(),
      network: 'sepolia',
      balance: 0,
      value_usd: 0,
      verified: false,
      acquired_via: 'manual',
    });
    setAddr(''); setSym(''); setName(''); setDecs('18');
    setFlash(true);
    setTimeout(() => setFlash(false), 1800);
  }

  const addrOk = !addr || EVM_ADDR_RE.test(addr);
  const formOk = sym.trim() && name.trim() && addrOk;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl border border-border bg-card">
          <Coins className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">ERC-20 Token Tracker</h1>
          <p className="text-sm text-muted-foreground">Manual token list — no auto-scan, no address egress</p>
        </div>
      </div>

      <div className="p-3 rounded-xl bg-secondary/50 border border-border text-xs text-muted-foreground">
        <span className="font-medium text-foreground">No auto-discovery.</span>{' '}
        Scanning every token held by an address requires a third-party indexer that would
        receive your address. Veyrnox does not do this. Add tokens manually below; balances
        are checked per-token via your configured RPC via{' '}
        <a href="/live-balances" className="text-primary hover:underline">Live Balances</a>.
      </div>

      {/* ── Curated quick-add ──────────────────────────────────────────────── */}
      <div className="space-y-3">
        <p className="text-sm font-medium">Common tokens</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {CURATED.map(tok => {
            const already = trackedSet.has(tok.symbol.toUpperCase());
            const spot = prices?.[tok.symbol];
            return (
              <div
                key={tok.symbol}
                className="flex items-center justify-between gap-2 p-3 rounded-xl border border-border bg-card"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center text-xs font-bold shrink-0">
                    {initials(tok.symbol)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold truncate">{tok.symbol}</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {liveOn && spot != null
                        ? `$${spot.toLocaleString(undefined, { maximumFractionDigits: 4 })}`
                        : tok.name}
                    </p>
                  </div>
                </div>
                {already ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                ) : (
                  <button
                    onClick={() => trackCurated(tok)}
                    disabled={addMut.isPending}
                    aria-label={`Track ${tok.symbol}`}
                    className="h-6 w-6 rounded-md border border-border flex items-center justify-center hover:bg-secondary transition-colors shrink-0"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Custom token form ──────────────────────────────────────────────── */}
      <div className="p-5 rounded-xl border border-border bg-card space-y-3">
        <p className="text-sm font-medium">Add custom token</p>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="text"
            value={sym}
            onChange={e => setSym(e.target.value)}
            placeholder="Symbol  (e.g. LINK)"
            className="rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            autoComplete="off"
          />
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Name  (e.g. Chainlink)"
            className="rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            autoComplete="off"
          />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <input
            type="text"
            value={addr}
            onChange={e => setAddr(e.target.value)}
            placeholder="0x… contract  (optional)"
            spellCheck={false}
            className={`col-span-2 rounded-md border px-3 py-2 text-sm font-mono bg-transparent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
              addr && !addrOk ? 'border-destructive' : 'border-input'
            }`}
          />
          <input
            type="number"
            value={decs}
            onChange={e => setDecs(e.target.value)}
            min={0}
            max={18}
            placeholder="Decimals"
            className="rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        {addr && !addrOk && (
          <p className="text-xs text-destructive flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Must be a valid EVM address (0x + 40 hex chars) or leave empty
          </p>
        )}
        <Button
          onClick={addCustom}
          disabled={!formOk || addMut.isPending}
          className="gap-2 w-full"
        >
          {flash
            ? <><CheckCircle2 className="h-4 w-4" /> Added</>
            : <><Plus className="h-4 w-4" /> Add token</>}
        </Button>
      </div>

      {/* ── Tracked token list ─────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">
            Tracked tokens{tracked.length > 0 ? ` (${tracked.length})` : ''}
          </p>
          {!liveOn && tracked.length > 0 && (
            <span className="text-xs text-muted-foreground">Enable live prices for USD values</span>
          )}
        </div>

        {isLoading && (
          <p className="text-sm text-muted-foreground py-4 text-center">Loading…</p>
        )}

        {!isLoading && annotated.length === 0 && (
          <div className="py-8 text-center text-sm text-muted-foreground border border-dashed border-border rounded-xl">
            No tokens tracked yet — add from the list above.
          </div>
        )}

        {annotated.map(tok => {
          const spot = prices?.[tok.symbol];
          const usdLine =
            liveOn && spot != null && tok.balance > 0
              ? (tok.balance * spot).toLocaleString(undefined, { style: 'currency', currency: 'USD' })
              : null;

          return (
            <div
              key={tok.id}
              className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card"
            >
              <div
                className={`h-9 w-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  tok.spam ? 'bg-destructive/10 text-destructive' : 'bg-secondary'
                }`}
              >
                {tok.spam ? <AlertTriangle className="h-4 w-4" /> : initials(tok.symbol)}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm font-semibold">{tok.symbol}</span>
                  {tok.verified && (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                  )}
                  {tok.spam && (
                    <span className="text-[10px] font-medium text-destructive bg-destructive/10 px-1.5 py-0.5 rounded-full">
                      Suspected spam
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {tok.name}
                  {tok.token_contract
                    ? ` · ${tok.token_contract.slice(0, 8)}…${tok.token_contract.slice(-6)}`
                    : ''}
                  {usdLine ? ` · ${usdLine}` : ''}
                </p>
                {tok.spam && tok.reasons?.length > 0 && (
                  <p className="text-[11px] text-destructive mt-0.5">
                    {tok.reasons[0]}
                  </p>
                )}
              </div>

              <button
                onClick={() => delMut.mutate(tok.id)}
                disabled={delMut.isPending}
                aria-label={`Remove ${tok.symbol}`}
                className="h-8 w-8 rounded-lg border border-border flex items-center justify-center hover:bg-destructive/10 hover:border-destructive/30 hover:text-destructive transition-colors shrink-0"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      {tracked.length > 0 && (
        <div className="p-3 rounded-xl bg-secondary/50 border border-border text-xs text-muted-foreground flex items-center justify-between gap-4">
          <span>
            Balances are read per-token via direct <code className="text-foreground text-[11px]">balanceOf</code> RPC
            calls — no indexer, no address broadcast to third parties.
          </span>
          <a
            href="/live-balances"
            className="inline-flex items-center gap-1 text-primary hover:underline font-medium shrink-0"
          >
            Live Balances <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}
    </div>
  );
}
