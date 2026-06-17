import { useState } from "react";
import { Shield, ShieldCheck, Fingerprint, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

function generateChallenge() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return arr;
}

function bufferToBase64(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

export default function PasskeySetup({ wallet, onRegistered }) {
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);

  const registerPasskey = async () => {
    if (!window.PublicKeyCredential) {
      toast.error("WebAuthn not supported in this browser");
      return;
    }
    setLoading(true);
    try {
      const credential = await navigator.credentials.create({
        publicKey: {
          challenge: generateChallenge(),
          rp: { name: "SafeCrypto Wallet", id: window.location.hostname },
          user: {
            id: new TextEncoder().encode(wallet.id),
            name: wallet.name,
            displayName: wallet.name,
          },
          pubKeyCredParams: [
            { alg: -7, type: "public-key" },
            { alg: -257, type: "public-key" },
          ],
          authenticatorSelection: {
            authenticatorAttachment: "platform",
            residentKey: "preferred",
            userVerification: "required",
          },
          timeout: 60000,
        },
      });
      const credentialId = bufferToBase64((/** @type {any} */ (credential)).rawId);
      await onRegistered(credentialId);
      setVerified(true);
      toast.success("Passkey registered successfully");
    } catch (e) {
      if (e.name !== "NotAllowedError") {
        toast.error("Failed to register passkey");
      }
    } finally {
      setLoading(false);
    }
  };

  if (wallet.passkey_registered || verified) {
    return (
      <div className="flex items-center gap-3 p-4 rounded-xl bg-primary/5 border border-primary/20">
        <ShieldCheck className="h-5 w-5 text-primary animate-pulse" />
        <div>
          <p className="text-sm font-medium text-primary">Passkey Active</p>
          <p className="text-xs text-muted-foreground">FIDO2 / WebAuthn secured</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 rounded-xl border border-border bg-card space-y-3">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center">
          <Fingerprint className="h-5 w-5 text-accent" />
        </div>
        <div>
          <p className="text-sm font-medium">Enable Passkey</p>
          <p className="text-xs text-muted-foreground">Secure with biometric / FIDO2</p>
        </div>
      </div>
      <Button onClick={registerPasskey} disabled={loading} className="w-full" size="sm">
        {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Shield className="h-4 w-4 mr-2" />}
        Register Passkey
      </Button>
    </div>
  );
}