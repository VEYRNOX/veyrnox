import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ArrowLeft, AlertTriangle } from "lucide-react";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try { await base44.auth.resetPasswordRequest(email); } catch {}
    setSent(true);
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-xl font-bold text-center">Reset account password</h1>
        {/* HONESTY (S1, non-custodial): this resets only your Veyrnox ACCOUNT
            login (the app sign-in), NOT your self-custody wallet. We never hold
            your keys, so we cannot reset your vault password or recover your
            wallet. The only way back into a wallet whose password you lost is
            your seed phrase. Do NOT imply a recovery path that doesn't exist. */}
        <div className="flex items-start gap-2 p-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5 text-xs text-yellow-600">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            This resets your Veyrnox <b>account login</b> only. It does <b>not</b>{" "}
            reset your wallet's vault password or recover your wallet — we never
            hold your keys. If you forgot your <b>vault</b> password, recover with
            your seed phrase on the{" "}
            <Link to="/wallet-access" className="underline font-medium">Access &amp; Recovery</Link>{" "}
            page.
          </span>
        </div>
        {sent ? (
          <div className="text-center space-y-3">
            <p className="text-sm text-muted-foreground">If an account exists for {email}, you'll receive a reset link.</p>
            <Link to="/login" className="text-sm text-primary hover:underline">Back to login</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div><Label>Email</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-1.5" required /></div>
            <Button type="submit" className="w-full" disabled={loading}>{loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Send Reset Link</Button>
          </form>
        )}
        <Link to="/login" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground justify-center"><ArrowLeft className="h-3.5 w-3.5" />Back to login</Link>
      </div>
    </div>
  );
}