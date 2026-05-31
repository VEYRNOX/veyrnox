import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import {
  ShieldCheck, Mail, Loader2, KeyRound, RefreshCw,
  AlertCircle, Fingerprint
} from "lucide-react";
import { toast } from "sonner";

export default function MFADialog({ open, onOpenChange, onVerified, actionDescription }) {
  const [method, setMethod] = useState(null); // null | "passkey" | "otp"
  const [otpSecret, setOtpSecret] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [passkeyPending, setPasskeyPending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");

  const { data: wallets = [] } = useQuery({
    queryKey: ["wallets"],
    queryFn: () => base44.entities.Wallet.list(),
    enabled: open,
  });

  const hasPasskey = wallets.some(w => w.passkey_registered) && !!window.PublicKeyCredential;

  // Reset state whenever dialog opens
  useEffect(() => {
    if (open) {
      setMethod(null);
      setOtpCode("");
      setOtpSent(false);
      setError("");
      setPasskeyPending(false);
    }
  }, [open]);

  const tryPasskey = async () => {
    setMethod("passkey");
    setPasskeyPending(true);
    setError("");
    try {
      await navigator.credentials.get({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          timeout: 60000,
          userVerification: "required",
          rpId: window.location.hostname,
        },
      });
      setVerifying(true);
      await onVerified();
      onOpenChange(false);
    } catch (e) {
      if (e.name === "NotAllowedError") {
        setError("Passkey prompt was dismissed. Try email OTP instead.");
      } else {
        setError("Passkey verification failed. Try email OTP instead.");
      }
    } finally {
      setPasskeyPending(false);
      setVerifying(false);
    }
  };

  const sendOTP = async () => {
    setMethod("otp");
    setSending(true);
    setError("");
    try {
      const user = await base44.auth.me();
      const code = String(Math.floor(100000 + Math.random() * 900000));
      setOtpSecret(code);
      await base44.integrations.Core.SendEmail({
        to: user.email,
        subject: "Veyrnox - Action Verification Code",
        body: `Your one-time MFA code is: ${code}\n\nAction: ${actionDescription}\n\nThis code expires in 10 minutes. If you did not request this, please secure your account immediately.`,
      });
      setOtpSent(true);
      toast.success("Verification code sent to your email");
    } catch {
      setError("Failed to send verification code. Please try again.");
      setMethod(null);
    } finally {
      setSending(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (otpCode.trim() !== otpSecret) {
      setError("Incorrect code. Please try again.");
      setOtpCode("");
      return;
    }
    setVerifying(true);
    try {
      await onVerified();
      onOpenChange(false);
    } catch {
      setError("Action failed. Please try again.");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Verify Identity
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Action summary */}
          <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Action: </span>{actionDescription}
          </div>

          {/* Method picker */}
          {!method && (
            <div className="space-y-2">
              <p className="text-xs text-center text-muted-foreground font-medium uppercase tracking-widest">
                Choose verification method
              </p>
              {hasPasskey && (
                <Button className="w-full gap-2" onClick={tryPasskey}>
                  <Fingerprint className="h-4 w-4" />
                  Use Passkey / Biometric (FIDO2)
                </Button>
              )}
              <Button
                variant={hasPasskey ? "outline" : "default"}
                className="w-full gap-2"
                onClick={sendOTP}
                disabled={sending}
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                Send Email OTP
              </Button>
            </div>
          )}

          {/* Passkey pending */}
          {method === "passkey" && passkeyPending && (
            <div className="text-center py-6 space-y-3">
              <Fingerprint className="h-12 w-12 text-primary mx-auto animate-pulse" />
              <p className="text-sm font-medium">Follow the prompt on your device</p>
              <p className="text-xs text-muted-foreground">Use your biometric or security key to verify</p>
            </div>
          )}

          {/* Passkey error — show retry options */}
          {method === "passkey" && !passkeyPending && error && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/20">
                <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                <p className="text-xs text-destructive">{error}</p>
              </div>
              <Button className="w-full gap-2" onClick={tryPasskey}>
                <Fingerprint className="h-4 w-4" /> Retry Passkey
              </Button>
              <Button variant="ghost" size="sm" className="w-full gap-1.5" onClick={() => { setError(""); setMethod(null); }}>
                Try another method
              </Button>
            </div>
          )}

          {/* OTP sending */}
          {method === "otp" && sending && (
            <div className="text-center py-4 space-y-2">
              <Loader2 className="h-7 w-7 animate-spin text-muted-foreground mx-auto" />
              <p className="text-xs text-muted-foreground">Sending verification code...</p>
            </div>
          )}

          {/* OTP entry */}
          {method === "otp" && otpSent && !sending && (
            <>
              <div className="flex items-start gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                <Mail className="h-4 w-4 text-green-400 shrink-0 mt-0.5" />
                <p className="text-xs text-green-300">
                  A 6-digit code was sent to your registered email. Enter it below to continue.
                </p>
              </div>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={otpCode}
                onChange={e => { setOtpCode(e.target.value.replace(/\D/g, "")); setError(""); }}
                placeholder="000000"
                className="w-full text-center text-2xl font-mono tracking-[0.5em] h-14 rounded-lg border border-input bg-transparent focus:outline-none focus:ring-1 focus:ring-ring"
                autoFocus
              />
              {error && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/20">
                  <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                  <p className="text-xs text-destructive">{error}</p>
                </div>
              )}
              <Button
                className="w-full gap-2"
                disabled={otpCode.length !== 6 || verifying}
                onClick={handleVerifyOTP}
              >
                {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                Verify and Continue
              </Button>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" className="flex-1 gap-1.5" onClick={() => { setOtpSent(false); setOtpCode(""); sendOTP(); }}>
                  <RefreshCw className="h-3.5 w-3.5" /> Resend
                </Button>
                <Button variant="ghost" size="sm" className="flex-1" onClick={() => { setError(""); setMethod(null); }}>
                  Back
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}