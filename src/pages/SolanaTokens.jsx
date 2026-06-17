import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Copy, Send, ArrowDownLeft, ExternalLink, RefreshCw, CheckCircle2, AlertTriangle, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/lib/WalletProvider";
import { getBalanceSol } from "@/wallet-core/sol/provider";
import { listEnabledSolNetworks, solExplorerUrl } from "@/wallet-core/sol/networks";
import { isLivePricesEnabled, useLivePrices } from "@/lib/priceFeed";

const NETWORKS = listEnabledSolNetworks();

export default function SolanaTokens() {
  const { isUnlocked, solAccount, deriveSol } = useWallet();
  const navigate = useNavigate();
  const liveOn = isLivePricesEnabled();
  const { prices } = useLivePrices();
  const [networkKey, setNetworkKey] = useState(NETWORKS[0]?.key ?? "devnet");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isUnlocked && !solAccount) {
      try { deriveSol("devnet"); } catch (_) {}
    }
  }, [isUnlocked, solAccount, deriveSol]);

  const address = solAccount?.address ?? null;

  const {
    data: solBalance,
    isLoading: balLoading,
    isError: balError,
    refetch,
  } = useQuery({
    queryKey: ["sol-balance", networkKey, address],
    queryFn: () => getBalanceSol(networkKey, address),
    enabled: isUnlocked && !!address,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const solPrice = liveOn ? (prices?.["SOL"] ?? null) : null;
  const usdValue = solBalance != null && solPrice != null ? solBalance * solPrice : null;

  const copy = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isUnlocked) {
    return (
      <div className="max-w-lg mx-auto py-20 text-center space-y-3 text-muted-foreground">
        <Wallet className="h-10 w-10 mx-auto opacity-30" />
        <p className="font-medium text-foreground">Wallet locked</p>
        <p className="text-sm">Unlock your wallet to view your Solana account.</p>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center text-xl font-bold select-none">◎</div>
        <div>
          <h1 className="text-xl font-bold">Solana</h1>
          <p className="text-xs text-muted-foreground">Devnet / Testnet · mainnet gated pending audit</p>
        </div>
      </div>

      {/* Network tabs */}
      <div className="flex gap-2">
        {NETWORKS.map((n) => (
          <button
            key={n.key}
            onClick={() => setNetworkKey(n.key)}
            className={[
              "px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors capitalize",
              networkKey === n.key
                ? "bg-primary text-primary-foreground border-transparent"
                : "bg-card border-border text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            {n.key}
          </button>
        ))}
      </div>

      {/* Balance card */}
      <div className="p-5 rounded-2xl border border-border bg-card space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">SOL Balance</p>
          <button onClick={() => refetch()} className="text-muted-foreground hover:text-foreground transition-colors" aria-label="Refresh balance">
            <RefreshCw className={`h-3.5 w-3.5 ${balLoading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {balError ? (
          <p className="text-sm text-destructive">Failed to fetch balance — check your connection and try again.</p>
        ) : balLoading || !address ? (
          <div className="space-y-2 pt-1">
            <div className="h-9 w-36 animate-pulse rounded-lg bg-secondary" />
            <div className="h-4 w-20 animate-pulse rounded bg-secondary" />
          </div>
        ) : (
          <>
            <p className="text-3xl font-bold">
              {solBalance != null ? solBalance.toFixed(6) : "—"}
              <span className="ml-1.5 text-base font-normal text-muted-foreground">SOL</span>
            </p>
            <p className="text-sm text-muted-foreground">
              {usdValue != null
                ? `≈ $${usdValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : liveOn
                  ? "—"
                  : "Enable live prices for USD value"}
            </p>
          </>
        )}
      </div>

      {/* Address card */}
      {address && (
        <div className="p-4 rounded-xl border border-border bg-card space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">Your Solana Address</p>
          <div className="flex items-start gap-2">
            <p className="flex-1 font-mono text-xs break-all leading-relaxed">{address}</p>
            <button
              onClick={copy}
              className="shrink-0 mt-0.5 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Copy address"
            >
              {copied
                ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <a
            href={solExplorerUrl(networkKey, "address", address)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            View on Solana Explorer
          </a>
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <Button onClick={() => navigate("/send")} className="gap-2">
          <Send className="h-4 w-4" /> Send SOL
        </Button>
        <Button variant="outline" onClick={() => navigate("/receive")} className="gap-2">
          <ArrowDownLeft className="h-4 w-4" /> Receive
        </Button>
      </div>

      {/* Network notice */}
      {networkKey === "devnet" && (
        <div className="flex gap-3 p-3.5 rounded-xl border border-border bg-card text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-yellow-500" />
          <div>
            <p className="font-medium">Devnet — test tokens only</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Get free devnet SOL from the{" "}
              <a
                href="https://faucet.solana.com"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground"
              >
                Solana faucet
              </a>
              .
            </p>
          </div>
        </div>
      )}
      {networkKey === "testnet" && (
        <div className="flex gap-3 p-3.5 rounded-xl border border-border bg-card text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-yellow-500" />
          <p className="text-muted-foreground">Testnet — test tokens only, no real value.</p>
        </div>
      )}

      {/* SPL tokens note */}
      <div className="p-3 rounded-xl bg-secondary/50 border border-border text-xs text-muted-foreground">
        SPL token balances require an on-chain indexer — not yet wired. Native SOL only.
      </div>
    </div>
  );
}
