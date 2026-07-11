// src/pages/CryptoDetailPage.jsx
import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import BackButton from "@/components/BackButton";
import CoinLogo from "@/components/CoinLogo";
import CandlestickChart from "@/components/CandlestickChart";
import { useWallet } from "@/lib/WalletProvider";
import { useBasketPrices } from "@/hooks/useBasketPrices";
import { TOP_CRYPTOS } from "@/lib/cryptos";

const PERIODS = ["1H", "4H", "1D", "1W", "1M"];

export default function CryptoDetailPage() {
  const { symbol } = useParams();
  const navigate = useNavigate();
  const [period, setPeriod] = useState("1D");
  const { isUnlocked } = useWallet();
  const { changeFor } = useBasketPrices();

  const asset = TOP_CRYPTOS.find((c) => c.symbol === symbol);

  if (!asset) {
    return (
      <div className="max-w-lg mx-auto space-y-4 pt-4">
        <BackButton />
        <p className="text-sm text-muted-foreground text-center pt-8">Asset not found: {symbol}</p>
      </div>
    );
  }

  const change = changeFor(symbol);
  const isUp = change == null ? null : change >= 0;

  return (
    <div className="max-w-lg mx-auto space-y-5 pt-1">
      {/* Back */}
      <BackButton />

      {/* Header */}
      <div className="flex items-center gap-3">
        <CoinLogo symbol={symbol} size={48} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">{asset.name}</h1>
            <span className="text-sm text-muted-foreground font-mono">{symbol}</span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-lg font-semibold mono-value">
              ${asset.usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </span>
            {isUp != null && (
              <span className={`text-xs font-mono ${isUp ? "text-[#4ADAC2]" : "text-destructive"}`}>
                {isUp ? "▲" : "▼"} {Math.abs(change).toFixed(2)}%
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Balance strip — shown when unlocked; balance amount omitted */}
      {isUnlocked && (
        <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-border bg-card">
          <div>
            <p className="text-xs text-muted-foreground">Your balance</p>
            <p className="text-sm mono-value text-muted-foreground mt-0.5">
              —
            </p>
          </div>
        </div>
      )}

      {/* Period tabs */}
      <div className="flex gap-1">
        {PERIODS.map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              period === p
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Chart */}
      <CandlestickChart symbol={symbol} period={period} />

      {/* Actions */}
      <div className="grid grid-cols-2 gap-3 pt-1">
        <Button
          className="h-14 gap-2 text-base"
          onClick={() => navigate(`/send?asset=${symbol}`)}
        >
          <ArrowUpRight className="h-5 w-5" />
          Send
        </Button>
        <Button
          variant="secondary"
          className="h-14 gap-2 text-base"
          onClick={() => navigate(`/receive?asset=${symbol}`)}
        >
          <ArrowDownLeft className="h-5 w-5" />
          Receive
        </Button>
      </div>
    </div>
  );
}
