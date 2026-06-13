# Veyrnox — Automated Full-Functionality Validation Sweep (FLAG-ONLY)

**Date:** 2026-06-13 · **Scope:** UI/UX + input/output validation · **Mandate:** flag-only, no fixes, no `src/` changes beyond test files.

This report accompanies the test suite added under
[`src/validation-sweep/__tests__/`](../src/validation-sweep/__tests__) (Vitest — runs in
the CI `verify` gate) and [`e2e/onboarding.spec.js`](../e2e/onboarding.spec.js)
(Playwright — browser-only, **not** in the gate).

---

## 0. Method & honest status

- **Discovery-first.** Every assertion is grounded in a real, read selector / string /
  code path. Where no stable selector exists, it is listed in §6 (untestable), not guessed.
- **Two foundational facts were verified LIVE** against the running dev server
  (`localhost:5173`): the demo-gate bypass (§1, F1) and the local-build welcome hero.
  Remaining UI-flow assertions for the **browser-only** suite were *authored from
  verified selectors but NOT executed here* — Playwright is not installed in this
  environment, and the CI gate is Vitest-only. This is called out per flag.
- **CI-green convention.** A required check that is permanently red blocks merge, which
  defeats "add via PR so the gate runs." So documented defects are encoded with Vitest
  **`it.fails()`** (and Playwright **`test.fail()`**): the body asserts the *ideal*, which
  currently throws, so the marker **passes** (gate stays green) but flips **red the moment
  the bug is fixed**, forcing cleanup. Conformant behavior uses normal green `it()`.
- **Suite result:** `31 passed | 6 expected-fail (37)` across 5 files (run in the main
  checkout; the worktree has a pre-existing `fake-indexeddb`/`/@fs` resolution quirk that
  affects *all* tests equally and does not exist in CI's clean `npm ci`).

**Severity key:** 🔴 High · 🟠 Medium · 🟡 Low · ⚪ Info/by-design.

---

## 1. FOUNDATIONAL FINDING — what `?demo=1` actually loads (hard-rule #3)

### F1 ⚪ `?demo=1` (web) BYPASSES the onboarding gate entirely
- **Screen:** app entry / router.
- **Expected (per brief):** `…/?demo=1` exercises `fresh open → PIN-create → … → reload → PIN pad`.
- **What actually happens:** In the **web** build, `?demo=1` ⇒ `DEMO=true` ⇒
  `BACKEND='demo'` ⇒ `WALLET_AUTH=false`; `NATIVE=false` on web ⇒
  **`WALLET_GATE = WALLET_AUTH || NATIVE = false`**, so
  [`WalletGate.jsx`](../src/components/WalletGate.jsx) returns a gate-less `<Outlet/>` — a
  **pre-seeded pass-through tour**. `Dashboard.jsx:47` then renders `<DemoDashboard/>`, not
  the real `<WalletPortfolioPage/>`. **The onboarding/PIN state machine is NOT reachable at
  `?demo=1`.** It only runs in the default **LOCAL** build (no `?demo`).
- **Verified LIVE:** `/?demo=1` → no PIN pad; `/?demo=0` (no vault) → "Get Started" welcome hero.
- **Invariant:** none (correct, by-design). **This re-scopes the whole brief:** onboarding
  assertions target the local build; deniability/design assertions can use either, but
  real-vs-demo dashboards **diverge** (relevant to D1 and structural-identity).
- **Repro:** `localStorage.removeItem('veyrnox-demo')`; visit `/?demo=1` → tour, no gate;
  visit `/?demo=0` → welcome hero.
- **Locked by:** `00-demo-gate-determination.test.js`.

### F1-corollary ⚪ Demo flag persists silently
- `?demo=1` writes `veyrnox-demo=1` to `localStorage`; demo then stays on across reloads on a
  bare `/` URL. A sweep that forgets to clear it silently tests the **fake-seeded tour**.
  Always `/?demo=0` first (CLAUDE.md known trap). Locked by the same file.

### WELCOME-1 ⚪ Brief's state order omits the Welcome hero
- The authoritative first screen of a fresh local build is a branded **Welcome hero with
  "Get Started"** (`resolveOnboardingEntry({hasVault:false}) → 'welcome'`), *then* PIN-create.
  The brief's "fresh open → PIN-create" skips this step. Real order:
  **welcome → PIN-create (6+confirm) → choose/empty → Create Wallet (atomic) → dashboard → reload → PIN unlock.**

---

## 2. DENIABILITY — wallet-count / cardinality tells (D-rules, I3)

> CLAUDE.md design principle: *"deniability by default (never show wallet count/list)."*
> The brief: *"FLAG any wallet-count string."* All surfaces below are reachable in the
> **local (real) build** (Dashboard→WalletPortfolioPage; the others are routed in `App.jsx`).
> **Nuance:** these render the **active-context** count, not a hidden-set oracle, and the
> existing `portfolioDeniability.test.js` already proves no *balance/total* line branches on
> `isDecoy/isHidden`. They are still flagged because the stated principle is absolute.

| ID | Sev | Screen | Expected | What happened | Source |
|----|-----|--------|----------|---------------|--------|
| **D1** | 🟠 | Dashboard (real build) | No wallet-count string | `{pfWallets.length} wallet{…"s"} in this portfolio` rendered unconditionally | `WalletPortfolioPage.jsx:519` |
| **D2** | 🟠 | Stealth Wallets | No visible count | `Your visible wallets ({evmWallets.length}):` | `StealthWallets.jsx:289` |
| **D3** | 🟠 | On-Chain Analytics | No count stat | `{ label: "Wallets", value: wallets.length }` stat tile | `OnChainAnalytics.jsx:78` |
| **D3** | 🟠 | Risk Scoring | No count stat | `{ label:"Diversification", value: wallets.length, unit:" wallets" }` | `RiskScoring.jsx:55` |

- **Invariant touched:** D-rules (cardinality tell) / I3 / design "never show wallet count".
- **Repro:** local build, create ≥1 wallet, open each screen; observe the count string.
- **Locked by:** `deniability-wallet-count.test.js` (characterization green + `it.fails` ideal).
- **CONFORMANT (verified, no flag):** Audit Log & the orphaned `AuditLogPage` stay
  HONEST-DISABLED/unrouted (existing `audit-log-honest-disabled.test.js`); no balance/total
  line branches on the decoy flag (`canManage` is the sole consumer).

---

## 3. SEND FLOW — input/output validation

| ID | Sev | Screen | Expected | What happened | Invariant | Source |
|----|-----|--------|----------|---------------|-----------|--------|
| **S3** | 🟠 | Send | Block sending to your own address | **No self-send guard anywhere** in the flow or libs; self-send is permitted (fee burn / footgun) | UX / fail-closed | `SendCrypto.jsx` (absent) |
| **S1** | 🟡 | Send (BTC) | Reject checksum-invalid address | Validation is a **shallow regex**; a well-shaped `tb1…` with a bogus checksum passes the UI gate (real checksum only at sign time) | I4 (defense-in-depth) | `addressValidation.js:18,57` |
| **S2** | 🟡 | Send / Address Book | Empty/unknown → invalid (fail-closed) | `isValidAddressForCurrency('',…)` and unknown currency both **return `true`** (form gates empty separately) | I4 fail-closed | `addressValidation.js:50,59` |
| **S4** | 🟡 | Send | Amount input hardened for decimals | `<Input type="number" placeholder="0.00">` has **no `inputMode="decimal"`, no `min`, no `step`** (wrong mobile keypad; permissive parse, gated later by `toBaseUnits`) | robustness | `SendCrypto.jsx:824` |

- **CONFORMANT (verified):** `toBaseUnits` (the amount→base-unit core) correctly **throws**
  (never silently truncates) on zero, negative, empty, scientific notation (`1e-3`),
  multiple dots, letters, and >max-precision; accepts leading zeros / bare leading dot.
  EVM checksum validation via ethers is correct (bad-checksum rejected).
- **Repro (S3):** Send screen → paste the *sender's own* address → Continue stays enabled.
- **Locked by:** `send-io-validators.test.js`.

---

## 4. INDETERMINATE never renders as `0` (the `?? 0` / `catch→0` concern)

| ID | Sev | Screen | Expected | What happened | Source |
|----|-----|--------|----------|---------------|--------|
| **IND-1** | 🟡 | Portfolio balances | A resolved-but-non-finite read → indeterminate | `Number(x) \|\| 0` folds a resolved **NaN/undefined** to `0`; only *thrown* errors become `null`. A non-throwing garbage read understates as `0` | `portfolioBalances.js:52,59,63,67` |

- **CONFORMANT (verified, strong):** `fetchAssetAmount` returns **`null` (indeterminate)** on a
  thrown read — never a silent `0`; `computePortfolio`/`sumPortfolioTotal` carry
  indeterminacy and sum only readable wallets, so a failed read marks the total **incomplete**
  rather than understating it. A genuine empty wallet (`0`) is correctly distinguished from a
  failure (`null`). This is the brief's headline concern and the code gets it right.
- **Locked by:** `indeterminate-not-zero.test.js`.

---

## 5. Console / runtime (observed LIVE)

| ID | Sev | Expected | What happened |
|----|-----|----------|---------------|
| **CONSOLE-1** | 🟠 | No `buffer.Buffer` access in client code | Repeated warn: `Module "buffer" has been externalized for browser compatibility. Cannot access "buffer.Buffer" in client code.` — a client path touches `buffer.Buffer`, which is `undefined` in the browser bundle (latent encoding/crypto-path defect candidate). |
| **CONSOLE-2** | 🟡 | Clean console | React Router v7 future-flag warnings (`v7_startTransition`, `v7_relativeSplatPath`) printed repeatedly on every nav. |

- **Repro:** open devtools console on any route. **Not yet root-caused** (flag-only) — CONSOLE-1
  warrants a follow-up to find the `buffer.Buffer` call site.

---

## 6. UNTESTABLE — no stable selector / test-infra gaps (block coverage, not product bugs)

These are **test-infrastructure** gaps. They are *why* large parts of the brief cannot be
covered in the Vitest gate and must fall to the browser-only suite.

| ID | Gap | Detail |
|----|-----|--------|
| **T-INFRA-1** | **No `data-testid` anywhere** | The entire app ships zero `data-testid`. Onboarding (`Get Started`, `Create Wallet`, `Import…`), every Send field/button (amount, recipient, asset/wallet `Select`, `Continue`/`Confirm & Send`/`Authorise & Send`/`Back`), and PIN digit keys are reachable **only** by role+visible-text or `aria-label`. Text/role handles are brittle (i18n, copy edits). Recommend stable testids on the onboarding + send critical path. |
| **T-INFRA-2** | **No RTL / DOM render harness** | `@testing-library/react` is not a devDependency; existing `.jsx` tests invoke components as functions or render pure components via `renderToStaticMarkup`. Hook/context components (`WalletEntry`, `SendCrypto`, `WalletPortfolioPage`) cannot be unit-rendered, so live interaction (PIN cap firing `onComplete` once, rapid double-tap, confirm-mismatch reset, double-submit idempotency) is **not** gate-testable. |
| **T-INFRA-3** | **`PinPad.press()` not extracted** | The 6-digit cap / auto-submit / numeric-only logic lives in an un-exported closure. Extracting it to a pure reducer would make the boundaries unit-testable without a browser. |
| **T-INFRA-4** | **Radix `Select` (asset/wallet) opaque** | The from-wallet and asset selectors are unstyled Radix primitives with no testid; option selection needs the Radix keyboard protocol or a browser. |

**Testable handles that DO exist** (use these): PinPad status `role="status"` +
`aria-label="N of 6 digits entered"`, clear `aria-label="Clear — re-enter PIN"`, delete
`aria-label="Delete last digit"`; Send QR `aria-label="Scan QR code"`; reauth
`aria-label="Vault password for send authorisation"`; design-system testids
`spending-patterns-tile`, `rasp-surface`, etc.

---

## 7. Best-practice / robustness

| ID | Sev | Finding |
|----|-----|---------|
| **A11Y-PIN-1** | 🟠 | **PIN pad has no physical-keyboard handler** (`onKeyDown`/`onKeyPress` absent). A keyboard-only user cannot type digits; they must Tab through 12 buttons and press Space/Enter. Verified in source; browser-confirming test is `e2e` `test.fail`. |
| **A11Y-ARIA-1** | 🟡 | PinPad ARIA is good (status + labelled controls). Error containers in `WalletEntry` have **no `role="alert"`/`aria-live`**, so PIN-mismatch and provisioning errors are not announced. |

---

## 8. Coverage status against the brief (honest)

| Brief area | Coverage | Where |
|------------|----------|-------|
| Demo-mode determination (#3) | ✅ done (live + gate) | F1, `00-demo-gate…` |
| Onboarding state machine + illegal transitions | ⚠️ partial — **logic/source in gate; live flow authored, not executed** | `e2e/onboarding.spec.js` |
| PIN pad boundaries (cap, non-numeric, paste, mismatch, back) | ⚠️ partial — composition+source in gate; live interaction needs browser | `pinpad-boundaries…`, T-INFRA-3 |
| Send I/O (amount + recipient cases) | ✅ pure validators in gate | §3 |
| INDETERMINATE ≠ 0 | ✅ in gate | §4 |
| Loading/error/empty async states | ⚠️ documented (recon) — needs browser | (Send: "reading from chain…", FeeSelector loading/error states confirmed in source) |
| Deniability wallet-count scan | ✅ in gate | §2 |
| Structural identity real-vs-decoy DOM | ❌ not gate-testable (no RTL); real≠demo render diverges | T-INFRA-2 |
| Audit Log / Login Activity honest-disabled | ✅ (existing guard) | §2 |
| Design-system mono-for-verifiable | ✅ conformant (recon: addresses/amounts/fees all `font-mono`/`.mono-value`/`<code>`) | — |
| Keyboard nav / focus-trap / focus ring / responsive / offline / secrets-in-DOM | ❌ browser-only, **not run here** | §6, e2e |

> Items marked ❌/⚠️ "browser-only" are genuinely outside the Vitest gate's reach and were
> not executed in this environment (no Playwright install). They are authored against
> verified selectors in `e2e/onboarding.spec.js` and ready to run locally.

---

## 9. Flag index

`F1`, `WELCOME-1` (info) · `D1 D2 D3` (deniability) · `S1 S2 S3 S4` (send) ·
`IND-1` (indeterminate) · `CONSOLE-1 CONSOLE-2` (runtime) ·
`A11Y-PIN-1 A11Y-ARIA-1` (a11y) · `T-INFRA-1…4` (coverage gaps).

**No bug was fixed.** Each defect is left in place and documented by a marked-failing test
(`it.fails`/`test.fail`) plus the row above.
