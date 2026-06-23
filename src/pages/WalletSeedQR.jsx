import { useState, useEffect, useRef } from "react";
import QRCode from "qrcode";
import { Eye, EyeOff, AlertTriangle, Shield, Printer, KeyRound, QrCode } from "lucide-react";
import CoinLogo from "@/components/CoinLogo";
import QRCodeDisplay from "@/components/QRCodeDisplay";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWallet } from "@/lib/WalletProvider";
import { useActionGuard } from "@/components/security/useActionGuard";

// Escape HTML metacharacters before interpolating into the print document.
function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export default function WalletSeedQR() {
  const { wallets, revealWalletMnemonic, confirmWalletBackup } = useWallet();
  const { requireTwoFactor, gateModal } = useActionGuard();

  const [selectedWalletId, setSelectedWalletId] = useState("");
  const [mnemonic, setMnemonic] = useState(null);
  const [showSeed, setShowSeed] = useState(false);
  const [printed, setPrinted] = useState(false);
  const mnemonicRef = useRef(null);

  const selectedWallet = wallets.find(w => w.id === selectedWalletId);

  // Clear mnemonic from memory when wallet changes or component unmounts.
  useEffect(() => {
    setMnemonic(null);
    setShowSeed(false);
    setPrinted(false);
  }, [selectedWalletId]);

  useEffect(() => {
    return () => { setMnemonic(null); };
  }, []);

  const handleReveal = () => {
    if (!selectedWalletId) return;
    requireTwoFactor(() => {
      const phrase = revealWalletMnemonic(selectedWalletId);
      if (phrase) {
        setMnemonic(phrase);
        mnemonicRef.current = phrase;
      }
    }, { title: 'Reveal recovery phrase' });
  };

  const handlePrint = async () => {
    if (!mnemonic) return;
    // Encode the phrase to a QR locally (same `qrcode` lib, no network) so the
    // printed sheet carries both the words and a scannable backup.
    let qrDataUrl = "";
    try {
      qrDataUrl = await QRCode.toDataURL(mnemonic, { errorCorrectionLevel: "M", margin: 2, width: 240 });
    } catch {
      /* QR is best-effort — the printed words remain a complete backup on their own. */
    }
    const w = window.open("", "_blank");
    const nameHtml = escapeHtml(selectedWallet?.name || "Wallet");
    const qrHtml = qrDataUrl
      ? `<img class="qr" src="${qrDataUrl}" alt="Recovery phrase QR" width="240" height="240" />`
      : "";
    w.document.write(`<html><head><title>Recovery Backup — ${nameHtml}</title><style>
      body { font-family: monospace; text-align: center; padding: 40px; }
      h2 { margin-bottom: 8px; }
      p { color: #666; font-size: 13px; margin: 4px 0; }
      .seed { font-size: 14px; font-weight: bold; margin: 20px 0; word-break: break-all; background: #f5f5f5; padding: 16px; border-radius: 8px; }
      .qr { margin: 12px auto; display: block; }
      .warning { color: #ef4444; font-size: 12px; margin-top: 20px; }
    </style></head><body>
      <h2>${nameHtml} — Recovery Backup</h2>
      <p>${escapeHtml(selectedWallet?.currency || "")} · ${escapeHtml(selectedWallet?.address?.slice(0, 16) || "")}...</p>
      <div class="seed">${escapeHtml(mnemonic)}</div>
      ${qrHtml}
      <p class="warning">⚠️ KEEP THIS DOCUMENT SECURE. NEVER SHARE WITH ANYONE.</p>
      <p class="warning">The QR encodes the same recovery phrase — anyone who scans it controls this wallet.</p>
    </body></html>`);
    w.document.close();
    w.print();
    setPrinted(true);
    confirmWalletBackup(selectedWalletId);
  };

  const handleClear = () => {
    setMnemonic(null);
    mnemonicRef.current = null;
    setShowSeed(false);
    setPrinted(false);
  };

  const words = mnemonic ? mnemonic.trim().split(/\s+/) : [];

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold">Recovery Phrase Backup</h1>
        <p className="text-sm text-muted-foreground">Display and print your recovery phrase for secure offline backup.</p>
      </div>

      {/* Warning */}
      <div className="p-4 rounded-xl border border-destructive/30 bg-destructive/5 space-y-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
          <p className="text-sm font-semibold text-destructive">Critical Security Warning</p>
        </div>
        <ul className="text-xs text-muted-foreground space-y-1 ml-7">
          <li>• Your recovery phrase grants full wallet access — never share it</li>
          <li>• Only reveal your recovery phrase in a private, secure environment</li>
          <li>• Store the printed phrase in a fireproof safe or safety deposit box</li>
          <li>• This page never transmits your recovery phrase — it reads from your local vault</li>
        </ul>
      </div>

      {/* Wallet selector */}
      <div>
        <Label id="seed-wallet-label">Select Wallet</Label>
        <Select value={selectedWalletId} onValueChange={setSelectedWalletId}>
          <SelectTrigger className="mt-1.5" aria-labelledby="seed-wallet-label">
            <SelectValue placeholder="Choose wallet..." />
          </SelectTrigger>
          <SelectContent>
            {wallets.map(w => (
              <SelectItem key={w.id} value={w.id}>
                <span className="flex items-center gap-2">
                  <CoinLogo symbol={w.currency} size={18} />
                  {w.name} ({w.currency})
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Reveal button — shown when wallet selected but mnemonic not yet revealed */}
      {selectedWalletId && !mnemonic && (
        <Button onClick={handleReveal} className="gap-2 w-full">
          <KeyRound className="h-4 w-4" /> Reveal Recovery Phrase
        </Button>
      )}

      {/* Revealed mnemonic */}
      {mnemonic && (
        <div className="p-5 rounded-xl border border-border bg-card space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-success" />
              <p className="text-sm font-semibold">{selectedWallet?.name || "Wallet"} — Recovery Phrase</p>
            </div>
            <button
              onClick={() => setShowSeed(s => !s)}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label={showSeed ? "Hide seed" : "Show seed"}
            >
              {showSeed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          {showSeed ? (
            <>
              <div className="grid grid-cols-3 gap-2">
                {words.map((word, i) => (
                  <div key={i} className="flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2 py-1.5">
                    <span className="text-[10px] text-muted-foreground w-4 text-right shrink-0">{i + 1}</span>
                    <span className="font-mono text-xs font-medium">{word}</span>
                  </div>
                ))}
              </div>

              {/* Seed QR — the SAME plaintext phrase encoded for scan-to-restore.
                  Generated locally (qrcode lib, no network), shown only while the
                  phrase itself is revealed, so it exposes nothing the words above
                  don't already. Anyone who photographs it gets the whole wallet —
                  hence the explicit warning and the reveal gate. */}
              <div className="flex flex-col items-center gap-2 pt-1">
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <QrCode className="h-3.5 w-3.5" /> Scan to restore on another device
                </div>
                <div className="rounded-xl bg-white p-3">
                  <QRCodeDisplay address={mnemonic} size={200} />
                </div>
                <p className="text-[11px] text-destructive text-center max-w-[15rem]">
                  This QR code contains your recovery phrase. Keep it as safe as the words themselves —
                  never photograph or screenshot it where it could sync or be seen.
                </p>
              </div>
            </>
          ) : (
            <div className="rounded-md border border-border bg-muted/30 px-4 py-3 text-center">
              <p className="text-sm text-muted-foreground">Tap the eye to reveal your {words.length}-word recovery phrase</p>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Write these words down in order and store them securely offline.
            {selectedWallet && <span className="font-mono"> {selectedWallet.currency} · {selectedWallet.address?.slice(0, 20)}…</span>}
          </p>

          <Button onClick={handlePrint} className="gap-2 w-full" variant="outline">
            <Printer className="h-4 w-4" /> Print Secure Backup
          </Button>
          {printed && <p className="text-xs text-success">✓ Printed — backup confirmed.</p>}

          <Button
            size="sm"
            variant="ghost"
            className="text-destructive text-xs w-full"
            onClick={handleClear}
          >
            Clear recovery phrase from memory
          </Button>
        </div>
      )}

      {gateModal}
    </div>
  );
}
