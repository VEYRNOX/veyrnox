import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { DEMO } from "@/api/demoClient";
import { annotateTokens } from "@/wallet-core/evm/spam";
import { getNetworkInfo, ALLOW_MAINNET } from "@/wallet-core/evm/networks";
import { ShieldAlert, Eye, EyeOff, Filter, AlertTriangle, BadgeCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

// User per-token overrides ('show' un-hides a flagged token, 'hide' hides a clean
// one). Persisted locally — display preference only, never on-chain state.
const OVERRIDES_KEY = "veyrnox-spam-overrides";

function loadOverrides() {
  try {
    return JSON.parse(localStorage.getItem(OVERRIDES_KEY) || "{}");
  } catch {
    return {};
  }
}

function TokenRow({ t, onToggle }) {
  const net = getNetworkInfo(t.network);
  return (
    <div className={`p-3 rounded-xl border bg-card ${t.hidden ? "opacity-70 border-dashed border-border" : "border-border"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className={`h-9 w-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${t.spam ? "bg-destructive/10 text-destructive" : "bg-secondary text-foreground"}`}>
            {t.spam ? <ShieldAlert className="h-4 w-4" /> : (t.symbol || "?").slice(0, 2)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-semibold truncate">{t.symbol}</span>
              {t.verified && <BadgeCheck className="h-3.5 w-3.5 text-success shrink-0" />}
              <span className="text-xs text-muted-foreground font-normal truncate">{t.name}</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {t.balance?.toLocaleString(undefined, { maximumFractionDigits: 6 })} {t.symbol}
              {" · "}${(Number(t.value_usd) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
              {net ? ` · ${net.name}` : ""}
            </p>
            {t.spam && t.reasons.length > 0 && (
              <ul className="mt-1.5 space-y-0.5">
                {t.reasons.map((r, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[11px] text-destructive">
                    <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="gap-1.5 text-xs h-8 shrink-0"
          onClick={() => onToggle(t)}
        >
          {t.hidden ? <><Eye className="h-3.5 w-3.5" /> Unhide</> : <><EyeOff className="h-3.5 w-3.5" /> Hide</>}
        </Button>
      </div>
    </div>
  );
}

export default function SpamTokenFilter() {
  const [overrides, setOverrides] = useState(loadOverrides);
  const [showHidden, setShowHidden] = useState(false);

  const { data: tokens = [], isLoading } = useQuery({
    queryKey: ["wallet-tokens"],
    queryFn: () => base44.entities.WalletToken.list(),
  });

  const annotated = useMemo(() => annotateTokens(tokens, overrides), [tokens, overrides]);
  const visible = annotated.filter((t) => !t.hidden);
  const hidden = annotated.filter((t) => t.hidden);

  // Toggle a token's hidden state by writing an explicit override that flips its
  // CURRENT displayed state, then persist. The override always wins over the
  // heuristic, so the user can never be overruled by the filter.
  const toggle = (t) => {
    const next = { ...overrides, [t.id]: t.hidden ? "show" : "hide" };
    setOverrides(next);
    try {
      localStorage.setItem(OVERRIDES_KEY, JSON.stringify(next));
    } catch {
      /* localStorage unavailable — in-memory only for this session */
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Filter className="h-5 w-5 text-primary" /> Spam Token Filter
          </h1>
          <p className="text-sm text-muted-foreground">
            Likely scam and airdropped tokens are hidden from your holdings. Hiding is
            display-only — it never touches balances or keys, and you can unhide anything.
          </p>
        </div>
        <span className="shrink-0 text-[10px] px-2 py-1 rounded-full bg-secondary text-muted-foreground font-semibold uppercase tracking-wide">
          {DEMO ? "Demo · seeded" : ALLOW_MAINNET ? "Mainnet" : "Testnet"}
        </span>
      </div>

      {hidden.length > 0 && (
        <div className="p-4 rounded-xl border border-caution/30 bg-caution/5 flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 text-caution shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold">
              {hidden.length} token{hidden.length > 1 ? "s" : ""} hidden as likely spam
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Flagged by name/symbol lures, unsolicited airdrops, or zero market value.
              These are heuristics, not a guarantee — review and unhide anything legitimate.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs h-8 shrink-0"
            onClick={() => setShowHidden((v) => !v)}
          >
            {showHidden ? <><EyeOff className="h-3.5 w-3.5" /> Hide spam</> : <><Eye className="h-3.5 w-3.5" /> Show hidden ({hidden.length})</>}
          </Button>
        </div>
      )}

      <div>
        <p className="text-sm font-semibold mb-2">Your Tokens</p>
        {isLoading && <p className="text-sm text-muted-foreground">Loading tokens…</p>}
        {!isLoading && visible.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground rounded-xl border border-dashed border-border">
            No tokens to show.
          </div>
        )}
        <div className="space-y-2">
          {visible.map((t) => (
            <TokenRow key={t.id} t={t} onToggle={toggle} />
          ))}
        </div>
      </div>

      {showHidden && hidden.length > 0 && (
        <div>
          <p className="text-sm font-semibold mb-2 flex items-center gap-1.5">
            <EyeOff className="h-4 w-4 text-muted-foreground" /> Hidden Tokens
          </p>
          <div className="space-y-2">
            {hidden.map((t) => (
              <TokenRow key={t.id} t={t} onToggle={toggle} />
            ))}
          </div>
        </div>
      )}

      <div className="p-3 rounded-xl bg-secondary/50 border border-border">
        <p className="text-xs text-muted-foreground">
          ⚠️ Filtering is a display convenience only — it changes nothing on-chain. We can't
          guarantee a token is safe or unsafe; never interact with an unexpected airdropped
          token (don't visit links in its name or "claim" it).
        </p>
      </div>
    </div>
  );
}
