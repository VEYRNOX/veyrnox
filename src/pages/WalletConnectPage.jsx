import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Scan, Link2, CheckCircle2, X, Wifi, WifiOff, AlertTriangle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import QRScanner from "../components/QRScanner";

const DAPP_EXAMPLES = [
  { name: "Uniswap", url: "https://app.uniswap.org", icon: "🦄", desc: "Decentralised exchange" },
  { name: "OpenSea", url: "https://opensea.io", icon: "🌊", desc: "NFT marketplace" },
  { name: "Aave", url: "https://app.aave.com", icon: "👻", desc: "DeFi lending" },
  { name: "Compound", url: "https://app.compound.finance", icon: "🏦", desc: "Yield protocol" },
];

export default function WalletConnectPage() {
  const [wcUri, setWcUri] = useState("");
  const [showScanner, setShowScanner] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [session, setSession] = useState(null);
  const [showPermissions, setShowPermissions] = useState(false);
  const [pendingDapp, setPendingDapp] = useState(null);

  const { data: wallets = [] } = useQuery({
    queryKey: ["wallets"],
    queryFn: () => base44.entities.Wallet.list(),
  });

  const primaryWallet = wallets.find(w => w.currency === "ETH") || wallets[0];

  const handleConnect = async () => {
    if (!wcUri.startsWith("wc:")) { toast.error("Invalid WalletConnect URI. Must start with wc:"); return; }
    setConnecting(true);
    // Parse dapp name from URI (simulated)
    const dappName = wcUri.includes("label=") ? decodeURIComponent(wcUri.split("label=")[1]?.split("&")[0] || "Unknown dApp") : "Unknown dApp";
    await new Promise(r => setTimeout(r, 1500)); // simulate handshake
    setPendingDapp({ name: dappName, uri: wcUri, permissions: ["eth_sendTransaction", "eth_sign", "personal_sign"] });
    setConnecting(false);
    setShowPermissions(true);
  };

  const approveSession = () => {
    setSession({
      dapp: pendingDapp.name,
      wallet: primaryWallet?.name || "ETH Wallet",
      address: primaryWallet?.address || "0x...",
      connectedAt: new Date().toISOString(),
      permissions: pendingDapp.permissions,
    });
    setShowPermissions(false);
    setPendingDapp(null);
    setWcUri("");
    toast.success(`Connected to ${pendingDapp.name}`);
  };

  const disconnect = () => { setSession(null); toast.success("Session disconnected"); };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Link2 className="h-6 w-6 text-primary" /> WalletConnect v2
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Connect to decentralised applications securely</p>
      </div>

      {/* Active Session */}
      {session ? (
        <div className="p-4 rounded-xl border border-green-500/30 bg-green-500/5 space-y-3">
          <div className="flex items-center gap-2">
            <Wifi className="h-4 w-4 text-green-400" />
            <p className="text-sm font-semibold text-green-400">Active Session</p>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">dApp</span><span className="font-medium">{session.dapp}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Wallet</span><span className="font-medium">{session.wallet}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Address</span><span className="font-mono text-xs truncate max-w-[180px]">{session.address}</span></div>
          </div>
          <div className="flex flex-wrap gap-1">
            {session.permissions.map(p => <span key={p} className="text-[10px] bg-green-500/10 text-green-400 px-2 py-0.5 rounded-full">{p}</span>)}
          </div>
          <Button variant="destructive" size="sm" className="w-full gap-2" onClick={disconnect}>
            <WifiOff className="h-3.5 w-3.5" /> Disconnect
          </Button>
        </div>
      ) : (
        <div className="p-4 rounded-xl border border-border bg-card space-y-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <WifiOff className="h-4 w-4" />
            <p className="text-sm">No active session</p>
          </div>
          <div>
            <Label>WalletConnect URI</Label>
            <div className="flex gap-2 mt-1.5">
              <Input value={wcUri} onChange={e => setWcUri(e.target.value)} placeholder="wc:abc123@2?relay-protocol=irn..." className="font-mono text-xs" />
              <Button variant="outline" size="icon" onClick={() => setShowScanner(true)}><Scan className="h-4 w-4" /></Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">Scan a QR code from a dApp or paste its WalletConnect URI</p>
          </div>
          {showScanner && <QRScanner onScan={v => { setWcUri(v); setShowScanner(false); }} onClose={() => setShowScanner(false)} />}
          {primaryWallet && (
            <div className="p-3 rounded-lg bg-secondary text-sm flex justify-between">
              <span className="text-muted-foreground">Connecting with</span>
              <span className="font-medium">{primaryWallet.name} ({primaryWallet.currency})</span>
            </div>
          )}
          <Button className="w-full gap-2" onClick={handleConnect} disabled={!wcUri || connecting || !primaryWallet}>
            {connecting ? <><span className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> Connecting…</> : <><Link2 className="h-4 w-4" /> Connect</>}
          </Button>
        </div>
      )}

      {/* Popular dApps */}
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground uppercase tracking-widest">Popular dApps</p>
        <div className="grid grid-cols-2 gap-3">
          {DAPP_EXAMPLES.map(d => (
            <a key={d.name} href={d.url} target="_blank" rel="noopener noreferrer" className="p-3 rounded-xl border border-border bg-card hover:border-primary/30 transition-colors flex items-center gap-3">
              <span className="text-2xl">{d.icon}</span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">{d.name}</p>
                <p className="text-[10px] text-muted-foreground">{d.desc}</p>
              </div>
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground ml-auto shrink-0" />
            </a>
          ))}
        </div>
      </div>

      {/* Security note */}
      <div className="flex gap-3 p-3 rounded-xl border border-yellow-500/20 bg-yellow-500/5">
        <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground">Only connect to trusted dApps. WalletConnect never exposes your private keys. Always review permissions before approving a session.</p>
      </div>

      {/* Approval Dialog */}
      <Dialog open={showPermissions} onOpenChange={setShowPermissions}>
        <DialogContent>
          <DialogHeader><DialogTitle>Connection Request</DialogTitle></DialogHeader>
          {pendingDapp && (
            <div className="space-y-4 pt-2">
              <div className="text-center space-y-1">
                <p className="text-lg font-bold">{pendingDapp.name}</p>
                <p className="text-xs text-muted-foreground">wants to connect to your wallet</p>
              </div>
              <div className="p-3 rounded-lg bg-secondary space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Requested permissions</p>
                {pendingDapp.permissions.map(p => (
                  <div key={p} className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                    <span className="font-mono text-xs">{p}</span>
                  </div>
                ))}
              </div>
              <div className="p-3 rounded-lg bg-secondary text-sm flex justify-between">
                <span className="text-muted-foreground">Wallet</span>
                <span className="font-medium">{primaryWallet?.name}</span>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => { setShowPermissions(false); setPendingDapp(null); }}><X className="h-4 w-4 mr-1.5" /> Reject</Button>
                <Button className="flex-1" onClick={approveSession}><CheckCircle2 className="h-4 w-4 mr-1.5" /> Approve</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}