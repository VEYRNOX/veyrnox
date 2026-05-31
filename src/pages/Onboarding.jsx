import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { Shield, Wallet, CheckCircle2, ArrowRight, ChevronRight } from "lucide-react";
import VeyrnoxLogo from "@/components/VeyrnoxLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STEPS = [
  { id: 1, title: "Welcome", subtitle: "Let's set up your wallet in 3 steps" },
  { id: 2, title: "Create Your First Wallet", subtitle: "Add a wallet to get started" },
  { id: 3, title: "Security Setup", subtitle: "Protect your assets" },
  { id: 4, title: "You're All Set!", subtitle: "Your wallet is ready" },
];

function generateAddress(currency) {
  const chars = "0123456789abcdef";
  let addr = currency === "BTC" ? "bc1q" : "0x";
  for (let i = 0; i < 32; i++) addr += chars[Math.floor(Math.random() * chars.length)];
  return addr;
}

export default function Onboarding() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [walletName, setWalletName] = useState("My First Wallet");
  const [currency, setCurrency] = useState("ETH");

  const createWallet = useMutation({
    mutationFn: (data) => base44.entities.Wallet.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      setStep(3);
    },
  });

  function finish() {
    localStorage.setItem("onboarding_complete", "true");
    navigate("/");
  }

  const progress = ((step - 1) / (STEPS.length - 1)) * 100;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        {/* Progress */}
        <div className="mb-8">
          <div className="flex justify-between mb-2">
            {STEPS.map(s => (
              <div key={s.id} className={`flex items-center justify-center h-7 w-7 rounded-full text-xs font-bold transition-all ${
                s.id < step ? "bg-primary text-primary-foreground" :
                s.id === step ? "bg-primary text-primary-foreground ring-4 ring-primary/20" :
                "bg-secondary text-muted-foreground"
              }`}>
                {s.id < step ? <CheckCircle2 className="h-4 w-4" /> : s.id}
              </div>
            ))}
          </div>
          <div className="h-1 bg-secondary rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>

        {/* Step Content */}
        <div className="bg-card border border-border rounded-3xl p-8 text-center">
          {step === 1 && (
            <>
              <VeyrnoxLogo size={64} className="mx-auto mb-4 shadow-sm" />
              <h1 className="text-2xl font-bold mb-2">Welcome to Veyrnox</h1>
              <p className="text-muted-foreground text-sm mb-6">Your institutional-grade crypto wallet. Let's get you set up in just a few steps.</p>
              <div className="space-y-2 text-left mb-8">
                {["Multi-chain wallet management", "DeFi, staking & yield farming", "Bank-grade security & RASP protection", "AI-powered portfolio insights"].map(f => (
                  <div key={f} className="flex items-center gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                    <span className="text-sm">{f}</span>
                  </div>
                ))}
              </div>
              <Button className="w-full" onClick={() => setStep(2)}>
                Get Started <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </>
          )}

          {step === 2 && (
            <>
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Wallet className="h-8 w-8 text-primary" />
              </div>
              <h1 className="text-2xl font-bold mb-2">Create Your First Wallet</h1>
              <p className="text-muted-foreground text-sm mb-6">Give your wallet a name and choose your primary asset.</p>
              <div className="space-y-3 text-left mb-6">
                <div>
                  <Label>Wallet Name</Label>
                  <Input value={walletName} onChange={e => setWalletName(e.target.value)} placeholder="My ETH Wallet" className="mt-1.5" />
                </div>
                <div>
                  <Label>Primary Currency</Label>
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[
                        { v: "BTC", label: "Bitcoin (BTC)" },
                        { v: "ETH", label: "Ethereum (ETH)" },
                        { v: "SOL", label: "Solana (SOL)" },
                        { v: "USDC", label: "USD Coin (USDC)" },
                        { v: "USDT", label: "Tether (USDT)" },
                      ].map(c => <SelectItem key={c.v} value={c.v}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button className="w-full" disabled={!walletName || createWallet.isPending}
                onClick={() => createWallet.mutate({ name: walletName, currency, address: generateAddress(currency), balance: 0 })}>
                {createWallet.isPending ? "Creating..." : "Create Wallet"}
              </Button>
            </>
          )}

          {step === 3 && (
            <>
              <div className="h-16 w-16 rounded-2xl bg-green-500/10 flex items-center justify-center mx-auto mb-4">
                <Shield className="h-8 w-8 text-green-500" />
              </div>
              <h1 className="text-2xl font-bold mb-2">Secure Your Wallet</h1>
              <p className="text-muted-foreground text-sm mb-6">We recommend completing these security steps.</p>
              <div className="space-y-2 text-left mb-6">
                {[
                  { label: "Set transaction limits", path: "/security", done: false },
                  { label: "Enable price alerts", path: "/alerts", done: false },
                ].map(item => (
                  <button key={item.label} onClick={() => { localStorage.setItem("onboarding_complete", "true"); navigate(item.path); }}
                    className="w-full flex items-center gap-3 p-3 rounded-xl border border-border hover:border-primary/50 hover:bg-primary/5 transition-colors text-left">
                    <div className="h-6 w-6 rounded-full border-2 border-border flex items-center justify-center shrink-0">
                      {item.done && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                    </div>
                    <span className="text-sm">{item.label}</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto" />
                  </button>
                ))}
              </div>
              <Button className="w-full" onClick={() => setStep(4)}>
                Continue <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </>
          )}

          {step === 4 && (
            <>
              <div className="h-16 w-16 rounded-full bg-green-500 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="h-8 w-8 text-white" />
              </div>
              <h1 className="text-2xl font-bold mb-2">You're All Set!</h1>
              <p className="text-muted-foreground text-sm mb-6">Your wallet is ready. Start exploring all the features available to you.</p>
              <Button className="w-full" onClick={finish}>
                Go to Dashboard <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </>
          )}
        </div>

        {step < 4 && (
          <button onClick={finish} className="mt-4 w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-2">
            Skip setup for now
          </button>
        )}
      </div>
    </div>
  );
}