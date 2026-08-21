// @ts-nocheck
import { useState, useEffect, useRef } from "react";
import { Eye, EyeOff, AlertTriangle, Shield, Printer, KeyRound } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { jsPDF } from "jspdf";
import CoinLogo from "@/components/CoinLogo";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWallet } from "@/lib/WalletProvider";
import { useRevealWithReauth } from "@/components/security/useRevealWithReauth";
import BackupPaywallNudge from "@/components/BackupPaywallNudge";
import { useTier } from "@/lib/TierProvider";
import { artifactToQrDataUrl, encryptSeedBackup } from "@/lib/seedQr";
import { toast } from "@/lib/toast";

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export default function WalletSeedQR() {
  const { wallets, confirmWalletBackup } = useWallet();
  const { currentTier } = useTier();

  const [selectedWalletId, setSelectedWalletId] = useState("");
  const [mnemonic, setMnemonic] = useState(null);
  const [showSeed, setShowSeed] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [printed, setPrinted] = useState(false);
  const [backupPassword, setBackupPassword] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [qrError, setQrError] = useState("");
  const [qrPending, setQrPending] = useState(false);
  const [printPending, setPrintPending] = useState(false);
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
    setShowQr(false);
    setPrinted(false);
    setBackupPassword("");
    setQrDataUrl("");
    setQrError("");
    setQrPending(false);
    setPrintPending(false);
  }, [selectedWalletId]);

  useEffect(() => {
    return () => {
      setMnemonic(null);
      setShowQr(false);
      setBackupPassword("");
      setQrDataUrl("");
      setQrError("");
    };
  }, []);

  const handleReveal = () => {
    if (!selectedWalletId) return;
    revealWithReauth(selectedWalletId, { title: 'Reveal recovery phrase' });
  };

  const handleGenerateQr = async () => {
    if (!mnemonic) return;
    if (!backupPassword) {
      setQrError("Enter a backup password to generate the QR.");
      return;
    }
    setQrPending(true);
    setQrError("");
    try {
      const artifact = await encryptSeedBackup(mnemonic, backupPassword);
      const dataUrl = await artifactToQrDataUrl(artifact);
      setQrDataUrl(dataUrl);
    } catch (error) {
      setQrDataUrl("");
      setQrError(error?.message || "Could not generate the encrypted QR.");
    } finally {
      setQrPending(false);
    }
  };

  const buildPdf = () => {
    if (!mnemonic) return null;

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const walletName = selectedWallet?.name || "Wallet";
    const walletMeta = `${selectedWallet?.currency || ""} ${selectedWallet?.address ? `· ${selectedWallet.address.slice(0, 16)}…` : ""}`.trim();
    const wordsText = mnemonic.trim().split(/\s+/).map((word, index) => `${index + 1}. ${word}`).join("   ");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(`${walletName} - Recovery Backup`, 20, 20);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    if (walletMeta) doc.text(walletMeta, 20, 28);

    doc.setFont("helvetica", "bold");
    doc.setTextColor(190, 40, 40);
    doc.text("KEEP THIS DOCUMENT SECURE. ANYONE WITH THIS BACKUP CONTROLS THE WALLET.", 20, 38);

    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    const seedLines = doc.splitTextToSize(wordsText, 170);
    doc.text(seedLines, 20, 52);

    let qrY = 52 + seedLines.length * 6 + 8;
    if (qrDataUrl) {
      doc.setFont("helvetica", "bold");
      doc.text("Encrypted Seed Key QR", 20, qrY);
      qrY += 6;
      doc.addImage(qrDataUrl, "PNG", 20, qrY, 70, 70);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      const note = doc.splitTextToSize(
        "This QR is encrypted with the backup password you entered on-screen. You need that password to restore from the QR.",
        85
      );
      doc.text(note, 100, qrY + 8);
    }

    return doc;
  };

  const handlePrint = async () => {
    if (!mnemonic || printPending) return;
    setPrintPending(true);

    const nameText = selectedWallet?.name || "Wallet";

    try {
      if (Capacitor.isNativePlatform()) {
        const doc = buildPdf();
        if (!doc) return;
        const bytes = new Uint8Array(doc.output("arraybuffer"));
        const fileName = "veyrnox-recovery-backup.pdf";
        const result = await Filesystem.writeFile({
          path: fileName,
          data: bytesToBase64(bytes),
          directory: Directory.Cache,
        });
        await Share.share({
          title: `${nameText} recovery backup`,
          text: "Print or save this recovery backup in a secure location.",
          url: result.uri,
          dialogTitle: "Print or save recovery backup",
        });
      } else {
        // Web path: inject a hidden print container into THIS document so the user
        // stays on the page. @media print hides everything except the container.
        const PRINT_ID = "veyrnox-seed-print-container";
        let container = document.getElementById(PRINT_ID);
        if (!container) {
          container = document.createElement("div");
          container.id = PRINT_ID;
          document.body.appendChild(container);
        }

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
          const qrTitle = document.createElement("p");
          qrTitle.className = "qr-label";
          qrTitle.textContent = "Encrypted Seed Key QR";
          container.appendChild(qrTitle);

          const qrImg = document.createElement("img");
          qrImg.src = qrDataUrl;
          qrImg.alt = "Encrypted Seed Key QR";
          qrImg.className = "qr";
          container.appendChild(qrImg);
        }

        const warn1 = document.createElement("p");
        warn1.className = "warning";
        warn1.textContent = "KEEP THIS DOCUMENT SECURE. NEVER SHARE WITH ANYONE.";
        container.appendChild(warn1);

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
              #${PRINT_ID} .qr { margin: 12px auto; display: block; width: 220px; height: 220px; }
              #${PRINT_ID} .qr-label { margin-top: 16px; font-weight: bold; color: #111; }
              #${PRINT_ID} .warning { color: #ef4444; font-size: 12px; margin-top: 20px; }
            }
            @media screen {
              #${PRINT_ID} { display: none; }
            }
          `;
          document.head.appendChild(style);
        }

        window.print();
      }

      setPrinted(true);
      confirmWalletBackup(selectedWalletId);
    } catch (error) {
      toast.error(error?.message || "Could not print or save the recovery backup.");
    } finally {
      setPrintPending(false);
    }
  };

  const handleClear = () => {
    setMnemonic(null);
    mnemonicRef.current = null;
    setShowSeed(false);
    setShowQr(false);
    setPrinted(false);
    setBackupPassword("");
    setQrDataUrl("");
    setQrError("");
    setQrPending(false);
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
        <ul className="text-xs text-muted-foreground space-y-1 ms-7">
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

          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={showSeed ? "default" : "outline"}
              className="gap-2"
              onClick={() => setShowSeed((s) => !s)}
            >
              {showSeed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {showSeed ? "Hide Words" : "Reveal Words"}
            </Button>
            <Button
              type="button"
              variant={showQr ? "default" : "outline"}
              className="gap-2"
              onClick={() => setShowQr((s) => !s)}
            >
              <KeyRound className="h-4 w-4" />
              {showQr ? "Hide QR" : "Reveal QR"}
            </Button>
          </div>

          {(showSeed || showQr) ? (
            <>
              {showSeed && (
              <div className="grid grid-cols-3 gap-2">
                {words.map((word, i) => (
                  <div key={i} className="flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2 py-1.5">
                    <span className="text-[10px] text-muted-foreground w-4 text-end shrink-0">{i + 1}</span>
                    <span className="font-mono text-xs font-medium">{word}</span>
                  </div>
                ))}
              </div>
              )}

              {showQr && (
              <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
                <div>
                  <p className="text-sm font-medium">Encrypted Seed Key QR</p>
                  <p className="text-xs text-muted-foreground">
                    This QR is generated locally after the reveal gate. It is encrypted under a backup password, so scanning it still requires that password to recover the seed.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="seed-qr-password">Backup password</Label>
                  <PasswordInput
                    id="seed-qr-password"
                    value={backupPassword}
                    onChange={(e) => { setBackupPassword(e.target.value); if (qrError) setQrError(""); }}
                    placeholder="Enter a backup password for the QR"
                    autoComplete="off"
                  />
                </div>
                {qrError && <p className="text-xs text-destructive">{qrError}</p>}
                <Button onClick={handleGenerateQr} variant="secondary" className="w-full" disabled={!backupPassword || qrPending}>
                  {qrPending ? "Generating encrypted QR…" : "Generate Seed Key QR"}
                </Button>
                {qrDataUrl && (
                  <div className="flex flex-col items-center gap-2">
                    <div className="rounded-2xl bg-white p-3 shadow-lg">
                      <img src={qrDataUrl} alt="Encrypted Seed Key QR" width={220} height={220} className="rounded-lg" />
                    </div>
                    <p className="text-[11px] text-muted-foreground text-center">
                      Save this QR only if you also remember the backup password you used to encrypt it.
                    </p>
                  </div>
                )}
              </div>
              )}
            </>
          ) : (
            <div className="rounded-md border border-border bg-muted/30 px-4 py-3 text-center">
              <p className="text-sm text-muted-foreground">Choose to reveal your {words.length}-word recovery phrase, the encrypted Seed Key QR, or both.</p>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Write these words down in order and store them securely offline.
            {selectedWallet && <span className="font-mono"> {selectedWallet.currency} · {selectedWallet.address?.slice(0, 20)}…</span>}
          </p>

          <Button onClick={handlePrint} className="gap-2 w-full" variant="outline" disabled={printPending}>
            <Printer className="h-4 w-4" /> {printPending ? "Preparing Backup…" : "Print Secure Backup"}
          </Button>
          {printed && (
            <>
              <p className="text-xs text-success">✓ Printed — backup confirmed.</p>
              <BackupPaywallNudge currentTier={currentTier} />
            </>
          )}

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
