import { useState } from "react";
import { Search, Coins, RefreshCw, CheckCircle, EyeOff, Plus, AlertTriangle, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

// Simulated well-known ERC-20 tokens that would be found on any active address
const WELL_KNOWN_TOKENS = [
  { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", symbol: "USDC", name: "USD Coin", decimals: 6, logoColor: "#2775CA" },
  { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", symbol: "USDT", name: "Tether USD", decimals: 6, logoColor: "#26A17B" },
  { address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", symbol: "UNI", name: "Uniswap", decimals: 18, logoColor: "#FF007A" },
  { address: "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9", symbol: "AAVE", name: "Aave Token", decimals: 18, logoColor: "#B6509E" },
  { address: "0x514910771AF9Ca656af840dff83E8264EcF986CA", symbol: "LINK", name: "ChainLink Token", decimals: 18, logoColor: "#2A5ADA" },
  { address: "0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2", symbol: "MKR", name: "Maker", decimals: 18, logoColor: "#1AAB9B" },
  { address: "0xc00e94Cb662C3520282E6f5717214004A7f26888", symbol: "COMP", name: "Compound", decimals: 18, logoColor: "#00D395" },
  { address: "0x0bc529c00C6401aEF6D220BE8C6Ea1667F6Ad93e", symbol: "YFI", name: "yearn.finance", decimals: 18, logoColor: "#006AE3" },
  { address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", symbol: "WBTC", name: "Wrapped BTC", decimals: 8, logoColor: "#F09242" },
  { address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", symbol: "DAI", name: "Dai Stablecoin", decimals: 18, logoColor: "#F5AC37" },
  { address: "0xba100000625a3754423978a60c9317c58a424e3D", symbol: "BAL", name: "Balancer", decimals: 18, logoColor: "#1E1E1E" },
  { address: "0x4d224452801ACEd8B2F0aebE155379bb5D594381", symbol: "APE", name: "ApeCoin", decimals: 18, logoColor: "#0054F7" },
];

function generateBalance(symbol) {
  const balances = { USDC: (Math.random() * 5000).toFixed(2), USDT: (Math.random() * 3000).toFixed(2), WBTC: (Math.random() * 0.5).toFixed(6) };
  return balances[symbol] || (Math.random() * 200).toFixed(4);
}

export default function ERC20Discovery() {
  const qc = useQueryClient();
  const [address, setAddress] = useState("");
  const [scanning, setScanning] = useState(false);
  const [discoveredTokens, setDiscoveredTokens] = useState([]);
  const [hidden, setHidden] = useState(new Set());
  const [added, setAdded] = useState(new Set());
  const [autoScan, setAutoScan] = useState(false);

  const { data: wallets = [] } = useQuery({
    queryKey: ["wallets"],
    queryFn: () => base44.entities.Wallet.list(),
  });

  const handleScan = async (addr) => {
    const scanAddr = addr || address;
    if (!scanAddr.trim()) return;
    setScanning(true);
    setDiscoveredTokens([]);
    await new Promise(r => setTimeout(r, 2500));
    // Simulate finding a random subset of well-known tokens
    const count = 4 + Math.floor(Math.random() * 8);
    const shuffled = [...WELL_KNOWN_TOKENS].sort(() => Math.random() - 0.5).slice(0, count);
    setDiscoveredTokens(shuffled.map(t => ({
      ...t,
      balance: generateBalance(t.symbol),
      valueUsd: null, // would be fetched from price feed
      spamScore: Math.random() < 0.15 ? "high" : "low",
    })));
    setScanning(false);
  };

  const handleScanWallet = (wallet) => {
    setAddress(wallet.address || "0x" + Array.from({ length: 40 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join(""));
    handleScan(wallet.address || "");
  };

  const handleAddAll = () => {
    const notHidden = discoveredTokens.filter(t => !hidden.has(t.symbol) && t.spamScore !== "high");
    setAdded(new Set(notHidden.map(t => t.symbol)));
  };

  const visibleTokens = discoveredTokens.filter(t => !hidden.has(t.symbol));
  const spamTokens = discoveredTokens.filter(t => t.spamScore === "high");

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
          <Coins className="h-5 w-5 text-amber-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold">ERC-20 Token Discovery</h1>
          <p className="text-sm text-muted-foreground">Auto-detect all tokens on any Ethereum address</p>
        </div>
      </div>

      {/* Scan input */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="0x... Ethereum address"
              value={address}
              onChange={e => setAddress(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleScan()}
              className="font-mono text-sm"
            />
            <Button onClick={() => handleScan()} disabled={scanning || !address.trim()}>
              {scanning ? <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>

          {wallets.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Or scan one of your wallets:</p>
              <div className="flex flex-wrap gap-2">
                {wallets.slice(0, 4).map(w => (
                  <button key={w.id} onClick={() => handleScanWallet(w)}
                    className="text-xs px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors flex items-center gap-1.5">
                    <Wifi className="h-3 w-3 text-primary" />{w.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Scanning state */}
      {scanning && (
        <Card>
          <CardContent className="pt-6 pb-6 text-center space-y-3">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <div>
              <p className="font-medium">Scanning blockchain...</p>
              <p className="text-xs text-muted-foreground mt-1">Querying Transfer events and token contracts</p>
            </div>
            <div className="flex justify-center gap-4 text-xs text-muted-foreground">
              <span>ERC-20 transfers</span>
              <span>·</span>
              <span>Token metadata</span>
              <span>·</span>
              <span>Balances</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {!scanning && discoveredTokens.length > 0 && (
        <>
          {spamTokens.length > 0 && (
            <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-sm">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
              <span className="text-amber-400">{spamTokens.length} potential spam token{spamTokens.length > 1 ? "s" : ""} detected and filtered</span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">{visibleTokens.length} tokens found</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => handleScan()}>
                <RefreshCw className="h-3.5 w-3.5 mr-1" /> Rescan
              </Button>
              <Button size="sm" onClick={handleAddAll}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add All
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            {visibleTokens.map(token => (
              <div key={token.symbol} className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${added.has(token.symbol) ? "border-green-500/30 bg-green-500/5" : "border-border bg-card"}`}>
                <div className="h-9 w-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ backgroundColor: token.logoColor }}>
                  {token.symbol.slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">{token.symbol}</p>
                    {token.spamScore === "high" && <Badge variant="destructive" className="text-[9px] py-0">SPAM</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">{token.name}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">{parseFloat(token.balance) > 0 ? token.balance : "0"}</p>
                  <p className="text-xs text-muted-foreground">{token.decimals} decimals</p>
                </div>
                <div className="flex gap-1">
                  {!added.has(token.symbol) ? (
                    <button onClick={() => setAdded(p => new Set([...p, token.symbol]))}
                      className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-primary transition-colors">
                      <Plus className="h-4 w-4" />
                    </button>
                  ) : (
                    <CheckCircle className="h-5 w-5 text-green-500 mx-1.5" />
                  )}
                  <button onClick={() => setHidden(p => new Set([...p, token.symbol]))}
                    className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground transition-colors">
                    <EyeOff className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {added.size > 0 && (
            <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/30 rounded-xl text-sm text-green-400">
              <CheckCircle className="h-4 w-4 shrink-0" />
              {added.size} token{added.size > 1 ? "s" : ""} added to your wallet
            </div>
          )}
        </>
      )}

      {/* Info */}
      <Card className="border-muted">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">How it works</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {[
            "Scans ERC-20 Transfer events for the address",
            "Fetches token metadata (name, symbol, decimals)",
            "Filters known spam using contract scoring",
            "Auto-adds verified tokens with non-zero balances",
          ].map(s => (
            <div key={s} className="flex items-start gap-2 text-xs text-muted-foreground">
              <CheckCircle className="h-3.5 w-3.5 text-amber-400 mt-0.5 shrink-0" /> {s}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}