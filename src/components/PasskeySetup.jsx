// @ts-nocheck
import { useState, useEffect } from "react";
import { Shield, ShieldCheck, Fingerprint, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { isWebAuthnSupported, passkeyUserHandle } from "@/lib/passkey";
import { useWallet } from "@/lib/WalletProvider";
import { Capacitor } from "@capacitor/core";
import Spinner from "@/components/Spinner";

function generateChallenge() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return arr;
}

function bufferToBase64(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function generateNativeCredentialId() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return "native:" + bufferToBase64(bytes);
}

export default function PasskeySetup({ wallet, onRegistered }) {
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);
  // null = checking, true = available, false = unavailable
  const [nativeBiometryAvailable, setNativeBiometryAvailable] = useState(null);
  const { withLockSuppressed } = useWallet();

  const isNative = Capacitor.isNativePlatform();

  useEffect(() => {
    if (!isNative) return;
    (async () => {
      try {
        const { BiometricAuth } = await import("@aparajita/capacitor-biometric-auth");
        const info = await BiometricAuth.checkBiometry();
        setNativeBiometryAvailable(!!info.isAvailable);
      } catch {
        setNativeBiometryAvailable(false);
      }
    })();
  }, [isNative]);

  const registerNative = async () => {
    setLoading(true);
    try {
      const { BiometricAuth } = await import("@aparajita/capacitor-biometric-auth");
      // withLockSuppressed prevents the app's background-lock hook from firing
      // while the OS biometric dialog is open (the dialog briefly pauses the app
      // which would otherwise redirect to the PIN unlock screen mid-flow). Routed
      // through the R2 WalletProvider facade (issue #627) rather than importing
      // wallet-core/keystore directly from this R3 UI component.
      await withLockSuppressed(async () => {
        await BiometricAuth.authenticate({
          reason: "Register a passkey for this wallet",
          androidTitle: "Register Wallet Passkey",
          androidSubtitle: "Confirm your identity to register",
          cancelTitle: "Cancel",
          allowDeviceCredential: false,
        });
      });
      const credentialId = generateNativeCredentialId();
      await onRegistered(credentialId);
      setVerified(true);
      toast.success("Passkey registered successfully");
    } catch (e) {
      // BiometricAuth throws with .code on cancel — don't toast on user cancel
      if (e?.code !== "userCancel" && e?.message !== "userCancel") {
        toast.error("Failed to register passkey");
      }
    } finally {
      setLoading(false);
    }
  };

  const registerWeb = async () => {
    if (!isWebAuthnSupported()) {
      toast.error("Passkeys require a browser with biometric / FIDO2 support. Try Chrome, Safari, or Edge on a device with a fingerprint sensor or Face ID.");
      return;
    }
    setLoading(true);
    try {
      // Codex P2 2026-08-15: the previous form embedded the wallet's stable
      // id + user-chosen name into WebAuthn user metadata, which persists in
      // platform passkey managers (Apple/Google/Microsoft Passwords) and can
      // sync across the user's account. That leaks wallet identity into a
      // third-party surface the wallet has no control over. Use an opaque
      // user.id (per WebAuthn §5.4.3) and a generic display name.
      //
      // Branch review 2026-08-15 (S-3): the handle is DERIVED, not random.
      // Platform managers key credentials on (rp.id, user.id), so a fresh
      // random handle per registration is opaque but makes every
      // re-registration ADD an entry rather than replace the old one — which
      // collides with the clone flow telling the user to re-register after an
      // anti-cloning failure. passkeyUserHandle() is a domain-separated hash of
      // wallet.id (16 bytes CSPRNG, so 128 bits behind the preimage): opaque
      // AND stable. See lib/passkey.js for the full rationale.
      const anonUserId = passkeyUserHandle(wallet.id);
      const credential = await navigator.credentials.create({
        publicKey: {
          challenge: generateChallenge(),
          rp: { name: "Veyrnox", id: window.location.hostname },
          user: {
            id: anonUserId,
            name: "Veyrnox wallet",
            displayName: "Veyrnox wallet",
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
        <ShieldCheck className="h-5 w-5 text-primary motion-safe:animate-pulse" />
        <div>
          <p className="text-sm font-medium text-primary">Passkey Active</p>
          <p className="text-xs text-muted-foreground">FIDO2 / WebAuthn secured</p>
        </div>
      </div>
    );
  }

  // Native: still probing biometry availability
  if (isNative && nativeBiometryAvailable === null) {
    return (
      <div className="p-4 rounded-xl border border-border bg-card">
        <div className="flex items-center gap-3">
          <Spinner label="Checking biometric availability…" />
          <p className="text-sm text-muted-foreground">Checking biometric availability…</p>
        </div>
      </div>
    );
  }

  // Native: biometry not available on this device
  if (isNative && !nativeBiometryAvailable) {
    return (
      <div className="p-4 rounded-xl border border-border bg-card">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
            <Fingerprint className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Biometrics not available</p>
            <p className="text-xs text-muted-foreground">Set up fingerprint or face unlock in your device settings first.</p>
          </div>
        </div>
      </div>
    );
  }

  // Web: WebAuthn not supported
  if (!isNative && !isWebAuthnSupported()) {
    return (
      <div className="p-4 rounded-xl border border-border bg-card">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
            <Fingerprint className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Passkey not available</p>
            <p className="text-xs text-muted-foreground">Use Chrome, Safari, or Edge on a device with biometrics or a security key.</p>
          </div>
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
          <p className="text-xs text-muted-foreground">
            {isNative ? "Secure with device biometrics" : "Secure with biometric / FIDO2"}
          </p>
        </div>
      </div>
      <Button
        onClick={isNative ? registerNative : registerWeb}
        disabled={loading}
        className="w-full"
        size="sm"
      >
        {loading ? <Loader2 className="h-4 w-4 motion-safe:animate-spin me-2" /> : <Shield className="h-4 w-4 me-2" />}
        Register Passkey
      </Button>
    </div>
  );
}
