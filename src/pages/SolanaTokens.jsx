// @ts-nocheck
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWallet } from "@/lib/WalletProvider";
import { getBalanceSol } from "@/wallet-core/sol/provider";
import { ALLOW_SOL_MAINNET, solExplorerUrl } from "@/wallet-core/sol/networks";
import { Copy, RefreshCw, ExternalLink, ShieldCheck, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const NETWORK_KEY = ALLOW_SOL_MAINNET ? "mainnet" : "devnet";
const NETWORK_LABEL = ALLOW_SOL_MAINNET ? "Mainnet" : "Devnet";
const FAUCET_URL = "https://faucet.solana.com";

export default function SolanaTokens() {
  const { solAccount, deriveSol, isLocked } = useWallet();
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  // Derive the SOL account as soon as the wallet is unlocked.
  useEffect(() => {
    if (!isLocked && !solAccount) {
      try { deriveSol(NETWORK_KEY); } catch { /* wallet locked or demo mode */ }
    }
  }, [isLocked, solAccount, deriveSol]);

  const fetchBalance = async () => {
    if (!solAccount?.address) return;
    setLoading(true);
    setError(null);
    try {
      const sol = await getBalanceSol(NETWORK_KEY, solAccount.address);
      setBalance(sol);
    } catch (e) {
      setError(`RPC unavailable — ${e?.message || String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  // Auto-fetch balance when address becomes available.
  useEffect(() => {
    if (solAccount?.address) fetchBalance();
  }, [solAccount?.address]);

  const copy = () => {
    navigator.clipboard.writeText(solAccount.address);
    toast.success("Address copied");
  };

  const explorerUrl = solAccount?.address
    ? solExplorerUrl(NETWORK_KEY, "address", solAccount.address)
    : "";

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center text-lg font-bold text-muted-foreground">◎</div>
        <div>
          <h1 className="text-xl font-bold">Solana Wallet</h1>
          <p className="text-sm text-muted-foreground">{NETWORK_LABEL} · ed25519 / SLIP-0010</p>
        </div>
      </div>

      {isLocked ? (
        <div className="p-5 rounded-xl border border-border bg-secondary/30 text-sm text-muted-foreground">
          Unlock your wallet to view your Solana address and balance.
        </div>
      ) : !solAccount ? (
        <div className="p-5 rounded-xl border border-border bg-secondary/30 text-sm text-muted-foreground">
          Deriving Solana account…
        </div>
      ) : (
        <>
          {/* Balance */}
          <div className="p-5 rounded-xl border border-border bg-card space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-widest">SOL Balance ({NETWORK_LABEL})</p>
            <div className="flex items-end gap-3">
              {balance !== null
                ? <p className="text-3xl font-bold">{balance.toFixed(6)} <span className="text-lg text-muted-foreground">SOL</span></p>
                : error
                ? <p className="text-sm text-destructive">{error}</p>
                : <p className="text-sm text-muted-foreground">{loading ? "Loading…" : "—"}</p>
              }
              <Button variant="ghost" size="icon" className="mb-1 h-7 w-7" aria-label="Refresh balance" onClick={fetchBalance} disabled={loading}>
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>

          {/* Address */}
          <div className="p-4 rounded-xl border border-border bg-card space-y-2">
            <p className="text-xs text-muted-foreground uppercase tracking-widest">Receive Address</p>
            <div className="flex items-center gap-2">
              <p className="font-mono text-xs break-all flex-1">{solAccount.address}</p>
              <button onClick={copy} aria-label="Copy Solana address" className="shrink-0 p-1.5 rounded-lg hover:bg-secondary transition-colors">
                <Copy className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground">Derivation path: {solAccount.path}</p>
            <div className="flex gap-2 pt-1">
              <a href={explorerUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" className="gap-1.5 text-xs h-7">
                  <ExternalLink className="h-3 w-3" /> Explorer
                </Button>
              </a>
              {!ALLOW_SOL_MAINNET && (
                <a href={FAUCET_URL} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs h-7">
                    Devnet Faucet
                  </Button>
                </a>
              )}
            </div>
          </div>

          {/* Send */}
          <div className="p-4 rounded-xl border border-border bg-card space-y-2">
            <div className="flex items-center gap-2">
              <Send className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold">Send SOL</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Tap below to open the Send page with SOL pre-selected.
            </p>
            <Button
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => navigate("/send?asset=SOL")}
            >
              <Send className="h-3 w-3" /> Send SOL
            </Button>
          </div>
        </>
      )}

      {/* Status */}
      <div className="p-4 rounded-xl border border-border bg-card space-y-1.5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">What's real here</p>
        </div>
        <ul className="text-xs text-muted-foreground space-y-1">
          <li>✓ Address derived on-device from your seed (ed25519 SLIP-0010, same as Phantom)</li>
          <li>✓ Balance fetched live from Solana {NETWORK_LABEL.toLowerCase()} RPC — no constants</li>
          <li>✓ Derivation pinned against published SLIP-0010 test vectors</li>
          <li>✓ Send wired via the main Send page (SOL asset)</li>
        </ul>
      </div>
    </div>
  );
}
