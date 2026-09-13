# Gemini weekly sweep — 2026-09-13

> **Internal long-context pass.** Conducted by Gemini 3.1 Pro.
> INTERNAL only. Does NOT close the independent audit gate.

- Target: `src/pages/`
- Files: 180
- Bytes: 1915588 (~478897 tokens)
- Model: gemini-3.1-pro-preview
- Base commit: `60423c74ac2bf8dac16581301c1ea387e8643c82`

## Findings (Gemini raw output, verbatim)

[HIGH] src/pages/CustomDashboardWidgets.jsx:4107 (cross-ref src/pages/Dashboard.jsx:4441) — Drift in localStorage key ("dashboard-widget-config" vs "dashboard-widgets") causes CustomDashboardWidgets edits to be ignored by Dashboard — Standardise on a single shared storage key.
[CRITICAL] src/pages/Dashboard.jsx:4447 — Writes to shared localStorage without gating on deniability, leaking decoy session widget layout to the primary session — Wrap `localStorage.setItem` in `if (isDecoy || isHidden) return;`.
[CRITICAL] src/pages/CustomDashboardWidgets.jsx:4139 — Writes to shared localStorage without gating on deniability, leaking layout edits across sessions — Add a deniability check before calling `localStorage.setItem`.
[CRITICAL] src/pages/Dashboard.jsx:4458 — Reads base44 entities (PriceAlert, Wallet, Transaction) without gating on deniability, exposing primary session data in decoy sessions — Pull `isDecoy`/`isHidden` from `useWallet` and add `enabled: !isDecoy && !isHidden` to the useQuery configurations.
[CRITICAL] src/pages/AnomalyDetection.jsx:1102 — Reads base44 entities (Transaction, FraudAlert) without gating on deniability, exposing primary session data in decoy sessions — Pull `isDecoy`/`isHidden` from `useWallet` and add `enabled: !deniable` to the useQuery configurations.
[CRITICAL] src/pages/FraudDetection.jsx:6498 — Reads base44 entities (Transaction, AddressBook, FraudAlert) without gating on deniability, exposing primary session data in decoy sessions — Pull `isDecoy`/`isHidden` from `useWallet` and add `enabled: !deniable` to the useQuery configurations.
[CRITICAL] src/pages/BudgetLimits.jsx:2217 — Reads and writes base44 entities (BudgetLimit, Transaction) without gating on deniability, exposing and corrupting primary session data in decoy sessions — Add `enabled: !deniable` to queries and `if (deniable) denyInDeniable();` to mutations.
[CRITICAL] src/pages/InvoiceGenerator.jsx:7810 — Reads and writes base44 entities (Invoice) without gating on deniability, exposing and corrupting primary session data in decoy sessions — Add `enabled: !deniable` to queries and `if (deniable) denyInDeniable();` to mutations.
[CRITICAL] src/pages/RecurringPayments.jsx:13780 — Reads and writes base44 entities (RecurringPayment, Wallet) without gating on deniability, exposing and corrupting primary session data in decoy sessions — Add `enabled: !deniable` to queries and `if (deniable) denyInDeniable();` to mutations.
[CRITICAL] src/pages/NewsSentimentPage.jsx:9750 — Reads and writes base44 entities (NewsSentiment) without gating on deniability, exposing and corrupting primary session data in decoy sessions — Add `enabled: !deniable` to queries and `if (deniable) denyInDeniable();` to mutations.
[CRITICAL] src/pages/OnChainAnalytics.jsx:10029 — Reads base44 entities (Transaction, Wallet) without gating on deniability, exposing primary session data in decoy sessions — Add `enabled: !deniable` to queries.
[CRITICAL] src/pages/SavingsGoals.jsx:15214 — Reads and writes base44 entities (SavingsGoal) without gating on deniability, exposing and corrupting primary session data in decoy sessions — Add `enabled: !deniable` to queries and `if (deniable) denyInDeniable();` to mutations.
[LOW] src/pages/CorrelationMatrix.jsx:3438 — Dead file (no imports, no route, no test) — Delete the file.
[LOW] src/pages/CustomDashboardWidgets.jsx:4080 — Dead file (no active imports or routes) — Delete the file or integrate it into Dashboard.jsx.

## Verification notes (Claude, same run)

Checked against `60423c74` by reading the files, not by trusting the output.
Triage input only; nothing below is verified on a device, and no status tag
changes.

- **Every line number above is a corpus offset, not a file line.** The cited
  numbers run 1102–15214; the largest flagged file (`Dashboard.jsx`) is 541
  lines. Same failure as the 2026-09-06 run. Use the file names.
- **Both "dead file" findings are FALSE.** `CorrelationMatrix.jsx` is routed
  at `/correlation` and `CustomDashboardWidgets.jsx` at `/dashboard-widgets`
  (both lazy-imported in `src/App.jsx`). Do not delete either.
- **Widget-key drift is REAL.** `Dashboard.jsx` reads and writes
  `dashboard-widgets`; `CustomDashboardWidgets.jsx` uses
  `dashboard-widget-config` (its `STORAGE_KEY`). The two screens do not share
  config. Both keys are already in `src/wallet-core/panic.js`'s residue list,
  so panic wipe covers both. Severity as UX drift, not HIGH.
- **The localStorage deniability findings are PLAUSIBLE but overstated.** Neither
  widget writer checks for a decoy or demo session, so a coerced session can
  change the real user's layout. What leaks is a layout preference, not wallet
  data. That fits the K-2 write-gate pattern (`lib/consent.js`) more than CRITICAL.
- **The entity-read deniability findings are the substantive result, and the
  class is REAL.** `src/api/localClient.js` keeps every entity in one shared
  IndexedDB (`veyrnox-appdata`) with no per-session partitioning. Sibling pages
  were already fixed for exactly this K-2 class with a two-chokepoint gate
  (`enabled: !deniable` plus a blanked derived list, and mutations throw
  `DENIABILITY_BLOCKED`): `PriceAlerts.jsx`, `Settings.jsx`, `AddressBook.jsx`,
  `NetworkManager.jsx` and `components/WatchlistWidget.jsx`. The flagged pages
  have no deniability reference at all: `Dashboard.jsx`, `AnomalyDetection.jsx`,
  `FraudDetection.jsx`, `BudgetLimits.jsx`, `InvoiceGenerator.jsx`,
  `RecurringPayments.jsx` and `SavingsGoals.jsx`. `OnChainAnalytics.jsx` has none
  either.
  - **Highest-impact instance: `Dashboard.jsx`.** It runs an ungated
    `Wallet.list()`, `Transaction.list()` and `PriceAlert.filter()`, and a
    `Wallet.create` / `Wallet.update` mutation. `Settings.jsx` gates the same
    `Wallet` read because it exposes wallet names and count, which breaks the
    design-system "never show wallet count/list" rule.
  - Whether a decoy session actually reaches these routes with real rows in
    the store was NOT established here. Route-level gating in
    `components/Layout.jsx` was not traced end to end. Confirm reachability
    before rating CRITICAL.
  - Exposure depends on real rows existing. `FraudAlert` has no writer in
    `src/`, so that part of the `AnomalyDetection` / `FraudDetection` findings
    reads an empty store. `Transaction` is written by `SendCrypto.jsx`, and
    `Wallet` by six pages. `BudgetLimit`, `Invoice`, `RecurringPayment`,
    `NewsSentiment` and `SavingsGoal` are each written only by their own page.
- **`NewsSentimentPage.jsx` is partly covered.** At line 87 the analyse control
  is gated on `LLM_AVAILABLE && !isDeniabilityOrDemoActive()`. The saved-list
  query at line 47 is ungated. `LLM_AVAILABLE` is false in the local build, so
  that build cannot reach the only `NewsSentiment.create`, and the store should
  be empty there. Low practical exposure. `CorrelationMatrix.jsx` already gates
  its query with `enabled: !isDeniabilityOrDemoActive()`, and Gemini did not
  flag it for deniability.
- No existing issue matched a search for this gap. None was filed from this run.
