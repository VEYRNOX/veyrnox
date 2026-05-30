import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Shield, Eye, EyeOff, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function DuressPin() {
  const [user, setUser] = useState(null);
  const [step, setStep] = useState("view"); // view | set | confirm | done
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    base44.auth.me().then(setUser);
  }, []);

  const hasPin = !!user?.duress_pin;

  const handleSave = async () => {
    setError("");
    if (pin.length < 4) { setError("PIN must be at least 4 digits"); return; }
    if (pin !== confirmPin) { setError("PINs do not match"); return; }
    if (pin === user?.pin) { setError("Duress PIN cannot be the same as your main PIN"); return; }
    setSaving(true);
    await base44.auth.updateMe({ duress_pin: pin });
    const updated = await base44.auth.me();
    setUser(updated);
    setSaving(false);
    setStep("done");
    setPin("");
    setConfirmPin("");
  };

  const handleRemove = async () => {
    setSaving(true);
    await base44.auth.updateMe({ duress_pin: null });
    const updated = await base44.auth.me();
    setUser(updated);
    setSaving(false);
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold">Duress PIN</h1>
        <p className="text-sm text-muted-foreground">A secondary PIN that grants access while hiding high-value wallets</p>
      </div>

      <div className="p-5 rounded-xl border border-border bg-card space-y-4">
        <div className="flex items-start gap-3">
          <Shield className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold">How it works</p>
            <p className="text-xs text-muted-foreground mt-1">If you're ever coerced into unlocking your wallet, enter your Duress PIN instead of your real PIN. The app will open normally but automatically hide wallets marked as "hidden under duress" — protecting your largest holdings.</p>
          </div>
        </div>
      </div>

      <div className="p-5 rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {hasPin ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : <AlertTriangle className="h-5 w-5 text-yellow-500" />}
            <span className="font-medium">{hasPin ? "Duress PIN is active" : "No Duress PIN set"}</span>
          </div>
          {hasPin && (
            <Button variant="destructive" size="sm" disabled={saving} onClick={handleRemove}>
              {saving ? "Removing..." : "Remove PIN"}
            </Button>
          )}
        </div>

        {step === "done" && (
          <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-500 text-sm text-center font-medium">
            ✓ Duress PIN saved successfully
          </div>
        )}

        {step !== "done" && (
          <div className="space-y-4">
            <div>
              <Label>New Duress PIN</Label>
              <div className="relative mt-1.5">
                <Input type={showPin ? "text" : "password"} inputMode="numeric" maxLength={8} placeholder="4–8 digits" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ""))} className="pr-10 tracking-widest text-lg" />
                <button className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowPin(s => !s)}>
                  {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div>
              <Label>Confirm Duress PIN</Label>
              <Input type={showPin ? "text" : "password"} inputMode="numeric" maxLength={8} placeholder="Re-enter PIN" value={confirmPin} onChange={e => setConfirmPin(e.target.value.replace(/\D/g, ""))} className="mt-1.5 tracking-widest text-lg" />
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <Button className="w-full" disabled={!pin || !confirmPin || saving} onClick={handleSave}>
              {saving ? "Saving..." : hasPin ? "Update Duress PIN" : "Set Duress PIN"}
            </Button>
          </div>
        )}
        {step === "done" && (
          <Button variant="outline" className="w-full mt-3" onClick={() => { setStep("view"); }}>Change PIN</Button>
        )}
      </div>

      <div className="p-4 rounded-xl bg-secondary/50 border border-border">
        <p className="text-xs text-muted-foreground">⚠️ Never share your Duress PIN. Store it somewhere safe. If you forget it, remove and reset via this page using your normal login.</p>
      </div>
    </div>
  );
}