import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Eye, EyeOff, AlertTriangle, Shield, Printer } from "lucide-react";
import CoinLogo from "@/components/CoinLogo";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function WalletSeedQR() {
  const [selectedWalletId, setSelectedWalletId] = useState("");
  const [seedPhrase, setSeedPhrase] = useState("");
  const [showSeed, setShowSeed] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [printed, setPrinted] = useState(false);
  const printRef = useRef(null);

  // FOLLOW-UP (separate change): seed is sourced from the demo data layer (base44 mock), not the real vault. Rewire to WalletProvider before this is a real backup path. Tracked separately.
  const { data: wallets = [] } = useQuery({ queryKey: ["wallets"], queryFn: () => base44.entities.Wallet.list() });
  const selectedWallet = wallets.find(w => w.id === selectedWalletId);

  const handlePrint = () => {
    const w = window.open("", "_blank");
    w.document.write(`<html><head><title>Seed Backup — ${selectedWallet?.name || "Wallet"}</title><style>
      body { font-family: monospace; text-align: center; padding: 40px; }
      h2 { margin-bottom: 8px; }
      p { color: #666; font-size: 13px; margin: 4px 0; }
      .seed { font-size: 14px; font-weight: bold; margin: 20px 0; word-break: break-all; background: #f5f5f5; padding: 16px; border-radius: 8px; }
      canvas { margin: 20px auto; display: block; }
      .warning { color: #ef4444; font-size: 12px; margin-top: 20px; }
    </style></head><body>
      <h2>${selectedWallet?.name || "Wallet"} — Seed Backup</h2>
      <p>${selectedWallet?.currency || ""} · ${selectedWallet?.address?.slice(0, 16) || ""}...</p>
      <div class="seed">${seedPhrase}</div>
      <p class="warning">⚠️ KEEP THIS DOCUMENT SECURE. NEVER SHARE WITH ANYONE.</p>
    </body></html>`);
    w.document.close();
    w.print();
    setPrinted(true);
  };

  const isValidSeed = seedPhrase.trim().split(/\s+/).length >= 12;

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold">Seed Phrase Backup</h1>
        <p className="text-sm text-muted-foreground">Display and print your recovery phrase for secure offline backup.</p>
      </div>

      {/* Warning */}
      <div className="p-4 rounded-xl border border-destructive/30 bg-destructive/5 space-y-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
          <p className="text-sm font-semibold text-destructive">Critical Security Warning</p>
        </div>
        <ul className="text-xs text-muted-foreground space-y-1 ml-7">
          <li>• Your seed phrase grants full wallet access — never share it</li>
          <li>• Only reveal your seed phrase in a private, secure environment</li>
          <li>• Store the printed phrase in a fireproof safe or safety deposit box</li>
          <li>• This page never transmits or stores your seed phrase</li>
        </ul>
      </div>

      {/* Wallet selector */}
      <div>
        <Label>Select Wallet</Label>
        <Select value={selectedWalletId} onValueChange={setSelectedWalletId}>
          <SelectTrigger className="mt-1.5"><SelectValue placeholder="Choose wallet..." /></SelectTrigger>
          <SelectContent>
            {wallets.map(w => <SelectItem key={w.id} value={w.id}><span className="flex items-center gap-2"><CoinLogo symbol={w.currency} size={18} />{w.name} ({w.currency})</span></SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Seed phrase input */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <Label>Seed Phrase (12 or 24 words)</Label>
          <button onClick={() => setShowSeed(s => !s)} className="text-muted-foreground hover:text-foreground transition-colors">
            {showSeed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <textarea
          rows={3}
          value={seedPhrase}
          onChange={e => { setSeedPhrase(e.target.value); setConfirmed(false); }}
          placeholder="word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12"
          className={`w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono ${!showSeed && seedPhrase ? "text-transparent bg-clip-text" : ""}`}
          style={!showSeed && seedPhrase ? { WebkitTextSecurity: "disc" } : {}}
          autoComplete="off"
          spellCheck={false}
        />
        {seedPhrase && (
          <p className={`text-xs mt-1 ${isValidSeed ? "text-green-500" : "text-yellow-500"}`}>
            {seedPhrase.trim().split(/\s+/).length} words {isValidSeed ? "✓" : "(need at least 12)"}
          </p>
        )}
      </div>

      {/* Confirmation */}
      {isValidSeed && !confirmed && (
        <div className="p-4 rounded-xl border border-yellow-500/30 bg-yellow-500/5">
          <p className="text-sm font-semibold mb-2">Confirm you understand the risks</p>
          <p className="text-xs text-muted-foreground mb-3">I understand this reveals my full recovery phrase and will store it securely offline.</p>
          <Button size="sm" onClick={() => setConfirmed(true)} className="gap-2 w-full"><Shield className="h-4 w-4" /> I Understand — Reveal Backup</Button>
        </div>
      )}

      {/* QR Output */}
      {confirmed && isValidSeed && (
        <div className="p-5 rounded-xl border border-border bg-card text-center space-y-4">
          <div className="flex items-center justify-center gap-2">
            <Shield className="h-4 w-4 text-green-500" />
            <p className="text-sm font-semibold">{selectedWallet?.name || "Wallet"} Seed Backup</p>
          </div>
          <div className="flex justify-center" ref={printRef}>
            <p className="font-mono text-sm break-all rounded-lg border border-border bg-muted/30 p-4 text-left">{seedPhrase}</p>
          </div>
          <p className="text-xs text-muted-foreground">Write these words down in order and store them securely offline. Re-import by typing the words into a wallet — there is no scan-to-import.</p>
          {selectedWallet && (
            <p className="text-xs font-mono text-muted-foreground">{selectedWallet.currency} · {selectedWallet.address?.slice(0, 20)}...</p>
          )}
          <Button onClick={handlePrint} className="gap-2 w-full" variant="outline">
            <Printer className="h-4 w-4" /> Print Secure Backup
          </Button>
          {printed && <p className="text-xs text-green-500">✓ Printed. Store securely.</p>}
          <Button size="sm" variant="ghost" className="text-destructive text-xs" onClick={() => { setSeedPhrase(""); setConfirmed(false); setPrinted(false); }}>
            Clear Seed from Memory
          </Button>
        </div>
      )}
    </div>
  );
}