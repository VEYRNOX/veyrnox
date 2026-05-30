import { useState } from "react";
import { Search, Compass, ArrowRight, Clock, CheckCircle, XCircle, ArrowDownUp, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const NETWORKS = ["Ethereum", "BSC", "Polygon", "Arbitrum", "Optimism", "Solana"];

function randomHash() { return "0x" + Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join(""); }
function randomAddr() { return "0x" + Array.from({ length: 40 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join(""); }
function randomBlock() { return Math.floor(19000000 + Math.random() * 1000000); }

function generateMockTx(hash) {
  return {
    hash,
    status: Math.random() > 0.1 ? "success" : "failed",
    block: randomBlock(),
    timestamp: new Date(Date.now() - Math.random() * 86400000 * 30).toLocaleString(),
    from: randomAddr(),
    to: randomAddr(),
    value: (Math.random() * 2).toFixed(6) + " ETH",
    gasUsed: Math.floor(21000 + Math.random() * 200000).toLocaleString(),
    gasPrice: (10 + Math.random() * 30).toFixed(2) + " Gwei",
    fee: (Math.random() * 0.01).toFixed(6) + " ETH",
    nonce: Math.floor(Math.random() * 200),
    inputData: Math.random() > 0.5 ? "0x" + Array.from({ length: 16 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("") + "..." : "0x (ETH Transfer)",
  };
}

function generateMockBlock(num) {
  const txCount = Math.floor(100 + Math.random() * 300);
  return {
    number: num,
    hash: randomHash(),
    parentHash: randomHash(),
    timestamp: new Date(Date.now() - Math.random() * 3600000).toLocaleString(),
    miner: randomAddr(),
    gasUsed: Math.floor(8000000 + Math.random() * 6000000).toLocaleString(),
    gasLimit: "15,000,000",
    txCount,
    size: Math.floor(30 + Math.random() * 100) + " KB",
    baseFee: (10 + Math.random() * 20).toFixed(2) + " Gwei",
  };
}

function generateMockAddr(addr) {
  const txCount = Math.floor(50 + Math.random() * 500);
  return {
    address: addr,
    balance: (Math.random() * 10).toFixed(6) + " ETH",
    balanceUsd: "$" + (Math.random() * 20000).toFixed(2),
    txCount,
    firstSeen: new Date(Date.now() - Math.random() * 365 * 3 * 86400000).toLocaleDateString(),
    lastSeen: new Date(Date.now() - Math.random() * 86400000 * 7).toLocaleDateString(),
    tokens: Math.floor(Math.random() * 20),
    isContract: Math.random() > 0.7,
  };
}

export default function BlockExplorer() {
  const [query, setQuery] = useState("");
  const [network, setNetwork] = useState("Ethereum");
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState(null);
  const [resultType, setResultType] = useState(null);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setResult(null);
    await new Promise(r => setTimeout(r, 800));
    const q = query.trim();
    if (q.startsWith("0x") && q.length === 66) {
      setResultType("tx");
      setResult(generateMockTx(q));
    } else if (q.startsWith("0x") && q.length === 42) {
      setResultType("address");
      setResult(generateMockAddr(q));
    } else if (/^\d+$/.test(q)) {
      setResultType("block");
      setResult(generateMockBlock(parseInt(q)));
    } else {
      setResultType("notfound");
      setResult(null);
    }
    setSearching(false);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-teal-500/10 flex items-center justify-center">
          <Compass className="h-5 w-5 text-teal-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold">SafeDigital Block Explorer</h1>
          <p className="text-sm text-muted-foreground">Search transactions, addresses, and blocks</p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Tx hash / Address (0x...) / Block number"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSearch()}
              className="font-mono text-sm flex-1"
            />
            <Select value={network} onValueChange={setNetwork}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>{NETWORKS.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
            </Select>
            <Button onClick={handleSearch} disabled={searching || !query.trim()}>
              {searching ? <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Search by: transaction hash · wallet address · block number · ENS name</p>
        </CardContent>
      </Card>

      {resultType === "notfound" && (
        <Card className="border-amber-500/20 bg-amber-500/10">
          <CardContent className="pt-4 text-sm text-amber-400">No results found. Try a full 0x... address or transaction hash.</CardContent>
        </Card>
      )}

      {resultType === "tx" && result && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">Transaction</CardTitle>
              <Badge className={result.status === "success" ? "bg-green-500/10 text-green-500" : "bg-destructive/10 text-destructive"}>
                {result.status === "success" ? <><CheckCircle className="h-3 w-3 mr-1" />Success</> : <><XCircle className="h-3 w-3 mr-1" />Failed</>}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {[["Hash", result.hash, true], ["Block", result.block], ["Timestamp", result.timestamp], ["From", result.from, true], ["To", result.to, true], ["Value", result.value], ["Gas Used", result.gasUsed], ["Gas Price", result.gasPrice], ["Fee", result.fee], ["Nonce", result.nonce], ["Input", result.inputData, true]].map(([k, v, mono]) => (
              <div key={k} className="flex gap-3 text-sm border-b border-border pb-2 last:border-0 last:pb-0">
                <span className="text-muted-foreground w-24 shrink-0">{k}</span>
                <span className={`flex-1 truncate ${mono ? "font-mono text-xs" : ""}`}>{String(v)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {resultType === "address" && result && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">Address</CardTitle>
              {result.isContract && <Badge variant="outline" className="text-xs">Contract</Badge>}
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="p-3 bg-secondary/50 rounded-xl"><p className="text-xs text-muted-foreground">Balance</p><p className="font-bold">{result.balance}</p><p className="text-xs text-muted-foreground">{result.balanceUsd}</p></div>
              <div className="p-3 bg-secondary/50 rounded-xl"><p className="text-xs text-muted-foreground">Transactions</p><p className="font-bold">{result.txCount.toLocaleString()}</p><p className="text-xs text-muted-foreground">{result.tokens} tokens</p></div>
            </div>
            {[["Address", result.address, true], ["First Seen", result.firstSeen], ["Last Seen", result.lastSeen], ["Type", result.isContract ? "Smart Contract" : "EOA (Wallet)"]].map(([k, v, mono]) => (
              <div key={k} className="flex gap-3 text-sm border-b border-border pb-2 last:border-0 last:pb-0">
                <span className="text-muted-foreground w-24 shrink-0">{k}</span>
                <span className={`flex-1 truncate ${mono ? "font-mono text-xs" : ""}`}>{v}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {resultType === "block" && result && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Block #{result.number.toLocaleString()}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              {[["Transactions", result.txCount], ["Gas Used", result.gasUsed], ["Base Fee", result.baseFee], ["Size", result.size]].map(([k, v]) => (
                <div key={k} className="p-2 bg-secondary/50 rounded-lg text-center"><p className="text-xs text-muted-foreground">{k}</p><p className="text-sm font-bold">{v}</p></div>
              ))}
            </div>
            {[["Hash", result.hash, true], ["Parent", result.parentHash, true], ["Timestamp", result.timestamp], ["Miner", result.miner, true], ["Gas Limit", result.gasLimit]].map(([k, v, mono]) => (
              <div key={k} className="flex gap-3 text-sm border-b border-border pb-2 last:border-0 last:pb-0">
                <span className="text-muted-foreground w-24 shrink-0">{k}</span>
                <span className={`flex-1 truncate ${mono ? "font-mono text-xs" : ""}`}>{v}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Quick links */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Try these examples</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {["19234567", "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", "0xa9059cbb2ab09eb219583f4a59a5d0623ade346d2b28584e2958d1f4d3c6a4aa"].map(ex => (
            <button key={ex} onClick={() => { setQuery(ex); }}
              className="text-xs px-2 py-1 rounded bg-secondary hover:bg-secondary/80 font-mono truncate max-w-[200px]">
              {ex.length > 24 ? ex.slice(0, 12) + "..." + ex.slice(-6) : ex}
            </button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}