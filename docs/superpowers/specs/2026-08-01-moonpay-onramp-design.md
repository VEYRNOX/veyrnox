# MoonPay On-Ramp — Design Spec
**Date:** 2026-08-01  
**Status:** Approved  
**Replaces:** Transak on-ramp (PRs #1509, #1511 — kept open in parallel, CI-failing)

---

## 1. Goal

Ship a MoonPay fiat on-ramp behind two independent build-time gates so it appears on the staging preview only and cannot reach production until partner agreement + prod keys are in place. Mirrors the Transak integration architecture exactly; the only differences are the provider's URL schema and asset-code naming.

---

## 2. Scope

**In scope:**
- `src/lib/buy/moonpayUrl.js` — pure URL builder
- `src/lib/buy/__tests__/moonpayUrl.test.js` — ~35 tests
- `src/lib/buy/useBuyEnabled.js` — ship gate + deniability hook (provider-neutral)
- `src/lib/fiatCurrencies.js` — extracted constant to break circular import
- `src/pages/BuyCrypto.jsx` — landing screen (MoonPay provider)
- `src/pages/BuyInProgress.jsx` — neutral post-handoff polling screen
- Entry-point wiring: `App.jsx`, `Layout.jsx`, `Dashboard.jsx`, `CryptoDetailPage.jsx`, `WalletPortfolioPage.jsx`, `EmptyWalletState.jsx`
- Deep-link return: `DeepLinkHandler.jsx`
- Route audit: `featureClassification.js`
- i18n: `src/i18n/locales/en/wallet.json`
- Env / CI: `.env.example`, `.env.staging`, `deploy-preview.yml`

**Out of scope:**
- Transak PRs — left open, not modified
- Capacitor native plugins (`@capacitor/browser` already installed)
- Universal Link AASA / Digital Asset Links — already live; `/buy/return*` already claimed on both stores
- `FiatCurrencySelector.jsx` prop additions — add `triggerClassName` + `showName` props here if PR #1511 hasn't merged

---

## 3. Architecture

```
VITE_BUY_ENABLED=true  ─────────────────────────┐
                                                  │ build-time dead-code-elimination
                                                  ▼
useBuyEnabled() ──── isDeniabilityOrDemoActive() ─► render gates on all 5 entry points
                                                  │
                                                  ▼
BuyCrypto.jsx ──── buildMoonpayUrl() ──── isDeniabilityOrDemoActive() (2nd chokepoint)
                                                  │
                                                  ▼
                        Browser.open() → SFSafariViewController / Chrome Custom Tabs
                                                  │
                        MoonPay hosted widget (separate process, separate cookie jar)
                                                  │
                        Universal Link: https://veyrnox.com/buy/return?tid=…
                                                  │
                        DeepLinkHandler → /buy/in-progress (isBuyEnabled() gated)
                                                  │
                        BuyInProgress.jsx — polls nothing, shows neutral wait screen
                                                  │
                        User checks Dashboard / Receive for on-chain confirmation
```

---

## 4. moonpayUrl.js — URL Builder

### 4.1 Supported asset × network matrix

| Asset | Veyrnox network | MoonPay `currencyCode` | Delivers |
|-------|----------------|------------------------|----------|
| ETH   | ethereum        | `eth`                  | ETH      |
| MATIC | polygon         | `matic_polygon`        | MATIC    |
| ARB   | arbitrum        | `eth_arbitrum`         | ETH †    |
| OP    | optimism        | `eth_optimism`         | ETH †    |
| AVAX  | avaxcchain      | `avax_cchain`          | AVAX     |
| BNB   | bsc             | `bnb_bsc`              | BNB      |
| BTC   | mainnet         | `btc`                  | BTC      |
| SOL   | solana          | `sol`                  | SOL      |
| USDC  | ethereum        | `usdc`                 | USDC     |
| USDC  | polygon         | `usdc_polygon`         | USDC     |
| USDT  | ethereum        | `usdt`                 | USDT     |

† ARB and OP rows deliver ETH (the native gas asset on those networks). The UI renders a `receives_note` disclaimer when `moonpayCode` diverges from the picker's `asset` symbol — same pattern as the Transak branch.

### 4.2 URL parameters

| MoonPay param        | Source                              |
|----------------------|-------------------------------------|
| `apiKey`             | `VITE_MOONPAY_API_KEY`              |
| `currencyCode`       | matrix `moonpayCode` (lowercase)    |
| `walletAddress`      | on-device address, read at press-time |
| `lockWalletAddress`  | `true` (hardcoded)                  |
| `baseCurrencyCode`   | user's fiat preference (lowercase)  |
| `baseCurrencyAmount` | optional pre-filled amount          |
| `redirectURL`        | `https://veyrnox.com/buy/return`    |

### 4.3 Environments

| `VITE_MOONPAY_ENVIRONMENT` | Base URL                           |
|----------------------------|------------------------------------|
| `STAGING`                  | `https://buy-sandbox.moonpay.com/` |
| `PRODUCTION`               | `https://buy.moonpay.com/`         |

Default: `STAGING`.

### 4.4 Error codes (BuyError)

Same codes as Transak builder — call sites are identical:

| Code | Trigger |
|------|---------|
| `BUY_DENIABILITY_BLOCKED` | `isDeniabilityOrDemoActive()` — fired FIRST, before any arg validation |
| `ADDRESS_REQUIRED` | missing or empty address |
| `API_KEY_REQUIRED` | missing or empty apiKey |
| `ENVIRONMENT_INVALID` | unknown environment string |
| `ASSET_UNSUPPORTED` | asset not in matrix |
| `NETWORK_MISMATCH` | asset in matrix but not on requested network |

`BUY_DENIABILITY_BLOCKED` must fire before argument validation so a decoy caller cannot distinguish "blocked" from "bad args".

---

## 5. useBuyEnabled.js

Identical to the Transak branch version. `VITE_BUY_ENABLED` is already provider-neutral; no rename needed.

```js
const SHIP_GATE = import.meta.env.VITE_BUY_ENABLED === 'true';

export function useBuyEnabled() { ... }  // React hook
export function isBuyEnabled() { ... }   // non-React form (DeepLinkHandler)
```

---

## 6. fiatCurrencies.js

Extract `FIAT_CURRENCIES` constant (the 37-currency catalogue with flag emojis) to `src/lib/fiatCurrencies.js` with zero imports, breaking the `locale.js → FiatCurrencySelector.jsx → locale.js` init-time cycle. `FiatCurrencySelector` and `locale.js` both import from this file instead.

---

## 7. Pages

### BuyCrypto.jsx
- All hooks above early returns (rules-of-hooks / mid-session deniability flip safety)
- Render gates: `isDeniabilityOrDemoActive()` → `null`; `!buyEnabled` → unavailable card
- Asset picker: same `CoinLogo` + name + network label pattern as `SendCrypto.jsx`
- Amount input: `.mono-value` class, `aria-describedby`, `role="status"` live-region error
- Provider card: "MoonPay" label + privacy link `https://www.moonpay.com/legal/privacy_policy`
- Disclosure dialog: warns user they are leaving the app before `Browser.open()`
- Address resolved at press-time (not at mount) via `resolveDepositAddress()`

### BuyInProgress.jsx
- Ship gate + deniability gate (both checked at render)
- Polls nothing — no on-chain watcher, no confirmation signal
- Two nav buttons: Dashboard + Receive
- `tid` query param passed through but never displayed

---

## 8. Entry-point wiring (5 surfaces)

All gated on `useBuyEnabled()`:

| Surface | Change |
|---------|--------|
| `EmptyWalletState.jsx` | Rename prop `transakReady` → `buyReady`; show Buy-with-card row when `true` |
| `WalletPortfolioPage.jsx` | Pass `buyReady={useBuyEnabled()}` |
| `Layout.jsx` | Add Buy tab to bottom nav (icon: `CreditCard`) |
| `Dashboard.jsx` | Add Buy to action row |
| `CryptoDetailPage.jsx` | Add Buy button to asset action grid |

---

## 9. DeepLinkHandler

Same logic as PR #1511:
- Detect `hostname === 'veyrnox.com' && pathname === '/buy/return'`
- Gate navigation on `isBuyEnabled()` (ship gate + deniability)
- Navigate to `/buy/in-progress?tid=…`
- Falls through to WalletConnect extractor if URL doesn't match

---

## 10. App.jsx routes

```jsx
{ path: '/buy',             element: <BuyCrypto /> }
{ path: '/buy/in-progress', element: <BuyInProgress /> }
```

Both registered unconditionally. The ship gate lives inside the page components, not in the route definition.

---

## 11. featureClassification.js

Add to `ALL_ROUTE_PATHS`:
- `/buy` — `SHIP_GATED`, buy with card
- `/buy/in-progress` — `SHIP_GATED`, polls nothing, shows neutral wait screen

---

## 12. i18n (en/wallet.json)

New keys under `buy.*` namespace — same key names as Transak branch, MoonPay strings:

```
buy.title, buy.subtitle
buy.amount_label, buy.amount_placeholder
buy.asset_label
buy.continue
buy.receives_note          (ARB/OP ETH-delivery disambiguation)
buy.provider.moonpay, buy.provider.moonpay_description
buy.unavailable.title, buy.unavailable.body
buy.disclosure.title, buy.disclosure.body, buy.disclosure.link_label
buy.disclosure.cancel, buy.disclosure.continue
buy.in_progress.title, buy.in_progress.body, buy.in_progress.hint
buy.error.amount_malformed, buy.error.browser_open_failed
```

English only for now. Non-English locales via the standard translation pipeline.

---

## 13. Environment & CI

### .env.example additions
```
VITE_BUY_ENABLED=false
VITE_MOONPAY_API_KEY=
VITE_MOONPAY_ENVIRONMENT=STAGING
```

### .env.staging additions
```
VITE_BUY_ENABLED=true
```

### deploy-preview.yml
Pass `VITE_MOONPAY_API_KEY` from `vars.VITE_MOONPAY_API_KEY` only when `github.ref != 'refs/heads/main'`. Production builds never receive it.

### Owner action (before staging preview works)
Set GitHub Actions repository variable **`VITE_MOONPAY_API_KEY`** to the staging key (Settings → Secrets and variables → Actions → Variables → New). The key itself goes in `.env.local` only — never committed.

---

## 14. Security invariants

| Invariant | How preserved |
|-----------|--------------|
| **I2** — no silent data egress | MoonPay widget runs in OS browser (separate process, separate cookie jar). Wallet process has no visibility into MoonPay's network traffic. |
| **I3** — deniability | Two chokepoints: `useBuyEnabled()` removes all 5 entry points; `buildMoonpayUrl()` throws `BUY_DENIABILITY_BLOCKED` as its first statement. |
| **I4** — fail honest, fail closed | Missing/invalid API key throws. Missing/invalid environment throws. Offer paths fail closed. |
| **I5** — backend untrusted | Deposit address read from on-device wallet at press-time. `lockWalletAddress=true` locks it inside MoonPay's widget. Confirmation comes from on-chain balance observation, not from the return URL payload. |

---

## 15. Tests

### moonpayUrl.test.js (~35 tests)
1. **Deniability egress gate** — throws `BUY_DENIABILITY_BLOCKED` under decoy session, demo flag, and before arg validation
2. **Argument validation** — `ADDRESS_REQUIRED`, `API_KEY_REQUIRED`, `ENVIRONMENT_INVALID`, `ASSET_UNSUPPORTED`, `NETWORK_MISMATCH`
3. **Per-chain param correctness** — for each of the 11 matrix rows: assert `currencyCode` matches `moonpayCode`, `lockWalletAddress=true`, staging vs production base URL

### BuyCrypto.gates (~7 tests, mutation-checked)
- Ship gate off → unavailable card rendered (not null)
- Deniability active → null rendered
- Hook order preserved across both gate flips

### fiatCurrencies.no-cycle (~3 tests)
- Import succeeds with no circular-dependency error
- Reintroduce cycle → tests red

---

## 16. What comes after staging

Before Buy can ship to production:
- [ ] MoonPay partner agreement signed
- [ ] Production API key issued (`pk_live_…`)
- [ ] `VITE_MOONPAY_ENVIRONMENT=PRODUCTION` set in production build
- [ ] Data Safety + App Privacy declarations updated (on-ramp KYC data disclosure)
- [ ] `veyrnox.com/privacy` updated to disclose MoonPay as data processor
- [ ] Real-money smoke test with txid recorded (verify-don't-assert rule)
