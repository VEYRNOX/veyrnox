import { useState, useEffect } from "react";
import { Fingerprint, ShieldCheck, ShieldOff, Smartphone, Lock, CheckCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

const STORAGE_KEY = "biometric-auth-config";
const DEFAULT_CONFIG = {
  enabled: false,
  require_on_send: true,
  require_on_settings: false,
  require_on_large_transfers: true,
  large_transfer_threshold_usd: 1000,
  passkey_registered: false,
};

export default function BiometricAuth() {
  const [config, setConfig] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? { ...DEFAULT_CONFIG, ...JSON.parse(saved) } : DEFAULT_CONFIG;
  });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    setSupported(!!window.PublicKeyCredential);
  }, []);

  const save = (updates) => {
    const newConfig = { ...config, ...updates };
    setConfig(newConfig);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig));
  };

  const registerPasskey = async () => {
    if (!window.PublicKeyCredential) return;
    setTesting(true);
    setTestResult(null);
    try {
      const challenge = new Uint8Array(32);
      crypto.getRandomValues(challenge);
      await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { name: "Veyrnox", id: window.location.hostname },
          user: { id: new Uint8Array(16), name: "wallet-user", displayName: "Wallet User" },
          pubKeyCredParams: [{ type: "public-key", alg: -7 }],
          authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
          timeout: 30000,
        },
      });
      save({ passkey_registered: true, enabled: true });
      setTestResult("success");
    } catch {
      setTestResult("failed");
    }
    setTesting(false);
  };

  const testAuth = async () => {
    if (!window.PublicKeyCredential) {
      setTestResult("failed");
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const challenge = new Uint8Array(32);
      crypto.getRandomValues(challenge);
      await navigator.credentials.get({
        publicKey: {
          challenge,
          rpId: window.location.hostname,
          allowCredentials: [],
          userVerification: "required",
          timeout: 30000,
        },
      });
      setTestResult("success");
    } catch {
      setTestResult("failed");
    }
    setTesting(false);
  };

  const SETTINGS = [
    { key: "require_on_send", label: "Sending Crypto", description: "Require biometric before every send" },
    { key: "require_on_settings", label: "Accessing Settings", description: "Lock settings behind biometric" },
    { key: "require_on_large_transfers", label: "Large Transfers", description: `Transfers above $${config.large_transfer_threshold_usd.toLocaleString()}` },
  ];

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold">Biometric Re-Auth</h1>
        <p className="text-sm text-muted-foreground">Require fingerprint or Face ID before sensitive wallet actions</p>
      </div>

      {!supported && (
        <div className="p-4 rounded-xl border border-caution/30 bg-caution/5 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-caution shrink-0 mt-0.5" />
          <div><p className="text-sm font-medium">Device Not Supported</p><p className="text-xs text-muted-foreground mt-0.5">Your browser or device doesn't support WebAuthn biometric authentication.</p></div>
        </div>
      )}

      {/* Master toggle */}
      <div className={`p-4 rounded-xl border ${config.enabled ? "border-success/30 bg-success/5" : "border-border bg-card"}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {config.enabled ? <ShieldCheck className="h-6 w-6 text-success" /> : <ShieldOff className="h-6 w-6 text-muted-foreground" />}
            <div>
              <p className="font-semibold">{config.enabled ? "Biometric Auth Enabled" : "Biometric Auth Disabled"}</p>
              <p className="text-xs text-muted-foreground">{config.passkey_registered ? "Passkey registered ✓" : "No passkey registered"}</p>
            </div>
          </div>
          <Switch checked={config.enabled} onCheckedChange={v => save({ enabled: v })} disabled={!supported} />
        </div>
        {!config.passkey_registered && supported && (
          <Button className="w-full mt-4 gap-2" onClick={registerPasskey} disabled={testing}>
            <Fingerprint className="h-4 w-4" /> {testing ? "Registering..." : "Register Biometric / Passkey"}
          </Button>
        )}
        {config.passkey_registered && (
          <div className="mt-3 flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-success" />
            <span className="text-xs text-success font-medium">Passkey registered</span>
            <Button size="sm" variant="ghost" className="ml-auto text-xs text-muted-foreground" onClick={registerPasskey}>Re-register</Button>
          </div>
        )}
      </div>

      {/* Per-action settings */}
      <div className="space-y-2">
        <p className="text-sm font-semibold">Require Biometric For</p>
        {SETTINGS.map(s => (
          <div key={s.key} className="flex items-center justify-between p-3.5 rounded-xl border border-border bg-card">
            <div className="flex items-center gap-3">
              <Lock className="h-4 w-4 text-muted-foreground" />
              <div><p className="text-sm font-medium">{s.label}</p><p className="text-xs text-muted-foreground">{s.description}</p></div>
            </div>
            <Switch checked={config[s.key]} onCheckedChange={v => save({ [s.key]: v })} disabled={!config.enabled} />
          </div>
        ))}
      </div>

      {/* Test */}
      <div className="p-4 rounded-xl border border-border bg-card">
        <p className="text-sm font-semibold mb-3 flex items-center gap-2"><Smartphone className="h-4 w-4" /> Test Authentication</p>
        <Button variant="outline" className="w-full" onClick={testAuth} disabled={testing || !config.enabled}>
          {testing ? "Authenticating..." : "Test Biometric Now"}
        </Button>
        {testResult === "success" && <p className="text-xs text-success mt-2 flex items-center gap-1"><CheckCircle className="h-3.5 w-3.5" /> Authentication successful</p>}
        {testResult === "failed" && <p className="text-xs text-destructive mt-2 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Authentication failed</p>}
      </div>
    </div>
  );
}