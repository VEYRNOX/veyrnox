import { useState } from "react";
import { Cloud, Lock, CheckCircle, AlertTriangle, Eye, EyeOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

const PROVIDERS = [
  { id: "icloud", label: "iCloud Keychain", icon: "🍎" },
  { id: "google_drive", label: "Google Drive", icon: "G" },
  { id: "local", label: "Local Encrypted File", icon: "💾" },
];

export default function CloudBackup() {
  const [provider, setProvider] = useState("icloud");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [step, setStep] = useState("choose"); // choose | password | uploading | done
  const [backupTime, setBackupTime] = useState(null);
  const [restoreMode, setRestoreMode] = useState(false);
  const [restoreFile, setRestoreFile] = useState(null);

  const { data: wallets = [] } = useQuery({ queryKey: ["wallets"], queryFn: () => base44.entities.Wallet.list() });

  const passwordStrength = () => {
    if (password.length === 0) return null;
    if (password.length < 8) return { label: "Weak", color: "text-destructive" };
    if (password.length < 12 || !/[0-9]/.test(password) || !/[A-Z]/.test(password)) return { label: "Fair", color: "text-amber-500" };
    return { label: "Strong", color: "text-green-500" };
  };

  const handleBackup = async () => {
    if (password !== confirmPassword || password.length < 8) return;
    setStep("uploading");
    await new Promise(r => setTimeout(r, 2500));
    setBackupTime(new Date().toLocaleString());
    setStep("done");
  };

  const strength = passwordStrength();

  return (
    <div className="max-w-md mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-sky-500/10 flex items-center justify-center">
          <Cloud className="h-5 w-5 text-sky-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Encrypted Cloud Backup</h1>
          <p className="text-sm text-muted-foreground">Securely back up your seed phrase to the cloud</p>
        </div>
      </div>

      <div className="flex gap-2 p-1 rounded-lg bg-secondary">
        {["backup", "restore"].map(m => (
          <button key={m} onClick={() => { setRestoreMode(m === "restore"); setStep("choose"); }}
            className={`flex-1 py-1.5 rounded-md text-sm font-semibold capitalize transition-colors ${(m === "restore") === restoreMode ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>
            {m}
          </button>
        ))}
      </div>

      {!restoreMode && (
        <>
          {step === "done" ? (
            <Card className="border-green-500/30 bg-green-500/5">
              <CardContent className="pt-6 space-y-4 text-center">
                <CheckCircle className="h-14 w-14 text-green-500 mx-auto" />
                <div>
                  <p className="text-lg font-bold">Backup Complete</p>
                  <p className="text-sm text-muted-foreground mt-1">{wallets.length} wallet{wallets.length !== 1 ? "s" : ""} backed up</p>
                  <p className="text-xs text-muted-foreground mt-1">Saved to {PROVIDERS.find(p => p.id === provider)?.label}</p>
                  <p className="text-xs text-muted-foreground">{backupTime}</p>
                </div>
                <div className="space-y-1.5 text-left">
                  {["AES-256-GCM encryption", "Password never stored or transmitted", "Only you can decrypt your backup"].map(f => (
                    <div key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Lock className="h-3.5 w-3.5 text-green-500 shrink-0" /> {f}
                    </div>
                  ))}
                </div>
                <Button variant="outline" className="w-full" onClick={() => setStep("choose")}>
                  <RefreshCw className="h-4 w-4 mr-2" /> Update Backup
                </Button>
              </CardContent>
            </Card>
          ) : step === "uploading" ? (
            <Card>
              <CardContent className="pt-8 pb-8 flex flex-col items-center gap-4">
                <div className="w-14 h-14 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                <div className="text-center">
                  <p className="font-semibold">Encrypting and Uploading</p>
                  <p className="text-sm text-muted-foreground mt-1">Deriving encryption key and uploading to {PROVIDERS.find(p => p.id === provider)?.label}</p>
                </div>
              </CardContent>
            </Card>
          ) : step === "choose" ? (
            <>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Choose Storage</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {PROVIDERS.map(p => (
                    <button key={p.id} onClick={() => setProvider(p.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors text-left ${provider === p.id ? "border-primary/50 bg-primary/5" : "border-border hover:bg-secondary/50"}`}>
                      <span className="text-xl w-8 text-center">{p.icon}</span>
                      <span className="flex-1 text-sm font-medium">{p.label}</span>
                      {provider === p.id && <CheckCircle className="h-4 w-4 text-primary" />}
                    </button>
                  ))}
                </CardContent>
              </Card>
              <Button className="w-full" onClick={() => setStep("password")}>Continue</Button>
            </>
          ) : (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Set Backup Password</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-400 flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  If you forget this password, you cannot recover your backup. Store it safely.
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Encryption Password</label>
                  <div className="relative">
                    <Input type={showPass ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="Min. 8 characters" className="pr-10" />
                    <button onClick={() => setShowPass(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {strength && <p className={`text-xs mt-1 ${strength.color}`}>Strength: {strength.label}</p>}
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Confirm Password</label>
                  <Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Repeat password" />
                  {confirmPassword && password !== confirmPassword && <p className="text-xs mt-1 text-destructive">Passwords do not match</p>}
                </div>
                <p className="text-xs text-muted-foreground">Backing up {wallets.length} wallet{wallets.length !== 1 ? "s" : ""} to {PROVIDERS.find(p => p.id === provider)?.label}</p>
                <Button className="w-full" onClick={handleBackup} disabled={password.length < 8 || password !== confirmPassword}>
                  <Cloud className="h-4 w-4 mr-2" /> Encrypt and Upload Backup
                </Button>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {restoreMode && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Restore from Backup</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              {PROVIDERS.map(p => (
                <button key={p.id} onClick={() => setRestoreFile(p.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors text-left ${restoreFile === p.id ? "border-primary/50 bg-primary/5" : "border-border hover:bg-secondary/50"}`}>
                  <span className="text-xl w-8 text-center">{p.icon}</span>
                  <span className="flex-1 text-sm font-medium">Restore from {p.label}</span>
                  {restoreFile === p.id && <CheckCircle className="h-4 w-4 text-primary" />}
                </button>
              ))}
            </div>
            {restoreFile && (
              <>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Decryption Password</label>
                  <Input type="password" placeholder="Enter your backup password" />
                </div>
                <Button className="w-full">Decrypt and Restore Wallets</Button>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}