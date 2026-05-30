import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Clock, Unlock, AlertCircle } from "lucide-react";
import moment from "moment";

const USD_RATES = { BTC: 68000, ETH: 3200, SOL: 165, USDC: 1, USDT: 1 };
const UNBONDING_DAYS = { ETH: 7, SOL: 3, BTC: 14, USDC: 1, USDT: 1 };
const fmtUSD = (n) => "$" + Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
const fmt    = (n, d = 4) => Number(n).toFixed(d);

export default function UnstakingManager({ positions }) {
  const queryClient = useQueryClient();
  const unstaking = positions.filter(p => p.status === "unstaking");
  const unstaked  = positions.filter(p => p.status === "unstaked");

  const updatePosition = useMutation({
    mutationFn: ({ id, data }) => base44.entities.StakingPosition.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["staking-positions"] }),
  });

  const completeUnstake = (p) => {
    updatePosition.mutate({ id: p.id, data: { status: "unstaked" } });
  };

  if (unstaking.length === 0 && unstaked.length === 0) {
    return (
      <div className="text-center py-12 space-y-2">
        <Unlock className="h-8 w-8 text-muted-foreground mx-auto" />
        <p className="text-sm font-medium text-muted-foreground">No unstaking activity</p>
        <p className="text-xs text-muted-foreground">Positions you unstake will appear here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {unstaking.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Unbonding Positions</p>
          {unstaking.map(p => {
            const unbondDays    = UNBONDING_DAYS[p.currency] || 7;
            const requestedAt   = moment(p.unstake_requested_at);
            const availableAt   = requestedAt.clone().add(unbondDays, "days");
            const totalHours    = unbondDays * 24;
            const elapsedHours  = moment().diff(requestedAt, "hours", true);
            const pct           = Math.min(100, (elapsedHours / totalHours) * 100);
            const hoursLeft     = Math.max(0, totalHours - elapsedHours);
            const isReady       = pct >= 100;
            const usdValue      = (p.staked_amount || 0) * (USD_RATES[p.currency] || 1);

            return (
              <div key={p.id} className="rounded-2xl border border-border bg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold">{p.validator_name}</p>
                    <p className="text-[10px] text-muted-foreground">{p.currency} · Requested {requestedAt.format("MMM D, YYYY")}</p>
                  </div>
                  {isReady
                    ? <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-green-500/15 text-green-400">● Ready</span>
                    : <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-500">⏳ Unbonding</span>}
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-lg bg-secondary/50 p-2">
                    <p className="text-[10px] text-muted-foreground">Amount</p>
                    <p className="font-bold">{fmt(p.staked_amount, 4)}</p>
                    <p className="text-[10px] text-muted-foreground">{fmtUSD(usdValue)}</p>
                  </div>
                  <div className="rounded-lg bg-secondary/50 p-2">
                    <p className="text-[10px] text-muted-foreground">Available</p>
                    <p className="font-bold">{availableAt.format("MMM D")}</p>
                    <p className="text-[10px] text-muted-foreground">{availableAt.format("HH:mm")}</p>
                  </div>
                  <div className="rounded-lg bg-secondary/50 p-2">
                    <p className="text-[10px] text-muted-foreground">Remaining</p>
                    <p className="font-bold">{isReady ? "Now" : Math.ceil(hoursLeft) + "h"}</p>
                    <p className="text-[10px] text-muted-foreground">{unbondDays}d period</p>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>Unbonding progress</span>
                    <span>{pct.toFixed(0)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-secondary overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${isReady ? "bg-green-500" : "bg-yellow-500"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                {isReady ? (
                  <Button
                    size="sm"
                    className="w-full gap-1.5 text-xs"
                    onClick={() => completeUnstake(p)}
                    disabled={updatePosition.isPending}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> Withdraw {fmt(p.staked_amount, 4)} {p.currency}
                  </Button>
                ) : (
                  <div className="flex items-center gap-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 px-3 py-2">
                    <Clock className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
                    <p className="text-xs text-yellow-500">
                      Funds locked until {availableAt.format("MMM D [at] HH:mm")}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {unstaked.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Completed Withdrawals</p>
          {unstaked.map(p => (
            <div key={p.id} className="rounded-2xl border border-border bg-card p-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="h-5 w-5 text-green-400 shrink-0" />
                <div>
                  <p className="text-sm font-semibold">{p.validator_name}</p>
                  <p className="text-[10px] text-muted-foreground">{p.currency} · Withdrawn</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold">{fmt(p.staked_amount, 4)} {p.currency}</p>
                <p className="text-[10px] text-muted-foreground">{fmtUSD((p.staked_amount || 0) * (USD_RATES[p.currency] || 1))}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}