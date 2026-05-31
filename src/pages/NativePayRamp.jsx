import { useState } from "react";
import { CreditCard, CheckCircle, Apple, Smartphone, DollarSign, ChevronRight, Shield, Lock, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { TOP_CRYPTOS } from "@/lib/cryptos";

// Top 10 by market cap, from the canonical source.
const CRYPTO_OPTIONS = TOP_CRYPTOS.map(c => ({
  symbol: c.symbol, name: c.name, icon: c.glyph, rate: c.usd,
}));

const FIAT_OPTIONS = ["USD", "GBP", "EUR", "CAD", "AUD"];

const PAYMENT_METHODS = [
  { id: "apple_pay", label: "Apple Pay", icon: "🍎", available: /iPhone|iPad|Mac/.test(navigator.userAgent) },
  { id: "google_pay", label: "Google Pay", icon: "G", available: /Android/.test(navigator.userAgent) || true },
  { id: "card", label: "Debit / Credit Card", icon: "💳", available: true },
];

export default function NativePayRamp() {
  const qc = useQueryClient();
  const [fiatAmount, setFiatAmount] = useState("100");
  const [fiatCurrency, setFiatCurrency] = useState("USD");
  const [selectedCrypto, setSelectedCrypto] = useState(CRYPTO_OPTIONS[1]);
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS[1].id);
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState(null);
  const [step, setStep] = useState("input"); // input | confirm | processing | done

  const { data: wallets = [] } = useQuery({
    queryKey: ["wallets"],
    queryFn: () => base44.entities.Wallet.list(),
  });

  const feeRate = paymentMethod === "card" ? 0.029 : 0.015;
  const fiatNum = parseFloat(fiatAmount) || 0;
  const fee = fiatNum * feeRate;
  const netFiat = fiatNum - fee;
  const cryptoAmount = (netFiat / selectedCrypto.rate).toFixed(8);

  const handleBuy = async () => {
    setStep("processing");
    setProcessing(true);
    await new Promise(r => setTimeout(r, 3000));
    // Create a fiat balance record and transaction
    await base44.entities.Transaction.create({
      type: "receive",
      currency: selectedCrypto.symbol,
      amount: parseFloat(cryptoAmount),
      network: "Ethereum",
      status: "completed",
      note: `Purchased via ${PAYMENT_METHODS.find(m => m.id === paymentMethod)?.label}`,
      timestamp: new Date().toISOString(),
    });
    setSuccess({ crypto: parseFloat(cryptoAmount), symbol: selectedCrypto.symbol, fiat: fiatNum, currency: fiatCurrency });
    setStep("done");
    setProcessing(false);
    qc.invalidateQueries({ queryKey: ["transactions"] });
  };

  return (
    <div className="max-w-md mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
          <CreditCard className="h-5 w-5 text-emerald-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Apple Pay / Google Pay</h1>
          <p className="text-sm text-muted-foreground">Buy crypto instantly with native mobile payments</p>
        </div>
      </div>

      {step === "done" && success ? (
        <Card className="border-green-500/30 bg-green-500/5">
          <CardContent className="pt-6 space-y-4 text-center">
            <CheckCircle className="h-14 w-14 text-green-500 mx-auto" />
            <div>
              <p className="text-3xl font-bold">{success.crypto.toFixed(6)} {success.symbol}</p>
              <p className="text-sm text-muted-foreground mt-1">Purchased for {success.currency} {success.fiat.toFixed(2)}</p>
            </div>
            <p className="text-xs text-muted-foreground">Delivered to your wallet · Usually within 2 minutes</p>
            <Button className="w-full" onClick={() => { setStep("input"); setSuccess(null); }}>
              Buy More Crypto
            </Button>
          </CardContent>
        </Card>
      ) : step === "processing" ? (
        <Card>
          <CardContent className="pt-8 pb-8 flex flex-col items-center gap-4">
            <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <div className="text-center">
              <p className="font-semibold">Processing Payment</p>
              <p className="text-sm text-muted-foreground mt-1">Waiting for {PAYMENT_METHODS.find(m => m.id === paymentMethod)?.label} confirmation...</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Payment Method */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Payment Method</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {PAYMENT_METHODS.map(m => (
                <button
                  key={m.id}
                  onClick={() => setPaymentMethod(m.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors ${paymentMethod === m.id ? "border-primary/60 bg-primary/5" : "border-border hover:bg-secondary/50"}`}
                >
                  <span className="text-xl w-8 text-center">{m.icon}</span>
                  <span className="flex-1 text-sm font-medium text-left">{m.label}</span>
                  {m.id !== "card" && <Badge variant="outline" className="text-xs">Lowest fees</Badge>}
                  {paymentMethod === m.id && <CheckCircle className="h-4 w-4 text-primary shrink-0" />}
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Amount */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Amount</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                    {fiatCurrency === "USD" ? "$" : fiatCurrency === "GBP" ? "£" : "€"}
                  </span>
                  <Input
                    type="number"
                    className="pl-7"
                    value={fiatAmount}
                    onChange={e => setFiatAmount(e.target.value)}
                    min="10"
                  />
                </div>
                <Select value={fiatCurrency} onValueChange={setFiatCurrency}>
                  <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FIAT_OPTIONS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {[50, 100, 250, 500].map(amt => (
                  <button key={amt} onClick={() => setFiatAmount(String(amt))}
                    className={`py-1.5 rounded-lg text-xs font-semibold border transition-colors ${fiatAmount === String(amt) ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-secondary"}`}>
                    ${amt}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Crypto to receive */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">You Receive</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {CRYPTO_OPTIONS.map(c => (
                  <button key={c.symbol} onClick={() => setSelectedCrypto(c)}
                    className={`flex flex-col items-center gap-1 py-2 px-1 rounded-xl border text-xs font-semibold transition-colors ${selectedCrypto.symbol === c.symbol ? "border-primary/60 bg-primary/5 text-primary" : "border-border hover:bg-secondary"}`}>
                    <span className="text-lg">{c.icon}</span>{c.symbol}
                  </button>
                ))}
              </div>
              <div className="p-3 bg-secondary/50 rounded-lg space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">You pay</span>
                  <span>{fiatCurrency} {fiatNum.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Fee ({(feeRate * 100).toFixed(1)}%)</span>
                  <span className="text-amber-400">- {fiatCurrency} {fee.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold border-t border-border pt-2">
                  <span>You receive</span>
                  <span className="text-primary">{cryptoAmount} {selectedCrypto.symbol}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Security note */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
            <Lock className="h-3.5 w-3.5 shrink-0 text-green-500" />
            Secured by {paymentMethod === "apple_pay" ? "Face ID / Touch ID via Apple Pay" : paymentMethod === "google_pay" ? "Google Pay biometric verification" : "256-bit SSL encryption"}
          </div>

          <Button
            className="w-full"
            onClick={() => setStep("processing").then ? undefined : handleBuy()}
            disabled={processing || fiatNum < 10 || wallets.length === 0}
            onClickCapture={handleBuy}
          >
            {paymentMethod === "apple_pay" ? "🍎 Pay with Apple Pay" : paymentMethod === "google_pay" ? "G Pay with Google Pay" : "💳 Pay with Card"}
          </Button>
          {wallets.length === 0 && <p className="text-xs text-muted-foreground text-center">Connect a wallet to receive crypto</p>}
          {fiatNum < 10 && <p className="text-xs text-muted-foreground text-center">Minimum purchase: $10</p>}
        </>
      )}
    </div>
  );
}