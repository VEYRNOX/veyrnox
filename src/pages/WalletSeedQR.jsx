// @ts-nocheck
import { useState, useEffect, useRef } from "react";
import QRCode from "qrcode";
import { Eye, EyeOff, AlertTriangle, Shield, Printer, KeyRound, QrCode } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";
import CoinLogo from "@/components/CoinLogo";
import QRCodeDisplay from "@/components/QRCodeDisplay";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWallet } from "@/lib/WalletProvider";
import { useRevealWithReauth } from "@/components/security/useRevealWithReauth";

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
  const { wallets, confirmWalletBackup } = useWallet();

  const [selectedWalletId, setSelectedWalletId] = useState("");
  const [mnemonic, setMnemonic] = useState(null);
  const [showSeed, setShowSeed] = useState(false);
  const [printed, setPrinted] = useState(false);
  const mnemonicRef = useRef(null);

  const selectedWallet = wallets.find(w => w.id === selectedWalletId);

  // Seed reveal (2FA gate + M6 recent-auth window). On a lapsed window this shows
  // an inline "unlock again" prompt in place of the reveal button instead of a
  // dead-end toast — see useRevealWithReauth.
  const { revealWithReauth, reauthPrompt, isReauthPending, gateModal } = useRevealWithReauth(
    ({ mnemonic: phrase }) => {
      setMnemonic(phrase);
      mnemonicRef.current = phrase;
    }
  );

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
    revealWithReauth(selectedWalletId, { title: 'Reveal recovery phrase' });
  };

  const handlePrint = async () => {
    if (!mnemonic) return;

    // Encode the phrase to a QR locally (same `qrcode` lib, no network) so the
    // printed/shared sheet carries both the words and a scannable backup.
    let qrDataUrl = "";
    try {
      qrDataUrl = await QRCode.toDataURL(mnemonic, { errorCorrectionLevel: "M", margin: 2, width: 240 });
    } catch {
      /* QR is best-effort — the printed words remain a complete backup on their own. */
    }

    const nameText = selectedWallet?.name || "Wallet";

    if (Capacitor.isNativePlatform()) {
      // window.open("", "_blank") on Capacitor opens an orphaned WebView with no
      // back navigation — the user gets stranded. Instead share the backup text
      // via the OS share sheet so they can save/print through their own apps.
      const shareText = [
        `${nameText} — Recovery Backup`,
        `${escapeHtml(selectedWallet?.currency || "")} · ${selectedWallet?.address?.slice(0, 16) || ""}...`,
        "",
        mnemonic,
        "",
        "KEEP THIS DOCUMENT SECURE. NEVER SHARE WITH ANYONE.",
        "The QR encodes the same recovery phrase — anyone who scans it controls this wallet.",
      ].join("\n");

      try {
        await Share.share({
          title: `${nameText} — Recovery Backup`,
          text: shareText,
          dialogTitle: "Print or Save Recovery Backup",
        });
      } catch {
        // Share sheet dismissed — no action needed; user stays on the page.
      }
      setPrinted(true);
      confirmWalletBackup(selectedWalletId);
      return;
    }

    // Web path: inject a hidden print container into THIS document so the user
    // stays on the page. @media print hides everything except the container, then
    // we call window.print() on the current window — no popup, no orphaned tab.
    const PRINT_ID = "veyrnox-seed-print-container";
    let container = document.getElementById(PRINT_ID);
    if (!container) {
      container = document.createElement("div");
      container.id = PRINT_ID;
      document.body.appendChild(container);
    }

    // Build the print container with DOM methods — no innerHTML, no XSS surface.
    // All content is plain text set via textContent (wallet name, mnemonic, address)
    // or a data: URL from the local qrcode library (QR image).
    container.textContent = "";

    const h2 = document.createElement("h2");
    h2.textContent = `${nameText} — Recovery Backup`;
    container.appendChild(h2);

    const meta = document.createElement("p");
    meta.textContent = `${selectedWallet?.currency || ""} · ${selectedWallet?.address?.slice(0, 16) || ""}...`;
    container.appendChild(meta);

    const seedDiv = document.createElement("div");
    seedDiv.className = "seed";
    seedDiv.textContent = mnemonic;
    container.appendChild(seedDiv);

    if (qrDataUrl) {
      // qrDataUrl is a data:image/png;base64,... string produced locally by the
      // qrcode library — no user-supplied value goes into the src attribute.
      const img = document.createElement("img");
      img.className = "qr";
      img.src = qrDataUrl;
      img.alt = "Recovery phrase QR";
      img.width = 240;
      img.height = 240;
      container.appendChild(img);
    }

    const warn1 = document.createElement("p");
    warn1.className = "warning";
    warn1.textContent = "KEEP THIS DOCUMENT SECURE. NEVER SHARE WITH ANYONE.";
    container.appendChild(warn1);

    const warn2 = document.createElement("p");
    warn2.className = "warning";
    warn2.textContent = "The QR encodes the same recovery phrase — anyone who scans it controls this wallet.";
    container.appendChild(warn2);

    // Inject scoped print styles once (idempotent).
    const STYLE_ID = "veyrnox-seed-print-styles";
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = `
        @media print {
          body > *:not(#${PRINT_ID}) { display: none !important; }
          #${PRINT_ID} { display: block !important; font-family: monospace; text-align: center; padding: 40px; }
          #${PRINT_ID} h2 { margin-bottom: 8px; }
          #${PRINT_ID} p { color: #666; font-size: 13px; margin: 4px 0; }
          #${PRINT_ID} .seed { font-size: 14px; font-weight: bold; margin: 20px 0; word-break: break-all; background: #f5f5f5; padding: 16px; border-radius: 8px; }
          #${PRINT_ID} .qr { margin: 12px auto; display: block; }
          #${PRINT_ID} .warning { color: #ef4444; font-size: 12px; margin-top: 20px; }
        }
        @media screen {
          #${PRINT_ID} { display: none; }
        }
      `;
      document.head.appendChild(style);
    }

    window.print();
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

      {/* Wallet selector — moved ABOVE the security warning so it's the first
          actionable control on the page. Previously the verbose warning card
          pushed the selector below the fold on small viewports, so users could
          not see or reach the "pick a wallet" step without scrolling. The
          warning is still critical context but reads as a confirmation of intent
          AFTER the user has committed to picking a wallet. */}
      <div>
        <Label id="seed-wallet-label">Select Wallet</Label>
        <Select value={selectedWalletId} onValueChange={setSelectedWalletId}>
          <SelectTrigger className="mt-1.5" aria-labelledby="seed-wallet-label">
            <SelectValue placeholder="Choose wallet..." />
          </SelectTrigger>
          {/* position="popper" anchors the dropdown to the trigger's bottom edge.
              Radix's default position="item-aligned" tries to align the currently-
              selected item over the trigger — on mobile with a short viewport and
              no current selection (first open), that falls through and floats the
              popover to wherever fits, which on this layout is the bottom of the
              screen (past the warning card). popper keeps it attached. */}
          <SelectContent position="popper" side="bottom" align="start" sideOffset={4}>
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

      {/* Session-timeout re-auth — inline "unlock again" prompt in place of the
          reveal button instead of a dead-end toast. See useRevealWithReauth. */}
      {selectedWalletId && !mnemonic && isReauthPending && reauthPrompt}

      {/* Reveal button — shown when wallet selected but mnemonic not yet revealed */}
      {selectedWalletId && !mnemonic && !isReauthPending && (
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
                  Contains your recovery phrase. Treat the QR as carefully as the words — never photograph or screenshot.
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
