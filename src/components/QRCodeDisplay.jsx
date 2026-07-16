// @ts-nocheck
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Download, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

// Renders a QR code for a receive address.
//
// SECURITY / FUND-SAFETY:
//   - The QR is generated LOCALLY (the `qrcode` lib), never via a third-party
//     image API. The receive address is private routing info; it is never sent
//     off-device just to draw a square.
//   - It encodes EXACTLY the `address` string passed in — no truncation, no
//     re-formatting. A QR that encodes a wrong/garbled address loses funds, so
//     if generation fails we show an explicit error instead of a blank/partial
//     code that could be mistaken for valid.
export default function QRCodeDisplay({ address, size = 200 }) {
  const [dataUrl, setDataUrl] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!address) { setDataUrl(""); setFailed(false); return undefined; }
    let cancelled = false;
    setFailed(false);
    QRCode.toDataURL(address, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: size,
      color: { dark: "#0b1020", light: "#ffffff" },
    })
      .then((url) => { if (!cancelled) setDataUrl(url); })
      .catch(() => { if (!cancelled) { setDataUrl(""); setFailed(true); } });
    return () => { cancelled = true; };
  }, [address, size]);

  if (!address) return null;

  if (failed) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-center"
        style={{ width: size + 24, height: size + 24 }}
      >
        <AlertTriangle className="h-5 w-5 text-destructive" />
        <p className="text-xs text-destructive">Couldn't render QR. Copy the address below instead.</p>
      </div>
    );
  }

  const handleDownload = () => {
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `veyrnox-receive-${address.slice(0, 10)}.png`;
    a.click();
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="p-3 rounded-2xl bg-white shadow-lg" style={{ minWidth: size + 24, minHeight: size + 24 }}>
        {dataUrl && (
          <img src={dataUrl} alt="Receive address QR code" width={size} height={size} className="rounded-lg" />
        )}
      </div>
      {/* variant=secondary (not outline): the QR page renders inside a
          text-muted-foreground context so the outline variant's transparent
          background + inherited grey text is nearly invisible against the
          dark bg-background (#050608). Secondary carries explicit
          bg-secondary + text-secondary-foreground tokens that read in both
          themes. */}
      <Button variant="secondary" size="sm" className="gap-2 text-xs" onClick={handleDownload} disabled={!dataUrl}>
        <Download className="h-3.5 w-3.5" />
        Save QR Code
      </Button>
    </div>
  );
}
