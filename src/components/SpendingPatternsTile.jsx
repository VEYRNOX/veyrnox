// components/SpendingPatternsTile.jsx
//
// PRESENTATIONAL dashboard tile for Spending Patterns — outflow (sends) over time
// in per-asset NATIVE units. "Props in, chart out": it consumes the output of
// analytics/spendByPeriod and renders the design-system tile. It does NO data
// fetching, holds NO state, and touches NO storage — the container above it owns
// the active-set-scoped fetch. Being a pure function of props is what makes the
// deniability-parity and fail-closed properties testable without a browser.
//
// Honesty (mirrors the brief):
//   - Fail closed (I4): `indeterminate` (history can't be read) renders an honest
//     "unavailable" state, NEVER a zero-valued chart. `empty` is a distinct state.
//   - No fiat: amounts are the asset's own native units only (IBM Plex Mono).
//   - Per-asset: each asset's bars are scaled to that asset's own max — amounts of
//     different assets are never normalised onto one axis (no fiat denominator).
//   - Deniability (D2/D3): identical render logic in real and decoy mode, so an
//     equivalent-shaped history produces a structurally identical tile.

import { format } from 'date-fns';

const TITLE = 'Spending patterns';
const SUBTITLE = 'Outflow over time · native units, no fiat';

function periodLabel(periodStart, granularity) {
  return format(new Date(periodStart), granularity === 'week' ? 'd MMM' : 'MMM yy');
}

// Tile chrome is identical in every state (deniability: nothing about the frame
// implies which state — or which wallet — produced it). A plain helper (not a
// child component) so it is invoked inline and the returned tree is all host
// elements — which is what makes the tile directly inspectable in tests.
function frame(state, body) {
  return (
    <div data-testid="spending-patterns-tile" data-state={state} className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{TITLE}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">{SUBTITLE}</p>
      </div>
      {body}
    </div>
  );
}

export default function SpendingPatternsTile({ status, buckets = [], granularity = 'month', assetSymbol }) {
  // Fail closed (I4): history could not be read. Honest "unavailable" — never a
  // zero-filled chart that would read as "no spend".
  if (status === 'indeterminate') {
    return frame('indeterminate', (
      <div data-testid="spend-indeterminate" className="py-6 text-center">
        <p className="text-sm font-medium text-foreground">Spending history unavailable</p>
        <p className="text-[11px] text-muted-foreground mt-1">
          {assetSymbol ? `${assetSymbol} has` : 'This asset has'} no in-app transaction history, so spending
          can&rsquo;t be read here — nothing is shown rather than a fabricated figure.
        </p>
      </div>
    ));
  }

  // Readable, but genuinely no sends — distinct from indeterminate.
  if (status !== 'ok' || buckets.length === 0) {
    return frame('empty', (
      <div data-testid="spend-empty" className="py-6 text-center">
        <p className="text-sm font-medium text-foreground">No sends yet</p>
        <p className="text-[11px] text-muted-foreground mt-1">
          Once you send {assetSymbol || 'crypto'}, your outflow by period appears here.
        </p>
      </div>
    ));
  }

  // One bar per (period, asset). Each asset is scaled to its OWN max so unlike
  // assets are never placed on a shared (fiat-implying) axis.
  const bars = [];
  for (const b of buckets) {
    for (const sym of Object.keys(b.byAsset).sort()) {
      bars.push({ periodStart: b.periodStart, sym, amount: b.byAsset[sym] });
    }
  }
  const maxByAsset = {};
  for (const bar of bars) {
    const v = parseFloat(bar.amount) || 0;
    maxByAsset[bar.sym] = Math.max(maxByAsset[bar.sym] ?? 0, v);
  }

  return frame('ok', (
    <div className="space-y-2">
      {bars.map((bar, i) => {
        const max = maxByAsset[bar.sym] || 0;
        const pct = max > 0 ? Math.round((parseFloat(bar.amount) / max) * 100) : 0;
        return (
          <div key={`${bar.periodStart}-${bar.sym}-${i}`} data-testid="spend-bar" className="flex items-center gap-2.5">
            <span className="text-[11px] text-muted-foreground w-14 shrink-0">
              {periodLabel(bar.periodStart, granularity)}
            </span>
            <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[11px] font-mono tabular-nums text-foreground shrink-0">
              {bar.amount} {bar.sym}
            </span>
          </div>
        );
      })}
    </div>
  ));
}
