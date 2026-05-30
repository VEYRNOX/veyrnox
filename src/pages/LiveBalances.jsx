import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Search, Wifi, RefreshCw, ExternalLink, Loader2, Coins, Image, AlertTriangle, CheckCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const NETWORKS = [
  { id: "ethereum", label: "Ethereum", symbol: "ETH", explorer: "https://etherscan.io/address/" },
  { id: "polygon", label: "Polygon", symbol: "MATIC", explorer: "https://polygonscan.com/address/" },
  { id: "bsc", label: "BNB Chain", symbol: "BNB", explorer: "https://bscscan.com/address/" },
  { id: "arbitrum", label: "Arbitrum", symbol: "ETH", explorer: "https://arbiscan.io/address/" },
];

const DEMO_ADDR = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"; // Vitalik

export default function LiveBalances() {
  const [address, setAddress] = useState(DEMO_ADDR);
  const [network, setNetwork] = useState("ethereum");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [tokens, setTokens] = useState([]);
  const [gasData, setGasData] = useState(null);
  const [error, setError] = useState("");

  const fetchAll = async () => {
    if (!address.trim()) return;
    setLoading(true);
    setError("");
    setData(null);
    setTokens([]);
    try {
      // Live ETH balance via RPC proxy
      const balRes = await base44.functions.invoke("rpcProxy", { action: "balance", address: address.trim(), network });
      setData(balRes.data);

      // Gas price
      const gasRes = await base44.functions.invoke("rpcProxy", { action: "gas_price" });
      setGasData(gasRes.data);

      // Token discovery via Ethplorer (ETH only)
      if (network === "ethereum") {
        const tokRes = await base44.functions.invoke("rpcProxy", { action: "tokens", address: address.trim() });
        const tokData = tokRes.data;
        if (tokData?.tokens) setTokens(tokData.tokens);
      }
    } catch (e) {
      setError(e.message || "Failed to fetch data");
    }
    setLoading(false);
  };

  const net = NETWORKS.find(n => n.id === network);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><Wifi className="h-5 w-5 text-primary" /> Live RPC Balances</h1>
        <p className="text-sm text-muted-foreground">Real on-chain data via Ankr public RPC + Ethplorer API</p>
      </div>

      {/* Status indicators */}
      <div className="flex gap-2 flex-wrap">
        {["Ankr RPC","Ethplorer API","Multi-chain"].map(s => (
          <span key={s} className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-full border border-green-500/30 bg-green-500/5 text-green-500 font-semibold">
            <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" /> {s}
          </span>
        ))}
      </div>

      {/* Input row */}
      <div className="flex gap-2">
        <Input placeholder="0x... Ethereum address" value={address} onChange={e => setAddress(e.target.value)} className="font-mono text-xs flex-1" onKeyDown={e => e.key === "Enter" && fetchAll()} />
        <Select value={network} onValueChange={setNetwork}>
          <SelectTrigger className="w-36 shrink-0"><SelectValue /></SelectTrigger>
          <SelectContent>{NETWORKS.map(n => <SelectItem key={n.id} value={n.id}>{n.label}</SelectItem>)}</SelectContent>
        </Select>
        <Button onClick={fetchAll} disabled={loading} className="shrink-0 gap-1">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        </Button>
      </div>

      {/* Quick addresses */}
      <div className="flex flex-wrap gap-2">
        {[
          { label: "Vitalik.eth", addr: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" },
          { label: "Binance Hot", addr: "0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8" },
          { label: "Uniswap V3", addr: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45" },
        ].map(q => (
          <button key={q.addr} onClick={() => { setAddress(q.addr); setNetwork("ethereum"); }} className="text-[10px] px-2 py-1 rounded-lg border border-border bg-card text-muted-foreground hover:text-primary hover:border-primary transition-colors font-mono">{q.label}</button>
        ))}
      </div>

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
                <p className="text-xs text-muted-foreground mt-1 font-mono">{data.address}</p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <a href={`${net?.explorer}${data.address}`} target="_blank" rel="noreferrer" className="p-2 rounded-lg border border-border bg-card text-muted-foreground hover:text-primary">
                  <ExternalLink className="h-4 w-4" />
                </a>
                <div className="flex items-center gap-1 text-[10px] text-green-500 font-semibold"><CheckCircle className="h-3 w-3" /> Live</div>
              </div>
            </div>
            {gasData && (
              <div className="flex items-center gap-4 pt-2 border-t border-border text-xs text-muted-foreground">
                <span>Gas Price: <span className="font-semibold text-foreground">{parseFloat(gasData.gwei).toFixed(2)} Gwei</span></span>
                <span className="h-3 w-px bg-border" />
                <span>Network: <span className="font-semibold text-green-500">{net?.label} · Live</span></span>
              </div>
            )}
          </div>

          {/* Tokens */}
          {tokens.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Coins className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-semibold">{tokens.length} ERC-20 Tokens Discovered</p>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">via Ethplorer</span>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {tokens.slice(0, 30).map((t, i) => {
                  const info = t.tokenInfo;
                  const bal = parseFloat(t.balance) / Math.pow(10, parseInt(info?.decimals) || 18);
                  const usd = t.rawBalance ? (parseFloat(t.rawBalance) / Math.pow(10, parseInt(info?.decimals) || 18)) * (info?.price?.rate || 0) : 0;
                  return (
                    <div key={i} className="p-3 rounded-xl border border-border bg-card flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center text-xs font-bold shrink-0">
                        {info?.symbol?.slice(0, 2) || "?"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">{info?.symbol || "Unknown"}</p>
                        <p className="text-xs text-muted-foreground truncate">{info?.name}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-semibold text-sm">{bal >= 0.0001 ? bal.toFixed(4) : bal.toExponential(2)}</p>
                        {usd > 0.01 && <p className="text-xs text-muted-foreground">${usd.toFixed(2)}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
              {tokens.length > 30 && <p className="text-xs text-muted-foreground text-center">+{tokens.length - 30} more tokens</p>}
            </div>
          )}

          {network === "ethereum" && tokens.length === 0 && !loading && (
            <div className="p-4 rounded-xl border border-border bg-card text-xs text-muted-foreground text-center">
              No ERC-20 tokens found for this address on Ethereum mainnet.
            </div>
          )}
        </>
      )}
    </div>
  );
}