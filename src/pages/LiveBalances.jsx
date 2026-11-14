// @ts-nocheck
import { useState } from "react";
import { formatUnits, isAddress } from "ethers";
import { getProvider, getBalanceEth } from "@/wallet-core/evm/provider";
import { listEnabledNetworks } from "@/wallet-core/evm/networks";
import { TOKENS } from "@/wallet-core/evm/tokens";
import { getTokenBalance } from "@/wallet-core/evm/token-send";
import { ASSETS, canSend, getAssetById, NON_LIVE_ASSET_SPEND_NOTICE } from "@/wallet-core/assets";
import { Search, Wifi, ExternalLink, Loader2, Coins, AlertTriangle, CheckCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCryptoAmount, resolveLocale } from "@/lib/locale";
import { useAdvisorSnapshot } from "@/lib/useAdvisorSnapshot";

// Networks come straight from the wallet-core EVM registry — the SAME source
// send / receive / tx-history read from. This includes every enabled testnet
// and mainnet. Reusing it adds NO new RPC endpoint: balances and gas come from
// each network's existing public RPC (provider.js), nothing else.
const NETWORKS = listEnabledNetworks().map((n) => ({
  id: n.key,
  label: n.name,
  symbol: n.symbol,
  explorer: `${n.explorer}/address/`,
  assetId: ASSETS.find((a) => a.family === "evm" && a.chain === n.key)?.id || null,
}));

const DEFAULT_NETWORK = NETWORKS[0]?.id || "sepolia";

// Generic message shown for ANY balance-read failure on this diagnostic page.
export const GENERIC_RPC_ERROR = "Failed to fetch on-chain data from the RPC.";

// I3 / deniability tell guard. In a decoy/hidden session the wallet-core
// provider guards throw a literal "I3: no egress in deniability session"
// string. Surfacing that verbatim in the UI is a plain-English deniability
// tell (it announces the current session is a decoy/hidden mode). Rewrap the
// I3 guard error into the SAME generic RPC-failure message any user would see
// on a real network failure, so a decoy session is indistinguishable. Genuine
// RPC errors keep their own message for debuggability.
export function sanitizeBalanceError(err) {
  const msg = typeof err?.message === "string" ? err.message : "";
  if (msg.startsWith("I3:")) return GENERIC_RPC_ERROR;
  return msg || GENERIC_RPC_ERROR;
}

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

      // Token balances — read the wallet token registry for this chain through
      // getTokenBalance, which checks decimals() against the pinned registry
      // value and carries the I3/demo guard. We deliberately do NOT use a
      // third-party token-discovery API (e.g. Ethplorer): that would be a new
      // phone-home endpoint and would surface unregistered/scam tokens.
      const registry = TOKENS[network] || {};
      const found = [];
      for (const [symbol, t] of Object.entries(registry)) {
        const asset = typeof t.assetId === "string" ? getAssetById(t.assetId) : null;
        const live = canSend(asset);
        try {
          const balance = Number(await getTokenBalance({ networkKey: network, symbol, owner: addr }));
          if (balance > 0) {
            found.push({
              symbol: t.symbol || symbol,
              address: t.address,
              balance,
              live,
            });
          }
        } catch {
          // A decimals mismatch or RPC failure is visible and indeterminate;
          // never silently omit the row or turn it into a confident zero.
          found.push({
            symbol: t.symbol || symbol,
            address: t.address,
            balance: null,
            error: true,
            live,
          });
        }
      }
      setTokens(found);
    } catch (e) {
      // Never surface the raw I3 deniability guard string (see sanitizeBalanceError).
      setError(sanitizeBalanceError(e));
    }
    setLoading(false);
  };

  const net = NETWORKS.find((n) => n.id === network);
  const netAsset = net?.assetId ? getAssetById(net.assetId) : null;
  const networkStatus = netAsset ? (canSend(netAsset) ? "Live" : "Receive-only") : "Enabled";
  const networkStatusClass = networkStatus === "Live" ? "text-success" : "text-caution";
  const hasRegistryTokens = Object.keys(TOKENS[network] || {}).length > 0;

  useAdvisorSnapshot({
    live_balances: {
      network,
      loading,
      error: !!error,
      has_result: !!data,
      token_count: tokens.length,
    },
  });

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><Wifi className="h-5 w-5 text-primary" /> Live RPC Balances</h1>
        <p className="text-sm text-muted-foreground">Real on-chain reads across the wallet's enabled EVM networks, including enabled mainnets.</p>
      </div>

      {/* Status indicators — honest about what this actually queries. */}
      <div className="flex gap-2 flex-wrap">
        {["Public RPC (read-only)", "Enabled networks", "Wallet registry tokens"].map(s => (
          <span key={s} className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border border-success/30 bg-success/5 text-success font-semibold">
            <div className="h-1.5 w-1.5 rounded-full bg-success motion-safe:animate-pulse" /> {s}
          </span>
        ))}
      </div>

      {/* Input row */}
      <div className="flex gap-2">
        <Input aria-label="EVM wallet address" placeholder="0x… EVM address" maxLength={128} value={address} onChange={e => setAddress(e.target.value)} className="font-mono text-xs flex-1" onKeyDown={e => e.key === "Enter" && fetchAll()} />
        <Select value={network} onValueChange={setNetwork}>
          <SelectTrigger className="w-40 shrink-0" aria-label="Network"><SelectValue /></SelectTrigger>
          <SelectContent>{NETWORKS.map(n => <SelectItem key={n.id} value={n.id}>{n.label}</SelectItem>)}</SelectContent>
        </Select>
        <Button onClick={fetchAll} disabled={loading} className="shrink-0 gap-1" aria-label="Look up balances">
          {loading ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" /> : <Search className="h-4 w-4" />}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Paste any address on the selected enabled network to read its native balance, the current gas price, and balances for the wallet's registry token list. Each lookup makes read-only JSON-RPC calls to {net?.label}'s public RPC — no other network calls.
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
                <p className="text-3xl font-bold">{formatCryptoAmount(parseFloat(data.eth), resolveLocale(), { maximumFractionDigits: 6, symbol: net?.symbol })}</p>
                <p className="text-xs text-muted-foreground mt-1 font-mono break-all">{data.address}</p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <a href={`${net?.explorer}${encodeURIComponent(data.address)}`} target="_blank" rel="noreferrer" className="p-2 rounded-lg border border-border bg-card text-muted-foreground hover:text-primary">
                  <ExternalLink className="h-4 w-4" />
                </a>
                <div className={`flex items-center gap-1 text-xs font-semibold ${networkStatusClass}`}><CheckCircle className="h-3 w-3" /> {networkStatus}</div>
              </div>
            </div>
            <div className="flex items-center gap-4 pt-2 border-t border-border text-xs text-muted-foreground">
              <span>Gas Price: <span className="font-semibold text-foreground">{gasGwei != null ? formatCryptoAmount(gasGwei, resolveLocale(), { maximumFractionDigits: 2, symbol: "Gwei" }) : "—"}</span></span>
              <span className="h-3 w-px bg-border" />
              <span>Network: <span className={`font-semibold ${networkStatusClass}`}>{net?.label} · {networkStatus}</span></span>
            </div>
          </div>

          {/* Tokens */}
          {tokens.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Coins className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-semibold">{tokens.length} registry token row{tokens.length > 1 ? "s" : ""}</p>
                <span className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">wallet registry</span>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto pe-1">
                {tokens.map((t) => (
                  <div key={t.address} data-testid={`token-row-${t.symbol}`} className="p-3 rounded-xl border border-border bg-card flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center text-xs font-bold shrink-0">
                      {t.symbol?.slice(0, 2) || "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm">{t.symbol}</p>
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded font-semibold ${t.live ? "bg-success/10 text-success" : "bg-caution/10 text-caution"}`}
                          title={t.live ? undefined : NON_LIVE_ASSET_SPEND_NOTICE}
                        >
                          {t.live ? "Live" : "Receive-only"}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate font-mono">{t.address}</p>
                    </div>
                    <div className="text-end shrink-0">
                      {t.error ? (
                        <p className="font-semibold text-sm text-caution">Balance unavailable</p>
                      ) : (
                        <p className="font-semibold text-sm">{t.balance >= 0.0001 ? formatCryptoAmount(t.balance, resolveLocale(), { maximumFractionDigits: 4 }) : t.balance.toExponential(2)}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tokens.length === 0 && !loading && (
            <div className="p-4 rounded-xl border border-border bg-card text-xs text-muted-foreground text-center">
              {hasRegistryTokens
                ? `No positive balance for any configured ${net?.label} registry token at this address.`
                : `No registry tokens are configured for ${net?.label} yet — only the native balance is shown.`}
            </div>
          )}
        </>
      )}
    </div>
  );
}
