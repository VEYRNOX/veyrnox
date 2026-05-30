import { useState } from "react";
import { Search, CheckCircle, XCircle, Clock, DollarSign, AtSign, ChevronRight, AlertTriangle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

const DURATION_OPTIONS = [1, 2, 3, 5, 10];
const BASE_PRICE_PER_YEAR = { 3: 640, 4: 160, default: 5 }; // USD

function getPricePerYear(name) {
  const len = name.length;
  if (len === 3) return BASE_PRICE_PER_YEAR[3];
  if (len === 4) return BASE_PRICE_PER_YEAR[4];
  return BASE_PRICE_PER_YEAR.default;
}

export default function ENSRegistration() {
  const qc = useQueryClient();
  const [searchName, setSearchName] = useState("");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState(null); // { name, available, expiresAt }
  const [duration, setDuration] = useState(1);
  const [registering, setRegistering] = useState(false);
  const [registered, setRegistered] = useState(null);

  const { data: wallets = [] } = useQuery({
    queryKey: ["wallets"],
    queryFn: () => base44.entities.Wallet.list(),
  });

  const handleCheck = async () => {
    if (!searchName.trim()) return;
    setChecking(true);
    setResult(null);
    await new Promise(r => setTimeout(r, 1200));
    const taken = ["vitalik", "ethereum", "wallet", "defi", "crypto", "nft", "dao"].includes(searchName.toLowerCase());
    setResult({
      name: searchName.toLowerCase().replace(/[^a-z0-9-]/g, ""),
      available: !taken,
      expiresAt: taken ? "2027-03-15" : null,
      owner: taken ? "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" : null,
    });
    setChecking(false);
  };

  const handleRegister = async () => {
    setRegistering(true);
    await new Promise(r => setTimeout(r, 2000));
    // Log as a transaction
    await base44.entities.Transaction.create({
      type: "send",
      currency: "ETH",
      amount: (getPricePerYear(result.name) * duration / 2000).toFixed(6),
      network: "Ethereum",
      status: "completed",
      note: `ENS registration: ${result.name}.eth (${duration} year${duration > 1 ? "s" : ""})`,
      timestamp: new Date().toISOString(),
    });
    setRegistered({ name: result.name, duration, expiresAt: new Date(Date.now() + duration * 365 * 24 * 60 * 60 * 1000).toLocaleDateString() });
    setRegistering(false);
    qc.invalidateQueries({ queryKey: ["transactions"] });
  };

  const price = result?.available ? getPricePerYear(result.name) * duration : 0;
  const ethPrice = (price / 2000).toFixed(4);

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-indigo-500/10 flex items-center justify-center">
          <AtSign className="h-5 w-5 text-indigo-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold">ENS Name Registration</h1>
          <p className="text-sm text-muted-foreground">Register your Ethereum Name Service domain</p>
        </div>
      </div>

      {registered ? (
        <Card className="border-green-500/30 bg-green-500/5">
          <CardContent className="pt-6 space-y-4 text-center">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
            <div>
              <p className="text-2xl font-bold">{registered.name}.eth</p>
              <p className="text-sm text-muted-foreground mt-1">Successfully registered for {registered.duration} year{registered.duration > 1 ? "s" : ""}</p>
              <p className="text-xs text-muted-foreground mt-1">Expires: {registered.expiresAt}</p>
            </div>
            <Button variant="outline" onClick={() => { setRegistered(null); setResult(null); setSearchName(""); }}>
              Register Another Name
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Search */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    placeholder="yourname"
                    value={searchName}
                    onChange={e => setSearchName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                    onKeyDown={e => e.key === "Enter" && handleCheck()}
                    className="pr-16"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">.eth</span>
                </div>
                <Button onClick={handleCheck} disabled={checking || !searchName.trim()}>
                  {checking ? <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>

              {result && (
                <div className={`mt-3 p-3 rounded-lg flex items-center gap-3 ${result.available ? "bg-green-500/10 border border-green-500/30" : "bg-destructive/10 border border-destructive/30"}`}>
                  {result.available
                    ? <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
                    : <XCircle className="h-5 w-5 text-destructive shrink-0" />}
                  <div className="flex-1">
                    <p className="font-semibold text-sm">{result.name}.eth</p>
                    {result.available
                      ? <p className="text-xs text-green-400">Available to register</p>
                      : <p className="text-xs text-muted-foreground">Owned by {result.owner?.slice(0, 10)}... · Expires {result.expiresAt}</p>}
                  </div>
                  {result.available && (
                    <Badge variant="outline" className="text-green-500 border-green-500/40">Available</Badge>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Registration options */}
          {result?.available && (
            <>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Registration Duration</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-5 gap-2">
                    {DURATION_OPTIONS.map(y => (
                      <button
                        key={y}
                        onClick={() => setDuration(y)}
                        className={`py-2 rounded-lg text-sm font-semibold border transition-colors ${duration === y ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-secondary"}`}
                      >
                        {y}yr
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-border">
                    <span className="text-sm text-muted-foreground">Total Cost</span>
                    <div className="text-right">
                      <p className="font-bold">${price.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">≈ {ethPrice} ETH</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Expires</span>
                    <span className="text-sm">{new Date(Date.now() + duration * 365 * 24 * 60 * 60 * 1000).toLocaleDateString()}</span>
                  </div>
                  {result.name.length < 5 && (
                    <div className="flex items-center gap-2 text-amber-500 text-xs p-2 bg-amber-500/10 rounded-lg">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      Short names (3–4 chars) are premium priced
                    </div>
                  )}
                </CardContent>
              </Card>

              <Button className="w-full" onClick={handleRegister} disabled={registering || wallets.length === 0}>
                {registering ? (
                  <><div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin mr-2" />Registering on Ethereum...</>
                ) : `Register ${result.name}.eth for ${ethPrice} ETH`}
              </Button>
              {wallets.length === 0 && (
                <p className="text-xs text-muted-foreground text-center">Connect a wallet to register</p>
              )}
            </>
          )}

          {/* Popular names inspiration */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Why register an ENS name?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                "Replace 0x addresses with yourname.eth",
                "Works across all dApps and wallets",
                "Store your website, avatar, and social links on-chain",
                "Tradeable as an NFT on secondary markets",
              ].map(b => (
                <div key={b} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <CheckCircle className="h-3.5 w-3.5 text-indigo-400 mt-0.5 shrink-0" /> {b}
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}