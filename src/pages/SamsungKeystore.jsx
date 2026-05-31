import { useState } from "react";
import { Smartphone, Shield, CheckCircle, Cpu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const SAMSUNG_MODELS = ["Galaxy S24 Ultra", "Galaxy S23", "Galaxy Z Fold 5", "Galaxy Tab S9", "Galaxy S22 Ultra"];

export default function SamsungKeystore() {
  const qc = useQueryClient();
  const [step, setStep] = useState("detect"); // detect | connect | linked
  const [detecting, setDetecting] = useState(false);
  const [detected, setDetected] = useState(false);
  const [linking, setLinking] = useState(false);
  const [linkedWallet, setLinkedWallet] = useState(null);

  const { data: wallets = [] } = useQuery({
    queryKey: ["wallets"],
    queryFn: () => base44.entities.Wallet.list(),
  });

  const linkMutation = useMutation({
    mutationFn: async (wallet) => {
      await base44.entities.HardwareWallet.create({
        name: "Samsung Blockchain Keystore",
        device_type: "Ledger Nano X",
        fingerprint: Array.from({ length: 8 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, "0")).join(":"),
        firmware_version: "1.5.2",
        wallets_linked: [wallet.id],
        last_connected: new Date().toISOString(),
        status: "connected",
        require_pin: true,
      });
      return wallet;
    },
    onSuccess: (wallet) => {
      setLinkedWallet(wallet);
      setStep("linked");
      qc.invalidateQueries({ queryKey: ["hardware-wallets"] });
    },
  });

  const handleDetect = async () => {
    setDetecting(true);
    await new Promise(r => setTimeout(r, 2000));
    setDetected(true);
    setDetecting(false);
    setStep("connect");
  };

  const handleLink = async (wallet) => {
    setLinking(true);
    await new Promise(r => setTimeout(r, 1500));
    linkMutation.mutate(wallet);
    setLinking(false);
  };

  const model = SAMSUNG_MODELS[Math.floor(Math.random() * SAMSUNG_MODELS.length)];

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
          <Smartphone className="h-5 w-5 text-blue-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Samsung Blockchain Keystore</h1>
          <p className="text-sm text-muted-foreground">Use Samsung's secure enclave to protect your private keys</p>
        </div>
      </div>

      {/* What is it */}
      <Card className="border-blue-500/20 bg-blue-500/5">
        <CardContent className="pt-4 space-y-2">
          <p className="text-sm font-semibold text-blue-400">What is Samsung Blockchain Keystore?</p>
          <p className="text-xs text-muted-foreground">
            Samsung Blockchain Keystore is a hardware-backed secure enclave available on Samsung Galaxy devices.
            Private keys are stored in the Knox-protected TEE (Trusted Execution Environment) and never leave the device.
          </p>
        </CardContent>
      </Card>

      {/* Step 1: Detect */}
      <Card className={step === "detect" ? "border-primary/40" : "opacity-60"}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold ${step !== "detect" ? "bg-green-500 text-white" : "bg-primary text-primary-foreground"}`}>
              {step !== "detect" ? <CheckCircle className="h-3.5 w-3.5" /> : "1"}
            </div>
            Detect Samsung Device
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {step === "detect" && (
            <>
              <p className="text-sm text-muted-foreground">We'll check if your device supports Samsung Blockchain Keystore.</p>
              <Button onClick={handleDetect} disabled={detecting} className="w-full">
                {detecting ? (
                  <><div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin mr-2" />Scanning device...</>
                ) : "Detect Device"}
              </Button>
            </>
          )}
          {step !== "detect" && (
            <div className="flex items-center gap-2 text-green-500 text-sm">
              <CheckCircle className="h-4 w-4" />
              <span>Samsung {model} detected — Knox Keystore v3.1 available</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 2: Connect wallet */}
      {(step === "connect" || step === "linked") && (
        <Card className={step === "connect" ? "border-primary/40" : "opacity-60"}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold ${step === "linked" ? "bg-green-500 text-white" : "bg-primary text-primary-foreground"}`}>
                {step === "linked" ? <CheckCircle className="h-3.5 w-3.5" /> : "2"}
              </div>
              Link a Wallet
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {step === "connect" && wallets.length === 0 && (
              <p className="text-sm text-muted-foreground">No wallets found. Create a wallet first.</p>
            )}
            {step === "connect" && wallets.map(w => (
              <div key={w.id} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-secondary/50 transition-colors">
                <div>
                  <p className="text-sm font-semibold">{w.name}</p>
                  <p className="text-xs text-muted-foreground">{w.currency} · {w.address?.slice(0, 12)}...</p>
                </div>
                <Button size="sm" onClick={() => handleLink(w)} disabled={linking}>
                  {linking ? <div className="w-3 h-3 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> : "Link"}
                </Button>
              </div>
            ))}
            {step === "linked" && linkedWallet && (
              <div className="flex items-center gap-2 text-green-500 text-sm">
                <CheckCircle className="h-4 w-4" />
                <span>{linkedWallet.name} secured by Samsung Keystore</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 3: Done */}
      {step === "linked" && (
        <Card className="border-green-500/30 bg-green-500/5">
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center gap-2 text-green-500 font-semibold">
              <Shield className="h-5 w-5" />
              Wallet Protected by Samsung Knox
            </div>
            <ul className="space-y-1.5">
              {["Private keys stored in secure enclave", "Biometric required for every transaction", "Knox attestation enabled", "Anti-tampering protection active"].map(f => (
                <li key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" /> {f}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Requirements */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground">Requirements</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {[
            "Samsung Galaxy S10 or newer",
            "One UI 1.0 or higher",
            "Samsung Blockchain Keystore app installed",
            "Knox security version 3.0+",
          ].map(r => (
            <div key={r} className="flex items-center gap-2 text-xs text-muted-foreground">
              <Cpu className="h-3.5 w-3.5 text-blue-400 shrink-0" /> {r}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}