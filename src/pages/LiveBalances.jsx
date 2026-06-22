import { useState } from "react";
import { Contract, formatUnits, isAddress } from "ethers";
import { getProvider, getBalanceEth } from "@/wallet-core/evm/provider";
import { listEnabledNetworks } from "@/wallet-core/evm/networks";
import { TOKENS, ERC20_ABI } from "@/wallet-core/evm/tokens";
import { Search, Wifi, ExternalLink, Loader2, Coins, AlertTriangle, CheckCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Networks come straight from the wallet-core EVM registry — the SAME source
// send / receive / tx-history read from. listEnabledNetworks() returns only
// chains that are enabled AND testnet (mainnet stays gated until audit), so this
// page can never accidentally read a real-funds chain. Reusing this registry
// also means we add NO new RPC endpoint: balances and gas come from each
// network's existing public RPC (provider.js), nothing else.
const NETWORKS = listEnabledNetworks().map((n) => ({
  id: n.key,
  label: n.name,
  symbol: n.symbol,
  explorer: `${n.explorer}/address/`,
}));

const DEFAULT_NETWORK = NETWORKS[0]?.id || "sepolia";

export default function LiveBalances() {
  const [address, setAddress] = useState("");
  const [network, setNetwork] = useState(DEFAULT_NETWORK);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [tokens, setTokens] = useState([]);
  const [gasGwei, setGasGwei] = useState(null);
  const [error, setError] = useState("");

  const fetchAll = async () => {
    const addr = address.trim();
    if (!addr) return;
    if (!isAddress(addr)) {
      setError("That doesn't look like a valid EVM address (0x… 40 hex chars).");
      return;
    }
    setLoading(true);
    setError("");
    setData(null);
    setTokens([]);
    setGasGwei(null);
    try {
      // Native balance — directly through the wallet-core provider (untrusted
      // RPC, read-only; no keys involved).
      const eth = await getBalanceEth(network, addr);
      setData({ eth, address: addr });

      // Gas price — read the live fee data from the same provider.
      try {
        const feeData = await getProvider(network).getFeeData();
        const price = feeData.gasPrice ?? feeData.maxFeePerGas;
        if (price != null) setGasGwei(parseFloat(formatUnits(price, "gwei")));
      } catch {
        /* gas is best-effort; the balance above is the primary result */
      }

      // Token balances — read the VERIFIED token registry for this chain
      // (wallet-core/evm/tokens.js) via balanceOf. We deliberately do NOT use a
      // third-party token-discovery API (e.g. Ethplorer): that would be a new
      // phone-home endpoint and would surface unverified/scam tokens. Only the
      // tokens the wallet itself trusts are queried.
      const registry = TOKENS[network] || {};
      const provider = getProvider(network);
      const found = [];
      for (const [symbol, t] of Object.entries(registry)) {
        try {
          const raw = await new Contract(t.address, ERC20_ABI, provider).balanceOf(addr);
          if (raw > 0n) {
            found.push({
              symbol: t.symbol || symbol,
              address: t.address,
              balance: parseFloat(formatUnits(raw, t.decimals)),
            });
          }
        } catch {
          /* skip a token that fails to read; never block the rest */
        }
      }
      setTokens(found);
    } catch (e) {
      setError(e?.message || "Failed to fetch on-chain data from the RPC.");
    }
    setLoading(false);
  };

  const net = NETWORKS.find((n) => n.id === network);
  const hasRegistryTokens = Object.keys(TOKENS[network] || {}).length > 0;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><Wifi className="h-5 w-5 text-primary" /> Live RPC Balances</h1>
        <p className="text-sm text-muted-foreground">Real on-chain reads via the wallet's own public RPC providers — testnet only (mainnet is gated until audit).</p>
      </div>

      {/* Status indicators — honest about what this actually queries. */}
      <div className="flex gap-2 flex-wrap">
        {["Public RPC (read-only)", "Testnet only", "Verified tokens only"].map(s => (
          <span key={s} className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-full border border-green-500/30 bg-green-500/5 text-green-500 font-semibold">
            <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" /> {s}
          </span>
        ))}
      </div>

      {/* Input row */}
      <div className="flex gap-2">
        <Input placeholder="0x… EVM address" value={address} onChange={e => setAddress(e.target.value)} className="font-mono text-xs flex-1" onKeyDown={e => e.key === "Enter" && fetchAll()} />
        <Select value={network} onValueChange={setNetwork}>
          <SelectTrigger className="w-40 shrink-0"><SelectValue /></SelectTrigger>
          <SelectContent>{NETWORKS.map(n => <SelectItem key={n.id} value={n.id}>{n.label}</SelectItem>)}</SelectContent>
        </Select>
        <Button onClick={fetchAll} disabled={loading} className="shrink-0 gap-1" aria-label="Look up balances">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Paste any address on the selected testnet to read its live native balance, the current gas price, and balances for the wallet's verified token list. Each lookup makes a read-only JSON-RPC call to {net?.label}'s public RPC — no other network calls.
      </p>

      {error && (
        <div className="p-3 rounded-xl border border-destructive/30 bg-destructive/5 text-xs text-destructive flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />{error}
        </div>
      )}

      {data && (
        <>
          {/* Balance card */}
          <div className="p-5 rounded-2xl border border-primary/20 bg-primary/5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Native Balance · {net?.label}</p>
                <p className="text-3xl font-bold">{parseFloat(data.eth).toFixed(6)} {net?.symbol}</p>
                <p className="text-xs text-muted-foreground mt-1 font-mono break-all">{data.address}</p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <a href={`${net?.explorer}${encodeURIComponent(data.address)}`} target="_blank" rel="noreferrer" className="p-2 rounded-lg border border-border bg-card text-muted-foreground hover:text-primary">
                  <ExternalLink className="h-4 w-4" />
                </a>
                <div className="flex items-center gap-1 text-[10px] text-green-500 font-semibold"><CheckCircle className="h-3 w-3" /> Live</div>
              </div>
            </div>
            <div className="flex items-center gap-4 pt-2 border-t border-border text-xs text-muted-foreground">
              <span>Gas Price: <span className="font-semibold text-foreground">{gasGwei != null ? `${gasGwei.toFixed(2)} Gwei` : "—"}</span></span>
              <span className="h-3 w-px bg-border" />
              <span>Network: <span className="font-semibold text-green-500">{net?.label} · Live</span></span>
            </div>
          </div>

          {/* Tokens */}
          {tokens.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Coins className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-semibold">{tokens.length} verified token{tokens.length > 1 ? "s" : ""} with a balance</p>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">wallet registry</span>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {tokens.map((t) => (
                  <div key={t.address} className="p-3 rounded-xl border border-border bg-card flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center text-xs font-bold shrink-0">
                      {t.symbol?.slice(0, 2) || "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{t.symbol}</p>
                      <p className="text-xs text-muted-foreground truncate font-mono">{t.address}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-semibold text-sm">{t.balance >= 0.0001 ? t.balance.toFixed(4) : t.balance.toExponential(2)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tokens.length === 0 && !loading && (
            <div className="p-4 rounded-xl border border-border bg-card text-xs text-muted-foreground text-center">
              {hasRegistryTokens
                ? `No balance for any of the wallet's verified ${net?.label} tokens at this address.`
                : `No verified tokens are configured for ${net?.label} yet — only the native balance is shown.`}
            </div>
          )}
        </>
      )}
    </div>
  );
}
