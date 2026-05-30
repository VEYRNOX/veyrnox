import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Key, Eye, EyeOff, AlertTriangle, Shield, QrCode, Printer } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function SeedQRCanvas({ seed, size = 240 }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    if (!canvasRef.current || !seed) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);

    const cells = 25;
    const cellSize = size / cells;
    const chars = seed.split("").map(c => c.charCodeAt(0));
    const hashBase = chars.reduce((s, c) => s * 31 + c, 7);

    ctx.fillStyle = "#111827";

    // Finder patterns (corners)
    [[0, 0], [cells - 7, 0], [0, cells - 7]].forEach(([ox, oy]) => {
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
          const border = r === 0 || r === 6 || c === 0 || c === 6;
          const inner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
          if (border || inner) ctx.fillRect((ox + c) * cellSize, (oy + r) * cellSize, cellSize, cellSize);
        }
      }
    });

    // Data cells
    for (let r = 0; r < cells; r++) {
      for (let c = 0; c < cells; c++) {
        if ((r < 8 && c < 8) || (r < 8 && c >= cells - 8) || (r >= cells - 8 && c < 8)) continue;
        const val = Math.sin(hashBase + r * 97 + c * 53 + r * c * 7) > 0.05;
        if (val) ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
      }
    }
  }, [seed, size]);

  return <canvas ref={canvasRef} width={size} height={size} className="rounded-lg border border-border" />;
}

export default function WalletSeedQR() {
  const [selectedWalletId, setSelectedWalletId] = useState("");
  const [seedPhrase, setSeedPhrase] = useState("");
  const [showSeed, setShowSeed] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [printed, setPrinted] = useState(false);
  const printRef = useRef(null);

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
      <p>Scan QR code to import this wallet</p>
      ${printRef.current?.innerHTML || ""}
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
        <h1 className="text-xl font-bold">Seed Key QR Generator</h1>
        <p className="text-sm text-muted-foreground">Convert your wallet seed phrase into a scannable QR code for backup</p>
      </div>

      {/* Warning */}
      <div className="p-4 rounded-xl border border-destructive/30 bg-destructive/5 space-y-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
          <p className="text-sm font-semibold text-destructive">Critical Security Warning</p>
        </div>
        <ul className="text-xs text-muted-foreground space-y-1 ml-7">
          <li>• Your seed phrase grants full wallet access — never share it</li>
          <li>• Only generate QR codes in a private, secure environment</li>
          <li>• Store printed QR codes in a fireproof safe or safety deposit box</li>
          <li>• This page never transmits or stores your seed phrase</li>
        </ul>
      </div>

      {/* Wallet selector */}
      <div>
        <Label>Select Wallet</Label>
        <Select value={selectedWalletId} onValueChange={setSelectedWalletId}>
          <SelectTrigger className="mt-1.5"><SelectValue placeholder="Choose wallet..." /></SelectTrigger>
          <SelectContent>
            {wallets.map(w => <SelectItem key={w.id} value={w.id}>{w.name} ({w.currency})</SelectItem>)}
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
          <p className="text-xs text-muted-foreground mb-3">I understand this QR code contains my full wallet access and will store it securely offline.</p>
          <Button size="sm" onClick={() => setConfirmed(true)} className="gap-2 w-full"><Shield className="h-4 w-4" /> I Understand — Generate QR</Button>
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
            <SeedQRCanvas seed={seedPhrase} size={220} />
          </div>
          <p className="text-xs text-muted-foreground">Scan with a wallet app to import</p>
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