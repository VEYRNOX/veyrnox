import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, Loader2, Fingerprint, Smartphone, Mail, CheckCircle2, ChevronRight } from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

const STEPS = [
  { id: "form", label: "Account", icon: Mail },
  { id: "otp", label: "Verify", icon: Smartphone },
  { id: "biometric", label: "Biometrics", icon: Fingerprint },
];

async function registerPasskey(email) {
  if (!window.PublicKeyCredential) return false;
  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: "SafeDigitalWallet", id: window.location.hostname },
      user: { id: new TextEncoder().encode(email), name: email, displayName: email },
      pubKeyCredParams: [{ alg: -7, type: "public-key" }, { alg: -257, type: "public-key" }],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
      timeout: 60000,
    },
  });
  return !!cred;
}

export default function Register() {
  const [step, setStep] = useState("form");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [biometricSupported] = useState(() => !!window.PublicKeyCredential);
  const [error, setError] = useState("");

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
      if (biometricSupported) {
        setStep("biometric");
      } else {
        window.location.href = "/";
      }
    } catch (err) { setError(err.message || "Invalid code"); }
    finally { setLoading(false); }
  };

  const handleEnrollBiometric = async () => {
    setBiometricLoading(true);
    try {
      await registerPasskey(email);
    } catch {}
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
            <Button type="button" variant="outline" className="w-full h-11" onClick={() => base44.auth.loginWithProvider("google", "/")}>
              <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Continue with Google
            </Button>
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
              <p className="text-sm font-medium">Set up biometric login</p>
              <p className="text-xs text-muted-foreground">Use Face ID or Touch ID to sign in faster and approve transactions</p>
            </div>
            <div className="rounded-xl bg-secondary/60 border border-border p-4 space-y-2">
              {[
                "Faster sign-in — no password needed",
                "Approve transactions with a touch",
                "Your biometric data never leaves your device",
              ].map(t => (
                <div key={t} className="flex items-start gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground">{t}</p>
                </div>
              ))}
            </div>
            <Button className="w-full h-11" onClick={handleEnrollBiometric} disabled={biometricLoading}>
              {biometricLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Fingerprint className="h-4 w-4 mr-2" />}
              Enable Biometrics
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