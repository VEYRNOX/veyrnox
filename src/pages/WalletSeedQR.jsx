import { useState, useEffect } from "react";
import QRCode from "qrcode";
import { Eye, EyeOff, AlertTriangle, Shield, Printer, CheckCircle2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/lib/WalletProvider";

// Escape HTML metacharacters before interpolating into print document markup.
function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export default function WalletSeedQR() {
  const { isUnlocked, wallets, activeWalletId, revealWalletMnemonic, confirmWalletBackup } = useWallet();
  const [selectedId, setSelectedId] = useState(activeWalletId || "");
  const [confirmed, setConfirmed] = useState(false);
  const [showWords, setShowWords] = useState(true);
  const [qrUrl, setQrUrl] = useState(null);
  const [qrFailed, setQrFailed] = useState(false);
  const [markedBackedUp, setMarkedBackedUp] = useState(false);

  const selectedWallet = wallets.find(w => w.id === selectedId) || wallets[0] || null;
  const effectiveId = selectedWallet?.id || null;

  // Read live secret from vault on demand — only while confirmed
  const mnemonic = confirmed && effectiveId ? revealWalletMnemonic(effectiveId) : null;
  const words = mnemonic ? mnemonic.trim().split(/\s+/) : [];

  // Generate QR code locally — never sent off-device
  useEffect(() => {
    if (!mnemonic) { setQrUrl(null); setQrFailed(false); return undefined; }
    let cancelled = false;
    setQrFailed(false);
    QRCode.toDataURL(mnemonic, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 256,
      color: { dark: "#0b1020", light: "#ffffff" },
    })
      .then(url => { if (!cancelled) setQrUrl(url); })
      .catch(() => { if (!cancelled) { setQrUrl(null); setQrFailed(true); } });
    return () => { cancelled = true; };
  }, [mnemonic]);

  // Reset on wallet switch
  useEffect(() => {
    setConfirmed(false);
    setQrUrl(null);
    setQrFailed(false);
    setMarkedBackedUp(false);
  }, [selectedId]);

  const handlePrint = () => {
    if (!mnemonic || !selectedWallet) return;
    const w = window.open("", "_blank");
    const name = escapeHtml(selectedWallet.name || "Wallet");
    const wordHtml = words
      .map((word, i) =>
        `<span class="word"><span class="n">${i + 1}.</span>${escapeHtml(word)}</span>`
      )
      .join("");
    w.document.write(`<html><head><title>Seed Backup — ${name}</title><style>
      body{font-family:monospace;text-align:center;padding:40px;max-width:600px;margin:0 auto}
      h2{margin-bottom:4px} .sub{color:#666;font-size:13px;margin-bottom:24px}
      .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;text-align:left;
            background:#f5f5f5;padding:16px;border-radius:8px;margin:20px 0}
      .word{font-size:13px} .n{color:#999;margin-right:4px}
      img{margin:16px auto;display:block}
      .warn{color:#ef4444;font-size:11px;margin-top:20px;border:1px solid #ef4444;
            padding:8px;border-radius:4px}
    </style></head><body>
      <h2>${name} — Seed Backup</h2>
      <p class="sub">Recovery phrase — ${words.length} words</p>
      ${qrUrl ? `<img src="${qrUrl}" width="200" height="200" alt="Seed QR" />` : ""}
      <div class="grid">${wordHtml}</div>
      <div class="warn">⚠ KEEP SECURE — NEVER SHARE — STORE OFFLINE IN A SAFE PLACE</div>
    </body></html>`);
    w.document.close();
    w.print();
  };

  const handleMarkBackedUp = () => {
    if (effectiveId) confirmWalletBackup(effectiveId);
    setMarkedBackedUp(true);
  };

  const handleClear = () => {
    setConfirmed(false);
    setQrUrl(null);
    setQrFailed(false);
    setMarkedBackedUp(false);
  };

  if (!isUnlocked) {
    return (
      <div className="max-w-lg mx-auto py-20 text-center space-y-3 text-muted-foreground">
        <Wallet className="h-10 w-10 mx-auto opacity-30" />
        <p className="font-medium text-foreground">Wallet locked</p>
        <p className="text-sm">Unlock your wallet to access seed backup.</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold">Seed Phrase Backup</h1>
        <p className="text-sm text-muted-foreground">Display and print your recovery phrase for secure offline backup.</p>
      </div>

      {/* Security warning */}
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

      {/* Wallet selector (only shown when there are multiple wallets) */}
      {wallets.length > 1 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Wallet</p>
          <div className="flex flex-wrap gap-2">
            {wallets.map(w => (
              <button
                key={w.id}
                onClick={() => setSelectedId(w.id)}
                className={[
                  "px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors",
                  selectedId === w.id
                    ? "bg-primary text-primary-foreground border-transparent"
                    : "bg-card border-border text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                {w.name || "Wallet"}
                {w.backedUp && <span className="ml-1.5 text-green-500">✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Confirmation gate */}
      {!confirmed && (
        <div className="p-4 rounded-xl border border-yellow-500/30 bg-yellow-500/5 space-y-3">
          <p className="text-sm font-semibold">Confirm you understand the risks</p>
          <p className="text-xs text-muted-foreground">
            I am in a private, secure environment. I understand this reveals my full
            recovery phrase and I will store it securely offline. Anyone who sees these
            words has complete access to my wallet.
          </p>
          <Button size="sm" onClick={() => setConfirmed(true)} className="gap-2 w-full">
            <Shield className="h-4 w-4" /> I Understand — Reveal Recovery Phrase
          </Button>
        </div>
      )}

      {/* Revealed seed */}
      {confirmed && mnemonic && (
        <>
          {/* QR code */}
          <div className="p-5 rounded-xl border border-border bg-card flex flex-col items-center gap-3">
            <p className="text-xs font-semibold text-muted-foreground">Recovery phrase QR</p>
            {qrFailed ? (
              <div className="flex items-center gap-2 text-destructive text-xs">
                <AlertTriangle className="h-4 w-4" />
                QR generation failed — use the word list below instead.
              </div>
            ) : qrUrl ? (
              <div className="p-2 rounded-xl bg-white">
                <img src={qrUrl} alt="Seed phrase QR code" width={220} height={220} className="rounded-lg" />
              </div>
            ) : (
              <div className="h-[220px] w-[220px] animate-pulse rounded-xl bg-secondary" />
            )}
            <p className="text-[10px] text-muted-foreground text-center px-2">
              QR encodes the raw BIP-39 mnemonic. Only scan in a trusted, air-gapped environment.
            </p>
          </div>

          {/* Word grid */}
          <div className="p-4 rounded-xl border border-border bg-card space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground">{words.length}-word recovery phrase</p>
              <button
                onClick={() => setShowWords(s => !s)}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Toggle word visibility"
              >
                {showWords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {showWords ? (
              <div className="grid grid-cols-3 gap-2">
                {words.map((word, i) => (
                  <div key={i} className="flex items-center gap-1.5 rounded-lg bg-secondary px-2.5 py-1.5">
                    <span className="text-[10px] text-muted-foreground w-4 shrink-0 select-none">{i + 1}.</span>
                    <span className="text-xs font-mono font-medium">{word}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-12 flex items-center justify-center text-xs text-muted-foreground select-none">
                Words hidden — tap eye icon to reveal
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="space-y-2">
            <Button onClick={handlePrint} className="gap-2 w-full" variant="outline">
              <Printer className="h-4 w-4" /> Print Secure Backup
            </Button>
            <Button
              onClick={handleMarkBackedUp}
              className="gap-2 w-full"
              variant="outline"
              disabled={markedBackedUp || !!selectedWallet?.backedUp}
            >
              <CheckCircle2 className={`h-4 w-4 ${(markedBackedUp || selectedWallet?.backedUp) ? "text-green-500" : ""}`} />
              {(markedBackedUp || selectedWallet?.backedUp) ? "Marked as backed up ✓" : "Mark as backed up"}
            </Button>
            <Button size="sm" variant="ghost" className="text-destructive text-xs w-full" onClick={handleClear}>
              Clear from view
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
