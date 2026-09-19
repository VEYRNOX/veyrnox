// @ts-nocheck
// src/components/subscription/BillingPeriodToggle.jsx
//
// The Monthly / Annual radiogroup, shared by the Safety Plus and AI Security
// Protection cards on /plans. Both drive the SAME `billing` state — the page
// owns it, this only renders it — so switching period on one card switches it
// on the other, which is the existing behaviour and deliberate: the CTA below
// each card buys the period the user last chose anywhere on the screen.
//
// Extracted because the two copies had drifted, and not only cosmetically: the
// AI copy carried no refs, no onKeyDown and no roving tabIndex, so it was a
// radiogroup the arrow keys did not operate and the Tab key walked through one
// stop at a time. Both buttons were natively focusable and Enter/Space worked,
// so this was an APG deviation rather than a keyboard block — the same gap the
// Safety Plus toggle had fixed and the copy never inherited. One component
// means one keyboard implementation; a third card cannot reintroduce the split.
import { useRef } from 'react';
import { Badge } from '@/components/ui/badge';

const ORDER = ['monthly', 'annual'];

// Accent is the ONLY intended difference between the two cards' toggles. Class
// strings stay literal rather than interpolated — Tailwind cannot see a built
// class name, and a purged border colour fails silently at runtime.
const ACCENTS = {
  primary: {
    monthlySelected: 'bg-background border border-border font-medium',
    annualSelected: 'bg-background border border-primary/40 font-medium',
    badge: 'border-primary/40 bg-background text-primary',
  },
  sky: {
    monthlySelected: 'bg-background border border-sky-500/40 font-medium',
    annualSelected: 'bg-background border border-sky-500/40 font-medium',
    badge: 'border-sky-500/40 bg-background text-sky-600',
  },
};

const UNSELECTED = 'text-muted-foreground hover:text-foreground';
const BASE =
  'text-sm rounded-md px-3 py-2 transition-colors text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ';

// Struck only when the regular price DIFFERS from what is shown. If the offer
// price could not be read we fall back to the base price, and "$5.99 struck
// through $5.99" would read as a broken discount.
function PriceLine({ price, regular, showRegular }) {
  return (
    <span className="block text-xs text-muted-foreground font-normal mono-value">
      {price ?? '—'}
      {showRegular && regular && regular !== price && (
        <span className="ms-1 line-through opacity-60">{regular}</span>
      )}
    </span>
  );
}

export default function BillingPeriodToggle({
  ariaLabel,
  value,
  onChange,
  accent = 'primary',
  monthlyPrice,
  annualPrice,
  monthlyRegularPrice,
  annualRegularPrice,
  showRegularPrices = false,
  savingPercent = null,
}) {
  const refs = { monthly: useRef(null), annual: useRef(null) };
  const a = ACCENTS[accent] ?? ACCENTS.primary;

  // A real radiogroup moves AND selects with the arrow keys, matching native
  // <input type="radio"> group behaviour.
  function handleKeyDown(e) {
    if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key)) return;
    e.preventDefault();
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
    const next = ORDER[(ORDER.indexOf(value) + dir + ORDER.length) % ORDER.length];
    onChange(next);
    refs[next].current?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      // Asymmetric grid anchors Annual as the primary choice — same pattern
      // used by Duolingo Super, Calm, Blinkist. Symmetric toggles leave Annual
      // as a peer of Monthly; giving it 2fr vs 1fr makes it the visual default
      // without hiding Monthly.
      className="grid grid-cols-[1fr_2fr] gap-2 p-1 rounded-lg bg-muted/40 border border-border"
    >
      <button
        ref={refs.monthly}
        type="button"
        role="radio"
        aria-checked={value === 'monthly'}
        tabIndex={value === 'monthly' ? 0 : -1}
        onClick={() => onChange('monthly')}
        className={BASE + (value === 'monthly' ? a.monthlySelected : UNSELECTED)}
      >
        Monthly
        <PriceLine price={monthlyPrice} regular={monthlyRegularPrice} showRegular={showRegularPrices} />
      </button>
      <button
        ref={refs.annual}
        type="button"
        role="radio"
        aria-checked={value === 'annual'}
        tabIndex={value === 'annual' ? 0 : -1}
        onClick={() => onChange('annual')}
        className={BASE + 'relative ' + (value === 'annual' ? a.annualSelected : UNSELECTED)}
      >
        Annual
        {/* Derived from the two prices actually rendered, not a hardcoded
            "30%". Monthly and annual resolve through two independent offer
            lookups, so annual can end up the worse deal; when it does — or when
            either price is unresolvable — the caller passes null and no badge
            is shown. */}
        {savingPercent != null && (
          <Badge
            variant="outline"
            className={`absolute -top-2 end-1 text-[9px] leading-none px-1.5 py-0.5 h-auto whitespace-nowrap ${a.badge}`}
          >
            Save {savingPercent}%
          </Badge>
        )}
        <PriceLine price={annualPrice} regular={annualRegularPrice} showRegular={showRegularPrices} />
      </button>
    </div>
  );
}
