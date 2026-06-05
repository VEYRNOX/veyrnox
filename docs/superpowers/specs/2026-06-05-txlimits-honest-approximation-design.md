# Honest approximation for spend-cap USD figures

**Date:** 2026-06-05
**Branch:** `feat/txlimits-honest-approx` (stacked on `feat/usd-reference-rate-honesty` / PR #111)
**Status:** Approved design — ready for implementation plan

## Problem

Transaction spend limits (Security Center → Tx Limits, enforced in the Send flow
via `src/lib/txLimits.js`) are **denominated in USD**. Every prospective send and
every "sent today" running total is converted from its native crypto amount to
USD using the **static `USD_RATES`** table in `src/lib/cryptos.js` — the same
stale reference prices PR #111 consolidated and labelled.

The figures derived from those static rates are currently **presented as if they
were exact dollars**. Concretely:

- `SecurityCenter.jsx` renders the converted "Sent today" total as a precise
  `$X / $Y` against the cap.
- `SendCrypto.jsx` already prefixes converted values with an ad-hoc `~$`, but the
  format is hand-written and duplicated four times, and uses `~` rather than a
  clear "approximately" marker.

This is a **presentation-honesty** gap, not a security hole. The cap's agreed
role is a **self-discipline guardrail** (protect the user from their own
overspending), it is intentionally **user-overridable** (the `limitAck`
checkbox), and approximate USD is acceptable. The fix is to stop presenting
rate-derived figures as exact — nothing more.

## Non-goals (explicitly out of scope)

- **No change to enforcement logic.** Whether a send is blocked, the per-tx and
  daily thresholds, and the `limitAck` override are all unchanged.
- **No live-rate fetching.** The signing gate stays fully on-device and
  offline-safe; we do not add a network call to the price feed.
- **No native-unit caps / data migration.** Caps remain USD-denominated and
  stored as today (`daily_limit`, `per_transaction_limit`).
- **No change to the `toUsd` 1:1 unknown-currency fallback behaviour** — only its
  misleading comment is corrected (see below).

## The precision rule

The single concept this introduces:

| Kind of figure | Source | Rendering |
|---|---|---|
| **Converted** USD (`amountUSD`, `spentTodayUSD`, `projectedUSD`, SecurityCenter "spent today") | crypto amount × static `USD_RATES` | **`≈$X`** (approximate) |
| **User-entered** cap (`daily_limit`, `per_transaction_limit`, `limitUSD`) | a number the user typed | **`$X`** (exact) |

A figure is approximate **iff** it passed through `USD_RATES`. Caps the user
typed in USD are exact and keep the plain `$`.

## Components / changes

### 1. New `approxUsd(n)` formatter — `src/lib/cryptos.js`

Co-located with `USD_REFERENCE_NOTE` (same "honest reference-rate presentation"
concern; single source of truth, mirroring how `ReferenceRateNote` centralises
the disclosure wording).

Contract:

- Input: a number (USD value already computed from `USD_RATES`).
- Output: a string `` `≈$${rounded.toLocaleString()}` `` using **whole-dollar
  rounding** (`Math.round`), matching the rounding the Send flow already applies.
- Guard: non-finite or negative input → `≈$0` (never throws, never `≈$NaN`).
- Examples: `1650.4 → "≈$1,650"`, `0.6 → "≈$1"`, `0 → "≈$0"`,
  `NaN → "≈$0"`, `-5 → "≈$0"`.

The `≈` marker standardises the app on one "approximately" symbol, replacing the
ad-hoc `~$` in SendCrypto.

### 2. `SecurityCenter.jsx` — the actual honesty gap

At the "Sent today (local)" line, wrap the converted `spent` value in
`approxUsd(...)`:

- Before: `${Math.round(spent).toLocaleString()} / ${l.daily_limit.toLocaleString()}`
- After: `{approxUsd(spent)} / ${l.daily_limit.toLocaleString()}`

The cap (`l.daily_limit`) stays exact `$`. The per-tx / daily cap figures on
lines above (also user-entered) are unchanged.

### 3. `SendCrypto.jsx` — consistency

Replace the four ad-hoc `~$${Math.round(<converted>).toLocaleString()}`
expressions in the limit-breach warning (per-tx and daily messages) with
`approxUsd(<converted>)`. Cap values (`r.limitUSD`) stay exact `$`. No wording or
behaviour change beyond `~$` → `≈$`.

### 4. `txLimits.js` — truthful comment (no code change)

The module header and `toUsd` comment currently claim the `1:1` fallback for an
unpriced currency is "conservative (never under-counts spend)". That is **false**
for any asset worth more than \$1 (e.g. 1 BTC counted as \$1). Rewrite the
comment to state the truth: `1:1` is an arbitrary fallback for *unpriced* assets
and is approximate in either direction; it never triggers for the 10 priced
coins, which is why enforcement is unaffected in practice. The code is unchanged.

## Error handling / edge cases

- `approxUsd` guards `NaN`, `Infinity`, `-Infinity`, and negative inputs → `≈$0`.
- Sub-\$1 converted values round to `≈$0` (consistent with the existing
  `Math.round` behaviour in the Send flow); acceptable for a guardrail display.
- The signing-time gate (`evaluateSendAgainstLimits`) is untouched, so offline
  sends behave exactly as before.

## Testing

- **New unit tests** for `approxUsd` in `src/lib/__tests__/cryptos.test.js` (new
  file; matches the repo convention — sibling of the existing
  `src/lib/__tests__/txLimits.test.js`, picked up by the `src/**/*.test.{js,jsx}`
  vitest glob): whole-dollar rounding, `≈` prefix, thousands separators,
  sub-cent → `≈$0`, and the non-finite / negative guard.
- **Existing `txLimits` tests stay green, unchanged** — this is the evidence that
  enforcement logic did not drift (presentation-only change).
- Full gate before commit: `npm run lint`, `npm run build`, `npm test` (expect
  the current 432 green plus the new `approxUsd` cases).

## Affected files

- `src/lib/cryptos.js` — add `approxUsd`.
- `src/pages/SecurityCenter.jsx` — use `approxUsd` for "spent today".
- `src/pages/SendCrypto.jsx` — use `approxUsd` in breach warnings.
- `src/lib/txLimits.js` — comment correction only.
- `src/lib/__tests__/cryptos.test.js` — new unit tests for `approxUsd`.
