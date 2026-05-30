import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function QRCodeDisplay({ address, size = 200 }) {
  if (!address) return null;

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(address)}&size=${size}x${size}&bgcolor=1a1a2e&color=ffffff&margin=8`;

  const handleDownload = () => {
    const a = document.createElement("a");
    a.href = qrUrl;
    a.download = `wallet-qr-${address.slice(0, 8)}.png`;
    a.target = "_blank";
    a.click();
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="p-3 rounded-2xl bg-white shadow-lg">
        <img
          src={qrUrl}
          alt="Wallet QR Code"
          width={size}
          height={size}
          className="rounded-lg"
        />
      </div>
      <Button variant="outline" size="sm" className="gap-2 text-xs" onClick={handleDownload}>
        <Download className="h-3.5 w-3.5" />
        Save QR Code
      </Button>
    </div>
  );
}