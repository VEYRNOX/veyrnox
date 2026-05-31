import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Copy, CheckCircle2 } from "lucide-react";
import QRCodeDisplay from "../components/QRCodeDisplay";
import CoinLogo from "@/components/CoinLogo";
import { toast } from "sonner";

export default function ReceiveCrypto() {
  const [walletId, setWalletId] = useState("");
  const [copied, setCopied] = useState(false);

  const { data: wallets = [] } = useQuery({
    queryKey: ["wallets"],
    queryFn: () => base44.entities.Wallet.list(),
  });

  const selectedWallet = wallets.find(w => w.id === walletId);

  const copyAddress = () => {
    if (!selectedWallet) return;
    navigator.clipboard.writeText(selectedWallet.address);
    setCopied(true);
    toast.success("Address copied");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-md mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Receive Crypto</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Share your wallet address</p>
      </div>

      <div className="space-y-4 p-5 rounded-xl border border-border bg-card">
        <div>
          <Label>Select Wallet</Label>
          <Select value={walletId} onValueChange={setWalletId}>
            <SelectTrigger className="mt-1.5"><SelectValue placeholder="Choose wallet" /></SelectTrigger>
            <SelectContent>
              {wallets.map(w => (
                <SelectItem key={w.id} value={w.id}>
                  <div className="flex items-center gap-2">
                    <CoinLogo symbol={w.currency} size={20} />
                    <span>{w.name} — {w.currency}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedWallet && (
          <div className="space-y-4">
            <QRCodeDisplay address={selectedWallet.address} size={200} />

            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <CoinLogo symbol={selectedWallet.currency} size={22} />
                <p className="text-xs text-muted-foreground">{selectedWallet.currency} Address</p>
              </div>
              <div className="flex items-center gap-2 bg-secondary rounded-lg px-3 py-2.5">
                <code className="text-xs flex-1 truncate">{selectedWallet.address}</code>
                <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={copyAddress}>
                  {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
          </div>
        )}

        {wallets.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">
            Create a wallet first to receive crypto
          </p>
        )}
      </div>
    </div>
  );
}