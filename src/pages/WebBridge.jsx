import { useState, useEffect, useRef } from "react";
import { Wifi, WifiOff, QrCode, Copy, CheckCircle, Shield, Clock, Smartphone, Monitor, RefreshCw, X, Link2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

// Generate a pairing URI similar to WalletConnect format but for Veyrnox Web
function generateBridgeUri(sessionId) {
  return `veyrnox://bridge?id=${sessionId}&relay=wss://bridge.veyrnox.app&key=${Array.from({ length: 32 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("")}`;
}

function generateSessionId() {
  return Array.from({ length: 16 }, () => Math.floor(Math.random() * 36).toString(36)).join("");
}

// Simple canvas-based QR code
function QRCanvas({ data, size = 180 }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const cellSize = Math.floor(size / 25);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#000000";
    // Deterministic pseudo-random grid from data string
    let hash = 0;
    for (let i = 0; i < data.length; i++) { hash = ((hash << 5) - hash) + data.charCodeAt(i); hash |= 0; }
    for (let r = 0; r < 25; r++) {
      for (let c = 0; c < 25; c++) {
        const bit = ((hash ^ (r * 31 + c * 17)) & 1);
        if (bit || (r < 7 && c < 7) || (r < 7 && c > 17) || (r > 17 && c < 7)) {
          ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
        }
      }
    }
  }, [data, size]);
  return <canvas ref={canvasRef} width={size} height={size} className="rounded-lg" />;
}

const PENDING_REQUESTS = [
  { id: "req1", type: "eth_sign", app: "Uniswap", details: "Sign permit for USDC", time: "2s ago" },
  { id: "req2", type: "eth_sendTransaction", app: "Aave", details: "Supply 0.5 ETH", time: "5s ago" },
];

export default function WebBridge() {
  const [sessionId] = useState(generateSessionId);
  const uri = generateBridgeUri(sessionId);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState("waiting"); // waiting | paired | disconnected
  const [pairedApp, setPairedApp] = useState(null);
  const [requests, setRequests] = useState([]);
  const [approved, setApproved] = useState(new Set());
  const [rejected, setRejected] = useState(new Set());
  const [tab, setTab] = useState("qr"); // qr | uri

  const { data: wallets = [] } = useQuery({
    queryKey: ["wallets"],
    queryFn: () => base44.entities.Wallet.list(),
  });

  // Simulate connection after 5 seconds on "waiting"
  useEffect(() => {
    if (status !== "waiting") return;
    const t = setTimeout(() => {
      setStatus("paired");
      setPairedApp({ name: "Veyrnox Web", url: "app.veyrnox.com", icon: "🛡️" });
      setRequests(PENDING_REQUESTS);
    }, 6000);
    return () => clearTimeout(t);
  }, [status]);

  const handleCopy = () => {
    navigator.clipboard.writeText(uri);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDisconnect = () => {
    setStatus("disconnected");
    setPairedApp(null);
    setRequests([]);
  };

  const handleReconnect = () => {
    setStatus("waiting");
    setApproved(new Set());
    setRejected(new Set());
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-cyan-500/10 flex items-center justify-center">
          <Link2 className="h-5 w-5 text-cyan-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Veyrnox Web Bridge</h1>
          <p className="text-sm text-muted-foreground">Pair your mobile wallet with the web dashboard</p>
        </div>
      </div>

      {/* Status banner */}
      <Card className={`border-2 ${status === "paired" ? "border-green-500/40 bg-green-500/5" : status === "disconnected" ? "border-destructive/30 bg-destructive/5" : "border-primary/20 bg-primary/5"}`}>
        <CardContent className="pt-4 flex items-center gap-3">
          {status === "waiting" && <><div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" /><div><p className="font-semibold text-sm">Waiting for connection</p><p className="text-xs text-muted-foreground">Scan the QR code on the web dashboard</p></div></>}
          {status === "paired" && <><CheckCircle className="h-5 w-5 text-green-500 shrink-0" /><div className="flex-1"><p className="font-semibold text-sm text-green-400">Connected to {pairedApp?.name}</p><p className="text-xs text-muted-foreground">{pairedApp?.url}</p></div><Button size="sm" variant="ghost" className="text-destructive" onClick={handleDisconnect}><WifiOff className="h-4 w-4" /></Button></>}
          {status === "disconnected" && <><WifiOff className="h-5 w-5 text-destructive shrink-0" /><div className="flex-1"><p className="font-semibold text-sm">Disconnected</p></div><Button size="sm" onClick={handleReconnect}><RefreshCw className="h-3.5 w-3.5 mr-1" />Reconnect</Button></>}
        </CardContent>
      </Card>

      {status !== "paired" && (
        <>
          {/* Tab toggle */}
          <div className="flex rounded-lg border border-border p-1 gap-1">
            {["qr", "uri"].map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {t === "qr" ? "QR Code" : "Manual URI"}
              </button>
            ))}
          </div>

          {tab === "qr" ? (
            <Card>
              <CardContent className="pt-6 flex flex-col items-center gap-4">
                <div className="p-3 bg-white rounded-xl">
                  <QRCanvas data={uri} size={180} />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold">Scan with Veyrnox Web</p>
                  <p className="text-xs text-muted-foreground mt-1">Open <strong>app.veyrnox.com</strong> in your browser and click "Connect Mobile Wallet"</p>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1"><Clock className="h-3 w-3" /> Expires in 5 min</div>
                  <div className="flex items-center gap-1"><Shield className="h-3 w-3 text-green-400" /> End-to-end encrypted</div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-4 space-y-3">
                <p className="text-xs text-muted-foreground">Copy and paste this URI into the web dashboard:</p>
                <div className="p-3 bg-secondary rounded-lg">
                  <code className="text-xs font-mono break-all text-muted-foreground">{uri}</code>
                </div>
                <Button variant="outline" className="w-full" onClick={handleCopy}>
                  {copied ? <><CheckCircle className="h-4 w-4 mr-2 text-green-500" />Copied!</> : <><Copy className="h-4 w-4 mr-2" />Copy Pairing URI</>}
                </Button>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Pending requests when paired */}
      {status === "paired" && requests.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              Pending Requests
              <Badge className="text-xs">{requests.filter(r => !approved.has(r.id) && !rejected.has(r.id)).length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {requests.map(req => {
              const isApproved = approved.has(req.id);
              const isRejected = rejected.has(req.id);
              return (
                <div key={req.id} className={`p-3 rounded-xl border transition-colors ${isApproved ? "border-green-500/30 bg-green-500/5" : isRejected ? "border-destructive/30 bg-destructive/5 opacity-60" : "border-border"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] font-mono">{req.type}</Badge>
                        <span className="text-xs text-muted-foreground">{req.time}</span>
                      </div>
                      <p className="text-sm font-semibold mt-1">{req.app}</p>
                      <p className="text-xs text-muted-foreground">{req.details}</p>
                    </div>
                    {!isApproved && !isRejected && (
                      <div className="flex gap-2 shrink-0">
                        <Button size="sm" variant="outline" className="text-destructive border-destructive/40" onClick={() => setRejected(p => new Set([...p, req.id]))}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" onClick={() => setApproved(p => new Set([...p, req.id]))}>
                          <CheckCircle className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                    {isApproved && <Badge className="bg-green-500/10 text-green-500 border-green-500/30 text-xs shrink-0">Approved</Badge>}
                    {isRejected && <Badge variant="destructive" className="text-xs shrink-0">Rejected</Badge>}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {status === "paired" && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Session Info</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Session ID</span><code className="text-xs font-mono">{sessionId.slice(0, 12)}...</code></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Wallet</span><span>{wallets[0]?.name || "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Connected app</span><span className="flex items-center gap-1">{pairedApp?.icon} {pairedApp?.url}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Encryption</span><span className="text-green-400 flex items-center gap-1"><Shield className="h-3.5 w-3.5" />E2E encrypted</span></div>
          </CardContent>
        </Card>
      )}

      {/* How it works */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">How the Web Bridge works</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {[
            { icon: "📱", text: "Mobile wallet generates a unique encrypted session key" },
            { icon: "🖥️", text: "Web dashboard scans QR code to establish a secure tunnel" },
            { icon: "🔐", text: "All transaction signing stays on your phone — keys never leave" },
            { icon: "⚡", text: "Approve or reject web requests directly on mobile" },
          ].map(s => (
            <div key={s.text} className="flex items-start gap-2 text-xs text-muted-foreground">
              <span className="shrink-0">{s.icon}</span>{s.text}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}