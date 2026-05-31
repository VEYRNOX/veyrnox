import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, Loader2, Fingerprint, Smartphone, Mail, CheckCircle2, ChevronRight, ShieldAlert } from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import SocialAuthButtons from "@/components/auth/SocialAuthButtons";
import { useWallet } from "@/lib/WalletProvider";
import { getBiometricStatus, setBiometricUnlockEnabled } from "@/lib/biometric";

const STEPS = [
  { id: "form", label: "Account", icon: Mail },
  { id: "otp", label: "Verify", icon: Smartphone },
  { id: "biometric", label: "Biometrics", icon: Fingerprint },
];

export default function Register() {
  // Biometric enrol rides on the EXISTING provisional app-layer mechanism
  // (WalletProvider + lib/biometric.js) — the same gate Security settings drives.
  // In demo it shows the clearly-simulated prompt; on a real device the OS prompt
  // fires from inside keyStore.unlock(). It is NOT a new secret path.
  const { biometricPreview } = useWallet();
  const [step, setStep] = useState("form");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  // Platform-aware status/label (e.g. "Face ID", "Touch ID", "Fingerprint").
  const [bioStatus, setBioStatus] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getBiometricStatus().then(s => { if (active) setBioStatus(s); }).catch(() => {});
    return () => { active = false; };
  }, []);

  const bioLabel = bioStatus?.label || "Face ID";

  const stepIndex = STEPS.findIndex(s => s.id === step);

  const handleRegister = async (e) => {
    e.preventDefault();
    if (password !== confirm) { setError("Passwords don't match"); return; }
    setLoading(true); setError("");
    try {
      await base44.auth.register({ email, password });
      setStep("otp");
    } catch (err) { setError(err.message || "Registration failed"); }
    finally { setLoading(false); }
  };

  const handleVerify = async () => {
    setLoading(true); setError("");
    try {
      const res = await base44.auth.verifyOtp({ email, otpCode: otp });
      base44.auth.setToken(res.access_token);
      // Present the biometric enrol step before the dashboard ONLY where a prompt
      // can actually be shown (demo, or a real device with biometrics/passcode).
      // On plain web there's no platform biometric, so go straight to Home.
      const status = bioStatus || (await getBiometricStatus().catch(() => null));
      if (status?.available) {
        setStep("biometric");
      } else {
        window.location.href = "/";
      }
    } catch (err) { setError(err.message || "Invalid code"); }
    finally { setLoading(false); }
  };

  // Enable the EXISTING app-layer biometric unlock gate, then route to Home.
  // - demo : biometricPreview() shows the simulated sheet; persist the preference.
  // - native: the OS enforces biometric on the next keyStore.unlock(); we persist
  //           the preference so the toggle/UI reflect it (see biometric.js).
  // Never derives/stores key material — this is unlock-gate UX only.
  const handleEnrollBiometric = async () => {
    setBiometricLoading(true);
    try {
      await biometricPreview(); // no-op (returns false) outside demo; shows sim sheet in demo
      setBiometricUnlockEnabled(true);
    } catch { /* cancel/unsupported — fall through to Home, gate left as-is */ }
    finally { setBiometricLoading(false); window.location.href = "/"; }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-sm space-y-6">

        {/* Logo + Title */}
        <div className="text-center space-y-2">
          <div className="h-14 w-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
            <Shield className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Create Account</h1>
          <p className="text-sm text-muted-foreground">Secure crypto wallet in seconds</p>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center justify-center">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const done = i < stepIndex;
            const active = i === stepIndex;
            return (
              <div key={s.id} className="flex items-center">
                <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                  done ? "text-green-400" : active ? "text-primary bg-primary/10" : "text-muted-foreground"
                }`}>
                  {done ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  {s.label}
                </div>
                {i < STEPS.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
              </div>
            );
          })}
        </div>

        {/* Step: Form */}
        {step === "form" && (
          <form onSubmit={handleRegister} className="space-y-4">
            {error && <p className="text-sm text-destructive text-center bg-destructive/10 rounded-lg py-2 px-3">{error}</p>}
            <div>
              <Label>Email address</Label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" className="mt-1.5" required />
            </div>
            <div>
              <Label>Mobile number</Label>
              <Input type="tel" value={mobile} onChange={e => setMobile(e.target.value)} placeholder="+44 7700 000000" className="mt-1.5" />
              <p className="text-[10px] text-muted-foreground mt-1">Optional — used for SMS alerts</p>
            </div>
            <div>
              <Label>Password</Label>
              <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" className="mt-1.5" required />
            </div>
            <div>
              <Label>Confirm password</Label>
              <Input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repeat password" className="mt-1.5" required />
            </div>
            <Button type="submit" className="w-full h-11" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
              Create Account
            </Button>
            <div className="relative">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
              <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">or</span></div>
            </div>
            <SocialAuthButtons redirect="/" />
          </form>
        )}

        {/* Step: OTP */}
        {step === "otp" && (
          <div className="space-y-5">
            <div className="text-center space-y-1">
              <div className="h-12 w-12 rounded-2xl bg-blue-500/10 flex items-center justify-center mx-auto">
                <Smartphone className="h-6 w-6 text-blue-400" />
              </div>
              <p className="text-sm font-medium">Check your email</p>
              <p className="text-xs text-muted-foreground">We sent a 6-digit code to <span className="font-medium text-foreground">{email}</span></p>
            </div>
            {error && <p className="text-sm text-destructive text-center bg-destructive/10 rounded-lg py-2 px-3">{error}</p>}
            <div className="flex justify-center">
              <InputOTP maxLength={6} value={otp} onChange={setOtp}>
                <InputOTPGroup>{[0,1,2,3,4,5].map(i => <InputOTPSlot key={i} index={i} />)}</InputOTPGroup>
              </InputOTP>
            </div>
            <Button className="w-full h-11" onClick={handleVerify} disabled={otp.length < 6 || loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Verify Code
            </Button>
            <button type="button" className="text-xs text-muted-foreground hover:text-foreground w-full text-center transition-colors" onClick={() => base44.auth.resendOtp(email)}>
              Didn't receive it? <span className="text-primary">Resend code</span>
            </button>
          </div>
        )}

        {/* Step: Biometric */}
        {step === "biometric" && (
          <div className="space-y-5">
            <div className="text-center space-y-1">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
                <Fingerprint className="h-8 w-8 text-primary" />
              </div>
              <p className="text-sm font-medium">Set up {bioLabel} unlock</p>
              <p className="text-xs text-muted-foreground">Use {bioLabel} to unlock your wallet faster{bioStatus?.simulated ? " (simulated in demo)" : ""}</p>
            </div>
            <div className="rounded-xl bg-secondary/60 border border-border p-4 space-y-2">
              {[
                "Faster unlock — no password to type each time",
                `Asks for ${bioLabel} before decrypting your wallet`,
                "Your biometric data never leaves your device",
              ].map(t => (
                <div key={t} className="flex items-start gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground">{t}</p>
                </div>
              ))}
            </div>
            {/* Honest about what this gate is — provisional app-layer, pending audit. */}
            <div className="flex items-start gap-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30 px-3 py-2">
              <ShieldAlert className="h-3.5 w-3.5 text-yellow-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-muted-foreground">
                <span className="font-semibold text-yellow-600">Provisional.</span>{" "}
                App-layer unlock gate pending security audit — not a guarantee of hardware-bound security. Manage it anytime in Security settings.
              </p>
            </div>
            <Button className="w-full h-11" onClick={handleEnrollBiometric} disabled={biometricLoading}>
              {biometricLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Fingerprint className="h-4 w-4 mr-2" />}
              Enable {bioLabel}
            </Button>
            <Button variant="ghost" className="w-full text-muted-foreground text-xs" onClick={() => { window.location.href = "/"; }}>
              Skip for now
            </Button>
          </div>
        )}

        <p className="text-center text-sm text-muted-foreground">
          Already have an account? <Link to="/login" className="text-primary hover:underline font-medium">Sign in</Link>
        </p>
      </div>
    </div>
  );
}