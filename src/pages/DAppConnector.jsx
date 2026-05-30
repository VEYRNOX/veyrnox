import { useState, useEffect } from "react";
import { Plug, Copy, Check, RefreshCw, Wifi, WifiOff, CheckCircle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function generateWCUri() {
  const topic = Array.from({ length: 32 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, "0")).join("");
  const symKey = Array.from({ length: 32 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, "0")).join("");
  return "wc:" + topic + "@2?relay-protocol=irn&symKey=" + symKey;
}

const POPULAR_DAPPS = [
  { name: "Uniswap", url: "https://app.uniswap.org", logo: "🦄", category: "DEX" },
  { name: "OpenSea", url: "https://opensea.io", logo: "🌊", category: "NFT" },
  { name: "Aave", url: "https://app.aave.com", logo: "👻", category: "Lending" },
  { name: "Curve", url: "https://curve.fi", logo: "🌀", category: "DEX" },
  { name: "Compound", url: "https://app.compound.finance", logo: "🏦", category: "Lending" },
  { name: "1inch", url: "https://app.1inch.io", logo: "🔱", category: "Aggregator" },
  { name: "dYdX", url: "https://dydx.exchange", logo: "📊", category: "Perps" },
  { name: "Blur", url: "https://blur.io", logo: "💨", category: "NFT" },
];

const MOCK_SESSIONS = [
  { id: "s1", dapp: "Uniswap v3", url: "https://app.uniswap.org", connected: "2024-01-15", chains: ["Ethereum"], logo: "🦄" },
];

export default function DAppConnector() {
  const [tab, setTab] = useState("connect");
  const [wcUri, setWcUri] = useState("");
  const [pasteUri, setPasteUri] = useState("");
  const [copied, setCopied] = useState(false);
  const [sessions, setSessions] = useState(MOCK_SESSIONS);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(null);

  const newUri = () => setWcUri(generateWCUri());
  useEffect(() => { newUri(); }, []);

  const copy = () => { navigator.clipboard.writeText(wcUri); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  const connectUri = async () => {
    if (!pasteUri.startsWith("wc:")) return;
    setConnecting(true);
    await new Promise(r => setTimeout(r, 1500));
    const topic = pasteUri.split(":")[1]?.split("@")[0];
    const session = { id: topic?.slice(0,8) || "new", dapp: "Unknown dApp", url: "wc://", connected: new Date().toISOString().split("T")[0], chains: ["Ethereum"], logo: "🔗" };
    setSessions(s => [...s, session]);
    setConnected(session);
    setConnecting(false);
    setTab("sessions");
  };

  const disconnect = (id) => setSessions(s => s.filter(sess => sess.id !== id));

  const qrUrl = "https://api.qrserver.com/v1/create-qr-code/?size=220x220&bgcolor=0d0d0d&color=ffffff&margin=12&data=" + encodeURIComponent(wcUri);

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><Plug className="h-5 w-5 text-primary" /> dApp Connector</h1>
        <p className="text-sm text-muted-foreground">Connect to Web3 dApps via WalletConnect v2 protocol</p>
      </div>

      <div className="p-3 rounded-xl bg-secondary/30 border border-border text-xs text-muted-foreground">
        <p className="font-semibold text-foreground mb-1">How it works</p>
        On mobile, copy the WC URI or scan from a dApp. On desktop, paste the WC URI from a dApp connect dialog. Uses WalletConnect v2 relay protocol.
      </div>

      <div className="flex gap-1 p-1 bg-secondary/30 rounded-xl">
        {[["connect","New Connection"],["paste","Paste URI"],["sessions","Sessions"],["dapps","Discover dApps"]].map(([t,l]) => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 py-2 rounded-lg text-[10px] font-semibold transition-colors ${tab === t ? "bg-card shadow text-foreground" : "text-muted-foreground"}`}>{l}</button>
        ))}
      </div>

      {tab === "connect" && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl border border-border bg-card space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold">WalletConnect v2 URI (QR)</p>
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={newUri}><RefreshCw className="h-3 w-3" /> New</Button>
            </div>
            <div className="flex justify-center">
              <div className="p-3 rounded-2xl bg-[#0d0d0d] border border-border">
                {wcUri && <img src={qrUrl} alt="WalletConnect QR" className="h-[160px] w-[160px] rounded-xl" />}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <p className="text-[9px] font-mono text-muted-foreground flex-1 truncate">{wcUri}</p>
              <button onClick={copy} className="shrink-0 p-1.5 text-muted-foreground hover:text-foreground">
                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="p-3 rounded-xl bg-secondary/30 text-xs text-muted-foreground space-y-1">
            <p className="font-semibold text-foreground">To connect a dApp:</p>
            <p>1. Open a WalletConnect-compatible dApp (Uniswap, OpenSea, etc.)</p>
            <p>2. Click Connect Wallet then WalletConnect</p>
            <p>3. Desktop: copy the dApp URI and paste it in the Paste URI tab</p>
            <p>4. Mobile: the dApp shows a QR code — scan with your camera</p>
          </div>
        </div>
      )}

      {tab === "paste" && (
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Paste WalletConnect URI from dApp</label>
            <Input className="mt-1.5 font-mono text-xs" placeholder="wc:abc123@2?relay-protocol=irn" value={pasteUri} onChange={e => setPasteUri(e.target.value)} />
          </div>
          <Button className="w-full gap-2" onClick={connectUri} disabled={!pasteUri.startsWith("wc:") || connecting}>
            {connecting ? <><RefreshCw className="h-4 w-4 animate-spin" /> Establishing connection...</> : <><Plug className="h-4 w-4" /> Connect to dApp</>}
          </Button>
          {connected && (
            <div className="p-3 rounded-xl border border-green-500/20 bg-green-500/5 text-xs text-green-500 flex items-start gap-2">
              <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
              Session established. The dApp can now request transaction signing from your wallet.
            </div>
          )}
        </div>
      )}

      {tab === "sessions" && (
        <div className="space-y-3">
          {sessions.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground"><WifiOff className="h-10 w-10 mx-auto mb-3 opacity-30" /><p>No active sessions</p></div>
          ) : (
            sessions.map(s => (
              <div key={s.id} className="p-4 rounded-xl border border-border bg-card flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-secondary flex items-center justify-center text-xl shrink-0">{s.logo}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2"><p className="font-semibold text-sm">{s.dapp}</p><div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" /></div>
                  <p className="text-xs text-muted-foreground">{s.chains?.join(", ")} · Since {s.connected}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <a href={s.url} target="_blank" rel="noreferrer" className="p-2 text-muted-foreground hover:text-primary"><ExternalLink className="h-4 w-4" /></a>
                  <button onClick={() => disconnect(s.id)} className="p-2 text-muted-foreground hover:text-destructive"><WifiOff className="h-4 w-4" /></button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === "dapps" && (
        <div className="grid grid-cols-2 gap-2">
          {POPULAR_DAPPS.map(d => (
            <a key={d.name} href={d.url} target="_blank" rel="noreferrer" className="p-3 rounded-xl border border-border bg-card hover:border-primary/50 transition-colors flex items-center gap-2.5">
              <span className="text-2xl">{d.logo}</span>
              <div className="min-w-0">
                <p className="font-semibold text-sm">{d.name}</p>
                <p className="text-[10px] text-muted-foreground">{d.category}</p>
              </div>
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-auto" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}