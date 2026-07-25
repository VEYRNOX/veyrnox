// src/pages/SeedVerificationPage.jsx — route target for /verify.
//
// The SeedVerification quiz component (Task 5) needs the actual mnemonic
// words to build its quiz, and getting those words requires going through
// the existing biometric/password reauth gate (useRevealWithReauth) that
// guards mnemonic reveal elsewhere in the app (e.g. WalletSeedQR). Wiring
// that reauth flow is security-sensitive and out of scope for this task —
// this page exists so other flows (the wallet page reminder, the send-gate
// redirect in a later task) have a stable /verify destination to land on.
//
// cancelVerificationReminders() is called on mount so simply visiting this
// page — even before the reauth-gated quiz is wired up — stops nagging the
// user with further reminders about verifying their backup.
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ShieldCheck } from "lucide-react";
import { cancelVerificationReminders } from "@/lib/tracking-integration";

export default function SeedVerificationPage() {
  const navigate = useNavigate();

  useEffect(() => {
    cancelVerificationReminders();
  }, []);

  return (
    <div className="max-w-sm mx-auto space-y-6 p-6 pt-12 text-center">
      <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
        <ShieldCheck className="h-6 w-6 text-primary" />
      </div>
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Seed verification</h2>
        <p className="text-sm text-muted-foreground">
          Verifying your backup requires re-authenticating with your vault password or
          biometric — the same protection that guards revealing your seed phrase
          anywhere else in Veyrnox. That flow isn't wired up on this page yet.
        </p>
      </div>
      <Button className="w-full" variant="outline" onClick={() => navigate("/")}>
        Back to wallet
      </Button>
    </div>
  );
}
