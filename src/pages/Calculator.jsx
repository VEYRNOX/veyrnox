// @ts-nocheck
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ArrowLeftRight, RefreshCw, TrendingUp, AlertTriangle } from "lucide-react";
import { PORTFOLIO_SYMBOLS } from "@/lib/cryptoCompare.js";
import { fetchPortfolioPricesFiatCG } from "@/lib/coinGecko.js";
import { CURRENCY_SYMBOLS, CURRENCY_COLORS } from "@/lib/cryptos.js";
import { isLivePricesEnabled, setLivePricesEnabled } from "@/lib/priceFeed";
import { useWallet } from "@/lib/WalletProvider";
import { DEMO } from "@/api/demoClient";

const FIATS = ["USD", "EUR", "GBP", "JPY", "CAD", "AUD", "CHF", "CNY"];

const FIAT_FLAGS = { USD: "🇺🇸", EUR: "🇪🇺", GBP: "🇬🇧", JPY: "🇯🇵", CAD: "🇨🇦", AUD: "🇦🇺", CHF: "🇨🇭", CNY: "🇨🇳" };

const fetchPrices = () => fetchPortfolioPricesFiatCG(FIATS);

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

  // I3 guard: live prices default ON, so navigating here in a decoy/hidden
  // session would fetch CoinGecko. Also gate on the deniability flags so a
  // deniable session makes zero egress (I3). DEMO suppression: the live-prices
  // pref is device-global, NOT demo-scoped, so a browser that once opted in would
  // fetch CoinGecko the moment this page is navigated to inside a demo tour
  // (isDecoy/isHidden are both false in demo) — so also fold !DEMO in (ECC audit
  // M-6 pattern). The page then shows its existing "Live prices off" static state
  // — no network call, no error reveal.
  const { isDecoy, isHidden } = useWallet();
  const pricesEnabled = isLivePricesEnabled() && !isDecoy && !isHidden && !DEMO;

  const { data: prices, isLoading, isError, error, dataUpdatedAt, refetch, isFetching } = useQuery({
    queryKey: ["conversion-prices"],
    queryFn: fetchPrices,
    refetchInterval: 30_000,
    staleTime: 20_000,
    enabled: pricesEnabled,
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

  // Mirror the query gate so the UI basis matches what we actually fetch: in a
  // deniability session this is false, surfacing the neutral "Live prices off"
  // static state (no error tell).
  const livePricesOn = pricesEnabled;

  return (
    <div className="max-w-lg mx-auto space-y-6">
      {!livePricesOn && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-caution/30 bg-caution/5">
          <div className="flex-1 space-y-1">
            <p className="text-sm font-semibold text-caution">Live prices off</p>
            <p className="text-xs text-muted-foreground">
              The converter requires a live price feed (CoinGecko). Enable live prices in Settings to use it.
              When on, a fixed public symbol list is sent to CoinGecko — not your holdings.
            </p>
          </div>
          <button onClick={() => { setLivePricesEnabled(true); window.location.reload(); }}
            className="shrink-0 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-lg">
            Enable
          </button>
        </div>
      )}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Converter</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Real-time crypto ↔ fiat conversion</p>
        </div>
        {/* I3: refetch() bypasses the `enabled` gate in react-query v5, so in a
            decoy/hidden session (pricesEnabled === false) tapping this would hit
            CoinGecko — live egress. Hide the trigger when prices are gated off. */}
        {pricesEnabled && (
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "motion-safe:animate-spin" : ""}`} />
            {lastUpdated ? `Updated ${lastUpdated}` : "Refresh"}
          </button>
        )}
      </div>

      {livePricesOn && isError && !isFetching && (
        <div className="p-4 rounded-xl border border-destructive/30 bg-destructive/5 space-y-3">
          <div className="flex items-start gap-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>Couldn’t load prices: {error?.message || "the price feed didn’t respond"}.</span>
          </div>
          <button onClick={() => refetch()} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-border bg-card hover:border-primary">
            Retry
          </button>
        </div>
      )}

      {/* Conversion card */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-3">

        {/* Crypto side */}
        <div className="space-y-1.5">
          <label id="calc-crypto-label" className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Crypto</label>
          <div className="flex gap-2">
            <Select value={fromCrypto} onValueChange={setFromCrypto}>
              <SelectTrigger aria-labelledby="calc-crypto-label" className="w-32 shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PORTFOLIO_SYMBOLS.map(c => (
                  <SelectItem key={c} value={c}>
                    <div className="flex items-center gap-2">
                      <span style={{ color: CURRENCY_COLORS[c] }} className="font-bold text-sm">{CURRENCY_SYMBOLS[c]}</span>
                      {c}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {lastEdited === "crypto" ? (
              <Input
                type="number"
                min="0"
                value={cryptoAmount}
                onChange={e => handleCryptoChange(e.target.value)}
                placeholder="0.00"
                autoFocus
                className="flex-1 text-right font-mono text-base"
              />
            ) : (
              <button
                onClick={() => {
                  if (convertedCrypto !== "") setCryptoAmount(String(convertedCrypto));
                  setLastEdited("crypto");
                }}
                className="flex-1 text-right font-mono text-base px-3 py-2 rounded-md border border-border bg-secondary/40 text-foreground"
              >
                {convertedCrypto !== "" ? formatNumber(convertedCrypto, null) : <span className="text-muted-foreground">0.00</span>}
              </button>
            )}
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
              aria-label="Swap conversion direction"
              className="h-8 w-8 rounded-full border border-border bg-secondary flex items-center justify-center hover:bg-accent transition-colors"
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex-1 h-px bg-border" />
        </div>

        {/* Fiat side */}
        <div className="space-y-1.5">
          <label id="calc-fiat-label" className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Fiat</label>
          <div className="flex gap-2">
            <Select value={toFiat} onValueChange={setToFiat}>
              <SelectTrigger aria-labelledby="calc-fiat-label" className="w-32 shrink-0">
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
            {lastEdited === "fiat" ? (
              <Input
                type="number"
                min="0"
                value={fiatAmount}
                onChange={e => handleFiatChange(e.target.value)}
                placeholder="0.00"
                autoFocus
                className="flex-1 text-right font-mono text-base"
              />
            ) : (
              <button
                onClick={() => {
                  if (convertedFiat !== "") setFiatAmount(String(convertedFiat));
                  setLastEdited("fiat");
                }}
                className="flex-1 text-right font-mono text-base px-3 py-2 rounded-md border border-border bg-secondary/40 text-foreground"
              >
                {convertedFiat !== "" ? formatNumber(convertedFiat, toFiat) : <span className="text-muted-foreground">0.00</span>}
              </button>
            )}
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
            <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full motion-safe:animate-spin" />
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
          {PORTFOLIO_SYMBOLS.map(c => {
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
                    style={{ background: `${CURRENCY_COLORS[c]}22` }}>
                    <span className="text-xs font-bold" style={{ color: CURRENCY_COLORS[c] }}>{CURRENCY_SYMBOLS[c]}</span>
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