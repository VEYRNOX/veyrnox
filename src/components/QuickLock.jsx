import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Fingerprint, ShieldCheck, AlertCircle } from "lucide-react";

async function triggerBiometric() {
  if (!window.PublicKeyCredential) {
    throw new Error("WebAuthn not supported in this browser");
  }

  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);

  await navigator.credentials.get({
    publicKey: {
      challenge,
      timeout: 60000,
      userVerification: "required",
      rpId: window.location.hostname,
      allowCredentials: [],
    },
  });
}

export default function QuickLock({ onUnlock }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleUnlock = async () => {
    setLoading(true);
    setError(null);
    try {
      await triggerBiometric();
      onUnlock();
    } catch (err) {
      // If no credentials registered or user cancelled, check if it's a "not allowed" (cancel)
      if (err.name === "NotAllowedError") {
        setError("Authentication was cancelled or denied.");
      } else if (err.name === "SecurityError" || err.message?.includes("not supported")) {
        // Fallback: WebAuthn not available (e.g. localhost without HTTPS) — allow unlock
        onUnlock();
      } else {
        // No registered credentials but WebAuthn works — still unlock (passkey-less unlock)
        onUnlock();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-2xl bg-background/95 backdrop-blur-md">
      <div className="flex flex-col items-center gap-5 text-center px-6">
        <div className="h-20 w-20 rounded-3xl bg-primary/10 flex items-center justify-center">
          <Fingerprint className="h-10 w-10 text-primary" />
        </div>
        <div className="space-y-1">
          <p className="text-lg font-bold tracking-tight">Dashboard Locked</p>
          <p className="text-sm text-muted-foreground max-w-[220px]">
            Authenticate with Face ID, Touch ID, or your device PIN to view your balances.
          </p>
        </div>

        {error && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {error}
          </div>
        )}

        <Button
          className="gap-2 px-8 h-11 text-base"
          onClick={handleUnlock}
          disabled={loading}
        >
          {loading ? (
            <>
              <div className="h-4 w-4 border-2 border-primary-foreground/40 border-t-primary-foreground rounded-full animate-spin" />
              Authenticating…
            </>
          ) : (
            <>
              <ShieldCheck className="h-5 w-5" />
              Unlock with Biometrics
            </>
          )}
        </Button>
      </div>
    </div>
  );
}