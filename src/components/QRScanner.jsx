import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { X, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";

// Extract the address from EIP-681 / BIP-21 / bare-address QR codes.
// Returns the plain address string, or null if the scheme is unrecognised.
// Any amount/value parameter in the URI is intentionally discarded — the user
// must enter the amount explicitly in the send form.
function parseQrData(raw) {
  const s = (raw || '').trim();
  // EIP-681: ethereum:<address>[/@chainId][?params]
  if (/^ethereum:/i.test(s)) {
    const body = s.slice('ethereum:'.length).split('?')[0].split('@')[0];
    return body || null;
  }
  // BIP-21: bitcoin:<address>[?params]
  if (/^bitcoin:/i.test(s)) {
    return s.slice('bitcoin:'.length).split('?')[0] || null;
  }
  // Solana URI: solana:<address>[?params]
  if (/^solana:/i.test(s)) {
    return s.slice('solana:'.length).split('?')[0] || null;
  }
  // Bare address (0x…, bc1…, base58 SOL) — pass through as-is.
  if (/^(0x[0-9a-fA-F]{40}|bc1[a-zA-HJ-NP-Z0-9]{25,}|[1-9A-HJ-NP-Za-km-z]{32,44})$/.test(s)) {
    return s;
  }
  // Unknown scheme — reject to avoid javascript:/data: injection.
  return null;
}

export default function QRScanner({ onScan, onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const [error, setError] = useState(null);
  const [scanning, setScanning] = useState(true);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, []);

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      videoRef.current.play();
      videoRef.current.onloadedmetadata = () => tick();
    } catch {
      setError("Camera access denied. Please allow camera permissions.");
    }
  }

  function stopCamera() {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
  }

  function tick() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    const ctx = canvas.getContext("2d");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height);
    if (code) {
      setScanning(false);
      stopCamera();
      // Parse EIP-681 (ethereum:) and BIP-21 (bitcoin:/solana:) URIs so only the
      // address component reaches the send form (VULN-10 fix). A raw URI in the
      // address field fails validation and silently discards any attacker-specified
      // amount embedded in the QR. Unknown schemes are rejected outright.
      onScan(parseQrData(code.data));
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-white">
            <Camera className="h-5 w-5 text-primary" />
            <span className="font-semibold">Scan QR Code</span>
          </div>
          <Button size="icon" variant="ghost" className="text-white hover:text-white hover:bg-white/10" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {error ? (
          <div className="rounded-xl bg-destructive/20 border border-destructive/30 p-4 text-sm text-destructive-foreground text-center">
            {error}
          </div>
        ) : (
          <div className="relative rounded-2xl overflow-hidden border-2 border-primary shadow-[0_0_30px_hsl(28,95%,54%,0.3)]">
            <video ref={videoRef} className="w-full aspect-square object-cover" playsInline muted />
            {/* Scanning overlay */}
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute inset-0 border-2 border-transparent">
                {/* Corner brackets */}
                {[["top-3 left-3","border-t-2 border-l-2"],["top-3 right-3","border-t-2 border-r-2"],["bottom-3 left-3","border-b-2 border-l-2"],["bottom-3 right-3","border-b-2 border-r-2"]].map(([pos, cls], i) => (
                  <div key={i} className={`absolute ${pos} ${cls} border-primary w-6 h-6 rounded-sm`} />
                ))}
              </div>
              {scanning && (
                <div className="absolute left-4 right-4 top-1/2 h-0.5 bg-primary/70 animate-[scan_2s_ease-in-out_infinite]"
                  style={{ boxShadow: "0 0 8px hsl(28,95%,54%)" }} />
              )}
            </div>
          </div>
        )}

        <canvas ref={canvasRef} className="hidden" />
        <p className="text-center text-xs text-white/50">Point your camera at a wallet address QR code</p>
      </div>

      <style>{`
        @keyframes scan {
          0%, 100% { transform: translateY(-60px); opacity: 0.4; }
          50% { transform: translateY(60px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}