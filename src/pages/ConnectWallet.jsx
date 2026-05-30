import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, Wallet, AlertCircle, ExternalLink, Plug } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

const PROVIDERS = [
  {
    id: "metamask",
    name: "MetaMask",
    description: "Connect your Ethereum/EVM wallet",
    icon: "/metamask.svg",
    emoji: "🦊",
    currencies: ["ETH"],
    detect: () => typeof window.ethereum !== "undefined" && window.ethereum.isMetaMask,
    installUrl: "https://metamask.io/download/",
  },
  {
    id: "phantom",
    name: "Phantom",
    description: "Connect your Solana wallet",
    icon: "/phantom.svg",
    emoji: "👻",
    currencies: ["SOL"],
    detect: () => typeof window.solana !== "undefined" && window.solana.isPhantom,
    installUrl: "https://phantom.app/",
  },
  {
    id: "coinbase",
    name: "Coinbase Wallet",
    description: "Connect your Coinbase smart wallet",
    emoji: "🔵",
    currencies: ["ETH", "USDC"],
    detect: () => typeof window.ethereum !== "undefined" && window.ethereum.isCoinbaseWallet,
    installUrl: "https://www.coinbase.com/wallet",
  },
];

async function connectMetaMask() {
  const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
  const address = accounts[0];
  const balanceHex = await window.ethereum.request({
    method: "eth_getBalance",
    params: [address, "latest"],
  });
  const balance = parseInt(balanceHex, 16) / 1e18;
  return [{ currency: "ETH", address, balance }];
}

async function connectPhantom() {
  const resp = await window.solana.connect();
  const address = resp.publicKey.toString();
  // Request balance via Solana JSON-RPC
  let balance = 0;
  try {
    const res = await fetch("https://api.mainnet-beta.solana.com", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getBalance", params: [address] }),
    });
    const data = await res.json();
    balance = (data.result?.value || 0) / 1e9;
  } catch {}
  return [{ currency: "SOL", address, balance }];
}

async function connectCoinbase() {
  const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
  const address = accounts[0];
  const balanceHex = await window.ethereum.request({
    method: "eth_getBalance",
    params: [address, "latest"],
  });
  const balance = parseInt(balanceHex, 16) / 1e18;
  return [{ currency: "ETH", address, balance }];
}

const CONNECTORS = { metamask: connectMetaMask, phantom: connectPhantom, coinbase: connectCoinbase };

export default function ConnectWallet() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [connecting, setConnecting] = useState(null);
  const [preview, setPreview] = useState(null); // { provider, assets: [{currency, address, balance}] }
  const [imported, setImported] = useState(false);

  const importMutation = useMutation({
    mutationFn: async ({ provider, assets }) => {
      await Promise.all(
        assets.map(asset =>
          base44.entities.Wallet.create({
            name: `${provider.name} — ${asset.currency}`,
            currency: asset.currency,
            address: asset.address,
            balance: asset.balance,
            passkey_registered: false,
          })
        )
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      setImported(true);
      toast.success("Wallet imported successfully");
    },
    onError: () => toast.error("Import failed"),
  });

  const handleConnect = async (provider) => {
    if (!provider.detect()) {
      window.open(provider.installUrl, "_blank");
      return;
    }
    setConnecting(provider.id);
    try {
      const assets = await CONNECTORS[provider.id]();
      setPreview({ provider, assets });
    } catch (e) {
      if (e.code !== 4001) toast.error(`Failed to connect ${provider.name}`);
    } finally {
      setConnecting(null);
    }
  };

  if (imported) {
    return (
      <div className="max-w-sm mx-auto text-center py-16 space-y-4">
        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
          <CheckCircle2 className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-xl font-bold">Wallet Imported!</h2>
        <p className="text-sm text-muted-foreground">
          Your {preview?.provider.name} assets are now in your dashboard.
        </p>
        <Button onClick={() => navigate("/")} className="w-full">Go to Dashboard</Button>
        <Button variant="outline" onClick={() => { setImported(false); setPreview(null); }} className="w-full">
          Connect Another
        </Button>
      </div>
    );
  }

  if (preview) {
    return (
      <div className="max-w-sm mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Import Assets</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Review what will be imported from {preview.provider.name}
          </p>
        </div>

        <div className="space-y-2">
          {preview.assets.map((asset, i) => (
            <div key={i} className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-xl">
                {preview.provider.emoji}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">{asset.currency}</p>
                <p className="text-xs text-muted-foreground font-mono truncate">{asset.address}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-bold">{asset.balance.toFixed(6)}</p>
                <p className="text-xs text-muted-foreground">{asset.currency}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="p-3 rounded-lg bg-secondary text-xs text-muted-foreground space-y-1">
          <p className="flex items-start gap-1.5"><AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />This imports a read-only snapshot of your on-chain balance. Transactions within this app are tracked separately.</p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => setPreview(null)}>Cancel</Button>
          <Button
            className="flex-1"
            disabled={importMutation.isPending}
            onClick={() => importMutation.mutate(preview)}
          >
            {importMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Import Wallet
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-sm mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Connect Wallet</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Import your existing crypto wallets</p>
      </div>

      <div className="space-y-3">
        {PROVIDERS.map(provider => {
          const detected = provider.detect();
          return (
            <button
              key={provider.id}
              onClick={() => handleConnect(provider)}
              disabled={connecting === provider.id}
              className="w-full flex items-center gap-4 p-4 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-primary/5 transition-all disabled:opacity-50 text-left group"
            >
              <div className="h-12 w-12 rounded-xl bg-secondary flex items-center justify-center text-2xl shrink-0">
                {provider.emoji}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-sm">{provider.name}</p>
                  {detected && (
                    <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">Detected</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{provider.description}</p>
                <div className="flex gap-1 mt-1">
                  {provider.currencies.map(c => (
                    <span key={c} className="text-[10px] bg-secondary text-muted-foreground px-1.5 py-0.5 rounded font-mono">{c}</span>
                  ))}
                </div>
              </div>
              <div className="shrink-0">
                {connecting === provider.id ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : detected ? (
                  <Plug className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                ) : (
                  <ExternalLink className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="p-4 rounded-xl border border-border bg-card/50 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">How it works</p>
        {[
          "Your wallet extension signs a connection request",
          "We read your public address and on-chain balance",
          "Your private keys never leave your device",
        ].map((s, i) => (
          <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
            <span className="h-4 w-4 rounded-full bg-primary/10 text-primary text-[10px] flex items-center justify-center shrink-0 mt-0.5 font-bold">{i + 1}</span>
            {s}
          </div>
        ))}
      </div>
    </div>
  );
}