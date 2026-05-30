import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ArrowLeftRight, RefreshCw, TrendingUp } from "lucide-react";

const CRYPTOS = ["BTC", "ETH", "SOL", "USDC", "USDT"];
const FIATS = ["USD", "EUR", "GBP", "JPY", "CAD", "AUD", "CHF", "CNY"];

const CRYPTO_ICONS = { BTC: "₿", ETH: "Ξ", SOL: "◎", USDC: "Ⓢ", USDT: "₮" };
const FIAT_FLAGS = { USD: "🇺🇸", EUR: "🇪🇺", GBP: "🇬🇧", JPY: "🇯🇵", CAD: "🇨🇦", AUD: "🇦🇺", CHF: "🇨🇭", CNY: "🇨🇳" };
const CRYPTO_COLORS = { BTC: "#F7931A", ETH: "#627EEA", SOL: "#9945FF", USDC: "#2775CA", USDT: "#26A17B" };

async function fetchPrices() {
  const fsyms = CRYPTOS.join(",");
  const tsyms = FIATS.join(",");
  const res = await fetch(
    `https://min-api.cryptocompare.com/data/pricemulti?fsyms=${fsyms}&tsyms=${tsyms}&extraParams=safecryptowallet`
  );
  return res.json();
}

function formatNumber(value, fiat) {
  if (value == null || isNaN(value)) return "—";
  const isSmall = value < 0.01;
  const isJPY = fiat === "JPY" || fiat === "CNY";
  if (isSmall) return value.toFixed(8);
  return value.toLocaleString(undefined, {
    minimumFractionDigits: isJPY ? 0 : 2,
    maximumFractionDigits: isJPY ? 0 : 6,
  });
}

export default function Calculator() {
  const [fromCrypto, setFromCrypto] = useState("BTC");
  const [toFiat, setToFiat] = useState("USD");
  const [cryptoAmount, setCryptoAmount] = useState("1");
  const [fiatAmount, setFiatAmount] = useState("");
  const [lastEdited, setLastEdited] = useState("crypto"); // "crypto" | "fiat"

  const { data: prices, isLoading, dataUpdatedAt, refetch, isFetching } = useQuery({
    queryKey: ["conversion-prices"],
    queryFn: fetchPrices,
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  const rate = prices?.[fromCrypto]?.[toFiat] ?? null;

  const convertedFiat = useMemo(() => {
    if (rate == null || !cryptoAmount) return "";
    const val = parseFloat(cryptoAmount) * rate;
    return isNaN(val) ? "" : val;
  }, [cryptoAmount, rate]);

  const convertedCrypto = useMemo(() => {
    if (rate == null || !fiatAmount) return "";
    const val = parseFloat(fiatAmount) / rate;
    return isNaN(val) ? "" : val;
  }, [fiatAmount, rate]);

  const handleCryptoChange = (val) => {
    setCryptoAmount(val);
    setLastEdited("crypto");
  };

  const handleFiatChange = (val) => {
    setFiatAmount(val);
    setLastEdited("fiat");
  };

  const handleFlip = () => {
    // Flip by swapping displayed values
    if (lastEdited === "crypto" && convertedFiat !== "") {
      setCryptoAmount(String(convertedFiat));
    } else if (lastEdited === "fiat" && convertedCrypto !== "") {
      setFiatAmount(String(convertedCrypto));
    }
  };

  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Converter</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Real-time crypto ↔ fiat conversion</p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          {lastUpdated ? `Updated ${lastUpdated}` : "Refresh"}
        </button>
      </div>

      {/* Conversion card */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-3">

        {/* Crypto side */}
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Crypto</label>
          <div className="flex gap-2">
            <Select value={fromCrypto} onValueChange={setFromCrypto}>
              <SelectTrigger className="w-32 shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CRYPTOS.map(c => (
                  <SelectItem key={c} value={c}>
                    <div className="flex items-center gap-2">
                      <span style={{ color: CRYPTO_COLORS[c] }} className="font-bold text-sm">{CRYPTO_ICONS[c]}</span>
                      {c}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              min="0"
              value={lastEdited === "crypto" ? cryptoAmount : (convertedCrypto !== "" ? formatNumber(convertedCrypto, null) : "")}
              onChange={e => handleCryptoChange(e.target.value)}
              onFocus={() => setLastEdited("crypto")}
              placeholder="0.00"
              className="flex-1 text-right font-mono text-base"
            />
          </div>
        </div>

        {/* Flip + rate */}
        <div className="flex items-center gap-3 py-1">
          <div className="flex-1 h-px bg-border" />
          <div className="flex items-center gap-2">
            {rate != null && !isLoading && (
              <span className="text-xs text-muted-foreground font-mono">
                1 {fromCrypto} = {formatNumber(rate, toFiat)} {toFiat}
              </span>
            )}
            <button
              onClick={handleFlip}
              className="h-8 w-8 rounded-full border border-border bg-secondary flex items-center justify-center hover:bg-accent transition-colors"
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex-1 h-px bg-border" />
        </div>

        {/* Fiat side */}
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Fiat</label>
          <div className="flex gap-2">
            <Select value={toFiat} onValueChange={setToFiat}>
              <SelectTrigger className="w-32 shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FIATS.map(f => (
                  <SelectItem key={f} value={f}>
                    <div className="flex items-center gap-2">
                      <span>{FIAT_FLAGS[f]}</span> {f}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              min="0"
              value={lastEdited === "fiat" ? fiatAmount : (convertedFiat !== "" ? formatNumber(convertedFiat, toFiat) : "")}
              onChange={e => handleFiatChange(e.target.value)}
              onFocus={() => setLastEdited("fiat")}
              placeholder="0.00"
              className="flex-1 text-right font-mono text-base"
            />
          </div>
        </div>
      </div>

      {/* Full rates grid */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">All {fromCrypto} Rates</p>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-6">
            <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {FIATS.map(f => {
              const r = prices?.[fromCrypto]?.[f];
              return (
                <button
                  key={f}
                  onClick={() => setToFiat(f)}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg border transition-colors text-left ${
                    toFiat === f
                      ? "border-primary/50 bg-primary/10"
                      : "border-border bg-secondary/30 hover:bg-secondary"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">{FIAT_FLAGS[f]}</span>
                    <span className="text-xs font-semibold">{f}</span>
                  </div>
                  <span className="text-xs font-mono text-muted-foreground">
                    {r != null ? formatNumber(r, f) : "—"}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Cross-crypto rates */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <p className="text-sm font-semibold">Cross-Crypto in {toFiat}</p>
        <div className="divide-y divide-border">
          {CRYPTOS.map(c => {
            const r = prices?.[c]?.[toFiat];
            const isSelected = c === fromCrypto;
            return (
              <button
                key={c}
                onClick={() => setFromCrypto(c)}
                className={`w-full flex items-center justify-between py-2.5 first:pt-0 last:pb-0 transition-colors ${
                  isSelected ? "text-primary" : "hover:text-foreground text-muted-foreground"
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: `${CRYPTO_COLORS[c]}22` }}>
                    <span className="text-xs font-bold" style={{ color: CRYPTO_COLORS[c] }}>{CRYPTO_ICONS[c]}</span>
                  </div>
                  <span className="text-sm font-semibold text-foreground">{c}</span>
                  {isSelected && <span className="text-[10px] text-primary font-medium uppercase tracking-wide">selected</span>}
                </div>
                <span className="text-sm font-mono">
                  {r != null ? `${formatNumber(r, toFiat)} ${toFiat}` : "—"}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}