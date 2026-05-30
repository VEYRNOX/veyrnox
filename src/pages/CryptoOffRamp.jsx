import { useState } from "react";
import { ArrowUpFromLine, CheckCircle, Building, CreditCard, Clock, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

const CRYPTO_PRICES = { BTC: 67420, ETH: 2418, SOL: 148, USDC: 1, USDT: 1 };
const FIAT_CURRENCIES = ["GBP", "USD", "EUR", "CAD", "AUD"];
const PAYOUT_METHODS = [
  { id: "bank", label: "Bank Transfer (SEPA/SWIFT)", icon: "🏦", fee: 0.015, time: "1-2 business days" },
  { id: "faster_payments", label: "Faster Payments (UK)", icon: "⚡", fee: 0.010, time: "Under 2 hours" },
  { id: "card", label: "Debit Card Instant", icon: "💳", fee: 0.029, time: "Instant" },
  { id: "paypal", label: "PayPal", icon: "🅿", fee: 0.025, time: "Same day" },
];

export default function CryptoOffRamp() {
  const qc = useQueryClient();
  const [crypto, setCrypto] = useState("ETH");
  const [cryptoAmount, setCryptoAmount] = useState("0.1");
  const [fiatCurrency, setFiatCurrency] = useState("GBP");
  const [payoutMethod, setPayoutMethod] = useState("faster_payments");
  const [step, setStep] = useState("input"); // input | kyc | processing | done
  const [processing, setProcessing] = useState(false);

  const { data: wallets = [] } = useQuery({ queryKey: ["wallets"], queryFn: () => base44.entities.Wallet.list() });
  const { data: bankAccounts = [] } = useQuery({ queryKey: ["bank-accounts"], queryFn: () => base44.entities.BankAccount.list() });

  const cryptoNum = parseFloat(cryptoAmount) || 0;
  const rate = CRYPTO_PRICES[crypto] || 1;
  const method = PAYOUT_METHODS.find(m => m.id === payoutMethod);
  const grossFiat = cryptoNum * rate;
  const fee = grossFiat * (method?.fee || 0.015);
  const netFiat = grossFiat - fee;

  const handleSell = async () => {
    setStep("processing");
    await new Promise(r => setTimeout(r, 3000));
    await base44.entities.Transaction.create({
      type: "send",
      currency: crypto,
      amount: cryptoNum,
      network: "Ethereum",
      status: "completed",
      note: `Sold ${cryptoNum} ${crypto} → ${fiatCurrency} ${netFiat.toFixed(2)} via ${method?.label}`,
      timestamp: new Date().toISOString(),
    });
    setStep("done");
    qc.invalidateQueries({ queryKey: ["transactions"] });
  };

  return (
    <div className="max-w-md mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
          <ArrowUpFromLine className="h-5 w-5 text-emerald-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Sell Crypto to Fiat</h1>
          <p className="text-sm text-muted-foreground">Convert crypto directly to your bank account</p>
        </div>
      </div>

      {step === "done" ? (
        <Card className="border-green-500/30 bg-green-500/5">
          <CardContent className="pt-6 space-y-4 text-center">
            <CheckCircle className="h-14 w-14 text-green-500 mx-auto" />
            <div>
              <p className="text-2xl font-bold">{fiatCurrency} {netFiat.toFixed(2)}</p>
              <p className="text-sm text-muted-foreground mt-1">Sold {cryptoNum} {crypto}</p>
              <div className="flex items-center justify-center gap-1 mt-2 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" /> Expected: {method?.time}
              </div>
            </div>
            <Button variant="outline" className="w-full" onClick={() => setStep("input")}>Sell More</Button>
          </CardContent>
        </Card>
      ) : step === "processing" ? (
        <Card>
          <CardContent className="pt-8 pb-8 flex flex-col items-center gap-4">
            <div className="w-14 h-14 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <div className="text-center">
              <p className="font-semibold">Processing Sale</p>
              <p className="text-sm text-muted-foreground mt-1">Broadcasting transaction · Awaiting settlement</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Crypto amount */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">You Sell</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input type="number" className="flex-1" value={cryptoAmount} onChange={e => setCryptoAmount(e.target.value)} placeholder="0.00" />
                <Select value={crypto} onValueChange={setCrypto}>
                  <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.keys(CRYPTO_PRICES).map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {["25%", "50%", "75%", "MAX"].map(pct => (
                  <button key={pct} className="py-1.5 rounded-lg text-xs font-semibold border border-border hover:bg-secondary transition-colors">{pct}</button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Receive */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">You Receive</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <div className="flex-1 px-3 py-2 rounded-md border border-input bg-secondary/30 text-sm font-bold">
                  {netFiat > 0 ? netFiat.toFixed(2) : "0.00"}
                </div>
                <Select value={fiatCurrency} onValueChange={setFiatCurrency}>
                  <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FIAT_CURRENCIES.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="p-3 bg-secondary/40 rounded-lg space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Gross ({crypto} @ ${rate.toLocaleString()})</span><span>{fiatCurrency} {grossFiat.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Fee ({((method?.fee || 0) * 100).toFixed(1)}%)</span><span className="text-amber-400">- {fiatCurrency} {fee.toFixed(2)}</span></div>
                <div className="flex justify-between font-bold border-t border-border pt-1.5"><span>You receive</span><span className="text-primary">{fiatCurrency} {netFiat.toFixed(2)}</span></div>
              </div>
            </CardContent>
          </Card>

          {/* Payout method */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Payout Method</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {PAYOUT_METHODS.map(m => (
                <button key={m.id} onClick={() => setPayoutMethod(m.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors text-left ${payoutMethod === m.id ? "border-primary/50 bg-primary/5" : "border-border hover:bg-secondary/50"}`}>
                  <span className="text-xl w-8 text-center">{m.icon}</span>
                  <div className="flex-1">
                    <p className="text-sm font-semibold">{m.label}</p>
                    <p className="text-xs text-muted-foreground">{m.time} · {(m.fee * 100).toFixed(1)}% fee</p>
                  </div>
                  {payoutMethod === m.id && <CheckCircle className="h-4 w-4 text-primary shrink-0" />}
                </button>
              ))}
            </CardContent>
          </Card>

          {bankAccounts.length === 0 && payoutMethod === "bank" && (
            <div className="flex items-center gap-2 text-xs text-amber-500 p-3 bg-amber-500/10 rounded-xl">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Add a bank account under Bank Accounts to receive fiat payouts
            </div>
          )}

          <Button className="w-full" onClick={handleSell} disabled={cryptoNum <= 0 || wallets.length === 0}>
            Sell {cryptoNum > 0 ? `${cryptoNum} ${crypto}` : "Crypto"} → {fiatCurrency}
          </Button>
        </>
      )}
    </div>
  );
}