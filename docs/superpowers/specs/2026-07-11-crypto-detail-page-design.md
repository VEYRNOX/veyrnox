# Crypto Detail Page — Design Spec
**Date:** 2026-07-11  
**Branch:** claude/crypto-detail-page  

---

## Goal

Tapping any crypto on the home dashboard navigates to a per-asset detail page that shows:
- The full candlestick price chart (1H / 4H / 1D / 1W / 1M)
- The user's own balance for that asset
- Send and Receive buttons that deep-link directly into the existing flows with the asset pre-selected

---

## Architecture

### New page: `src/pages/CryptoDetailPage.jsx`

Route: `/asset/:symbol` (e.g. `/asset/ETH`, `/asset/BTC`)

**Layout (top → bottom):**
1. **Back button** — `← Back` using `useNavigate(-1)` or `navigate('/')`
2. **Header row** — `CoinLogo` + coin name + symbol + current price + 24h change chip (same `ChangeChip` pattern as `TokenList`)
3. **User balance strip** — amount held + USD value, sourced from `useWallet()` / `usePortfolio()`. Shows `—` on read failure (I4 fail-honest). Hidden if no vault (explore mode).
4. **Period tab bar** — `1H | 4H | 1D | 1W | 1M` (reuse `PERIODS` / `PERIOD_PARAMS` from `PriceCharts.jsx`)
5. **Candlestick chart** — full `ComposedChart` with `CandlestickBar`, `CustomTooltip`, `CartesianGrid`, `XAxis`, `YAxis`, `ReferenceLine` — extracted from `PriceCharts.jsx` as a shared `<CandlestickChart symbol={symbol} period={period} />` component at `src/components/CandlestickChart.jsx`
6. **Action row** — two full-width buttons: **Send** → `navigate('/send?asset=ETH')` and **Receive** → `navigate('/receive?asset=ETH')`

### New shared component: `src/components/CandlestickChart.jsx`

Extracted from `PriceCharts.jsx`. Props: `{ symbol, period }`. Fetches OHLCV via `fetchOHLCVCG`. Renders the chart or a loading/error state. `PriceCharts.jsx` is updated to import and use this component rather than duplicating the rendering logic.

### Changes to existing files

**`src/App.jsx`**  
Add lazy import and route:
```jsx
const CryptoDetailPage = lazy(() => import('./pages/CryptoDetailPage'));
// inside <Routes>:
<Route path="/asset/:symbol" element={<CryptoDetailPage />} />
```

**`src/pages/WalletPortfolioPage.jsx`**  
The asset rows in the real (non-demo) dashboard are currently plain `<div>` / `<button>` elements. Wrap each with `onClick={() => navigate(`/asset/${asset.symbol}`)}`. The existing `onSelect` internal state still fires for demo mode; the navigation fires for the real vault build.

**`src/components/TokenList.jsx`** (demo path)  
Add a secondary `onNavigate` prop (or use `useNavigate` internally). Each row navigates to `/asset/${wallet.currency}` on click instead of (or in addition to) calling `onSelect`.

**`src/pages/SendCrypto.jsx`**  
```js
const [searchParams] = useSearchParams();
const initialAsset = searchParams.get('asset'); // e.g. "ETH"
const [assetSymbol, setAssetSymbol] = useState(initialAsset || "");
```
The existing `defaultAssetSymbol` clamping effect already normalises on wallet change — it should respect a non-empty initial value and only clamp when the asset isn't in the wallet's enabled list.

**`src/pages/ReceiveCrypto.jsx`**  
Same pattern — read `?asset=` from `useSearchParams()` and use it as the initial selected asset/currency.

---

## Data flow

```
Dashboard asset row (tap)
  └─ navigate('/asset/ETH')
       └─ CryptoDetailPage
            ├─ useParams() → symbol = "ETH"
            ├─ useWallet() → balance for ETH
            ├─ CandlestickChart (symbol, period) → fetchOHLCVCG
            ├─ Send button → navigate('/send?asset=ETH')
            │    └─ SendCrypto useSearchParams() → assetSymbol = "ETH"
            └─ Receive button → navigate('/receive?asset=ETH')
                 └─ ReceiveCrypto useSearchParams() → selected asset = "ETH"
```

---

## Error / edge cases

- **Unknown symbol** (`/asset/UNKNOWN`): show a "Asset not found" message with a back button. Do not crash.
- **Balance read failure**: show `—` (I4 fail-honest), never `0`.
- **No vault (explore mode)**: hide the balance strip entirely; Send/Receive buttons still work (they will gate at their own screens).
- **Chart fetch failure**: show a "Chart unavailable" placeholder, not a broken layout.
- **Live prices disabled**: show the last known price or `—`; don't suppress the chart (it has its own loading state).

---

## Design system notes

- Use `bg-card` / `border-border` surface for the chart container
- Teal accent (`text-[#4ADAC2]`) for the 24h up chip; `text-destructive` for down
- IBM Plex Mono (`mono-value` class) for the price and balance figures
- `CoinLogo` component for the asset icon (already used throughout)
- Back button uses `BackButton` component (`src/components/BackButton.jsx`) if it exists, otherwise a plain button with `ChevronLeft` icon

---

## Testing

- Unit test: `CryptoDetailPage` renders the coin name and action buttons for a known symbol
- Unit test: `CryptoDetailPage` renders "Asset not found" for an unknown symbol
- Unit test: `SendCrypto` initialises `assetSymbol` from `?asset=` query param
- Unit test: `ReceiveCrypto` initialises selected asset from `?asset=` query param
- No new e2e required for this feature (the existing send/receive e2e specs cover the downstream flows)
