// @ts-nocheck
import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { X, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";

// Codex P2 2026-08-15: hard cap on any inbound QR payload before parsing.
// A malicious QR can encode up to ~2953 bytes of arbitrary text; anything
// beyond a generous ceiling is not a wallet URI and shouldn't drive parse /
// regex work on the hot camera-tick path. 2048 covers every real bip21 / EIP-681
// / bare-address use case, including chain-id and long memo params.
const MAX_QR_PAYLOAD_LEN = 2048;

// Extract the address from EIP-681 / BIP-21 / bare-address QR codes.
// Returns the plain address string, or null if the scheme is unrecognised.
// Any amount/value parameter in the URI is intentionally discarded — the user
// must enter the amount explicitly in the send form.
export function parseQrData(raw) {
  const s = (raw || '').trim();
  if (s.length > MAX_QR_PAYLOAD_LEN) return null;
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

export default function QRScanner({
  onScan,
  onClose,
  parse = parseQrData,
  title = "Scan QR Code",
  helperText = "Point your camera at a wallet address QR code",
}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const [error, setError] = useState(null);
  // Codex P2 2026-08-15: transient parse-reject banner. Separate from `error`
  // (which is a fatal camera failure and replaces the video). This overlays a
  // dismissible warning while the camera keeps scanning so the user can re-aim.
  const [warn, setWarn] = useState(null);
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
      // Codex P2 2026-08-15: don't fail-open on unknown-scheme / oversized /
      // rejected payloads. Prior behaviour handed null to onScan and closed
      // the scanner regardless, so the send form silently received "" and
      // the user had no signal that the QR they scanned was rejected. Keep
      // the camera live and show an inline error banner instead, so the
      // user can re-aim at a real address QR without reopening the scanner.
      const parsed = parse(code.data);
      if (!parsed) {
        setWarn("This QR isn't a wallet address in a supported scheme.");
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      setWarn(null);
      setScanning(false);
      stopCamera();
      onScan(parsed);
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
            <span className="font-semibold">{title}</span>
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
            {warn && (
              <div className="absolute inset-x-0 top-0 z-10 mx-3 mt-3 rounded-lg bg-destructive/90 px-3 py-2 text-xs text-white text-center">
                {warn}
              </div>
            )}
            <video ref={videoRef} className="w-full aspect-square object-cover" playsInline muted />
            {/* Scanning overlay */}
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute inset-0 border-2 border-transparent">
                {/* Corner brackets */}
                {[["top-3 start-3","border-t-2 border-s-2"],["top-3 end-3","border-t-2 border-e-2"],["bottom-3 start-3","border-b-2 border-s-2"],["bottom-3 end-3","border-b-2 border-e-2"]].map(([pos, cls], i) => (
                  <div key={i} className={`absolute ${pos} ${cls} border-primary w-6 h-6 rounded-sm`} />
                ))}
              </div>
              {scanning && (
                <div className="absolute start-4 end-4 top-1/2 h-0.5 bg-primary/70 animate-[scan_2s_ease-in-out_infinite]"
                  style={{ boxShadow: "0 0 8px hsl(28,95%,54%)" }} />
              )}
            </div>
          </div>
        )}

        <canvas ref={canvasRef} className="hidden" />
        <p className="text-center text-xs text-white/50">{helperText}</p>
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
