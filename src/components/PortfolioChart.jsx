import { useMemo, useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid
} from "@/lib/recharts";
import moment from "moment";
import { USD_RATES } from "@/lib/cryptos";

const PERIODS = [
  { key: "7d",  label: "7D",  days: 7,   unit: "days",  fmt: "MMM D",    tickCount: 7  },
  { key: "1m",  label: "1M",  days: 30,  unit: "days",  fmt: "MMM D",    tickCount: 6  },
  { key: "1y",  label: "1Y",  days: 365, unit: "weeks", fmt: "MMM 'YY",  tickCount: 12 },
];

function CustomTooltip({ active = undefined, payload = undefined, label = undefined }) {
  if (!active || !payload?.length) return null;
  const val = payload[0]?.value;
  return (
    <div className="bg-card border border-border rounded-xl px-3 py-2.5 shadow-xl text-xs min-w-[120px]">
      <p className="text-muted-foreground mb-1">{label}</p>
      <p className="font-bold text-base text-foreground">
        ${val?.toLocaleString(undefined, { maximumFractionDigits: 2 })}
      </p>
    </div>
  );
}

function buildDayMap(transactions) {
  const map = {};
  const sorted = [...transactions].sort((a, b) => (/** @type {any} */ (new Date(a.created_date))) - (/** @type {any} */ (new Date(b.created_date))));
  sorted.forEach(tx => {
    const day = moment(tx.created_date).format("YYYY-MM-DD");
    const usdDelta = tx.amount * (USD_RATES[tx.currency] || 1);
    if (!map[day]) map[day] = 0;
    if (tx.type === "receive") map[day] += usdDelta;
    else if (tx.type === "send") map[day] -= usdDelta;
  });
  return map;
}

function buildPoints(days, dayMap, currentBalance, formatStr) {
  // Walk backwards from today using transaction deltas
  let bal = currentBalance;
  const reversed = [...days].reverse();
  const result = reversed.map(d => {
    const point = { date: moment(d).format(formatStr), value: Math.max(0, bal), _raw: d };
    bal -= (dayMap[d] || 0);
    return point;
  });
  return result.reverse();
}

function buildYearPoints(dayMap, currentBalance) {
  // 52 weekly snapshots
  const weeks = [];
  for (let i = 51; i >= 0; i--) {
    weeks.push(moment().subtract(i, "weeks").startOf("isoWeek").format("YYYY-MM-DD"));
  }
  let bal = currentBalance;
  const reversed = [...weeks].reverse();
  const result = reversed.map(weekStart => {
    // sum deltas for 7 days in that week
    let weekDelta = 0;
    for (let d = 0; d < 7; d++) {
      const day = moment(weekStart).add(d, "days").format("YYYY-MM-DD");
      weekDelta += dayMap[day] || 0;
    }
    const point = { date: moment(weekStart).format("MMM 'YY"), value: Math.max(0, bal) };
    bal -= weekDelta;
    return point;
  });
  return result.reverse();
}

export default function PortfolioChart({ transactions, currentBalance }) {
  const [activePeriod, setActivePeriod] = useState("1m");

  const period = PERIODS.find(p => p.key === activePeriod);

  const dayMap = useMemo(() => buildDayMap(transactions), [transactions]);

  const data = useMemo(() => {
    if (activePeriod === "1y") {
      if (!transactions.length) {
        return Array.from({ length: 52 }, (_, i) => ({
          date: moment().subtract(51 - i, "weeks").format("MMM 'YY"),
          value: currentBalance,
        }));
      }
      return buildYearPoints(dayMap, currentBalance);
    }

    const days = [];
    for (let i = period.days - 1; i >= 0; i--) {
      days.push(moment().subtract(i, "days").format("YYYY-MM-DD"));
    }

    if (!transactions.length) {
      return days.map(d => ({ date: moment(d).format(period.fmt), value: currentBalance }));
    }
    return buildPoints(days, dayMap, currentBalance, period.fmt);
  }, [activePeriod, dayMap, currentBalance, transactions.length]);

  // Compute change over the period
  const { change, changePct, isPositive } = useMemo(() => {
    if (data.length < 2) return { change: 0, changePct: 0, isPositive: true };
    const first = data[0].value;
    const last = data[data.length - 1].value;
    const change = last - first;
    const changePct = first > 0 ? (change / first) * 100 : 0;
    return { change, changePct, isPositive: change >= 0 };
  }, [data]);

  const strokeColor = isPositive ? "hsl(142,71%,45%)" : "hsl(0,72%,58%)";
  const fillId = isPositive ? "areaGradPos" : "areaGradNeg";
  const fillColorStop = isPositive ? "hsl(142,71%,45%)" : "hsl(0,72%,58%)";

  const minVal = Math.min(...data.map(d => d.value));
  const maxVal = Math.max(...data.map(d => d.value));
  const yPad = (maxVal - minVal) * 0.1 || 100;

  const tickInterval = Math.max(1, Math.floor(data.length / period.tickCount) - 1);

  return (
    <div className="space-y-3">
      {/* Period selector + change badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 bg-secondary rounded-lg p-0.5">
          {PERIODS.map(p => (
            <button
              key={p.key}
              onClick={() => setActivePeriod(p.key)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                activePeriod === p.key
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${
          isPositive ? "bg-green-500/15 text-green-400" : "bg-destructive/15 text-destructive"
        }`}>
          <span>{isPositive ? "▲" : "▼"}</span>
          <span>
            {isPositive ? "+" : ""}${Math.abs(change).toLocaleString(undefined, { maximumFractionDigits: 2 })}
            {" "}({isPositive ? "+" : ""}{changePct.toFixed(2)}%)
          </span>
        </div>
      </div>

      {/* Chart */}
      <div className="w-full h-52">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 5, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={fillColorStop} stopOpacity={0.25} />
                <stop offset="100%" stopColor={fillColorStop} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(240,5%,20%)" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "hsl(240,5%,55%)" }}
              tickLine={false}
              axisLine={false}
              interval={tickInterval}
            />
            <YAxis
              domain={[Math.max(0, minVal - yPad), maxVal + yPad]}
              tick={{ fontSize: 10, fill: "hsl(240,5%,55%)" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={v => `$${v >= 1000 ? (v / 1000).toFixed(1) + "k" : v.toFixed(0)}`}
              width={52}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="value"
              stroke={strokeColor}
              strokeWidth={2}
              fill={`url(#${fillId})`}
              dot={false}
              activeDot={{ r: 4, fill: strokeColor, strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}