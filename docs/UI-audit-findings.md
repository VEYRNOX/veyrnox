# Veyrnox — UI/UX & Snag Audit (read-only)

> Read-only findings report. **No code was changed.** Scope: `src/pages/` and
> `src/components/` (shadcn primitives under `src/components/ui/` were excluded).
> Cross-referenced against `src/App.jsx` (route registry), `src/lib/navigation.js`
> (nav source of truth) and `docs/Feature-Status.md` (build status). Generated
> 2026-06-04.

## Summary (counts per severity)

| Severity | Count |
|---|---|
| **Critical** (broken / dead / misleading) | 28 |
| **Major** (missing states, a11y gaps, fabricated-data-as-real, dead links) | 58 |
| **Minor** (consistency / polish) | 64 |

**Top themes**
1. **Honesty:** many pages present unbuilt / `📋` / `❌` / `💡` features as working — fabricated balances, fake "scans", simulated connections, "purchase complete" toasts — with no demo/roadmap label. The built pages (`SendCrypto`, `TransactionHistory`, `TokenApprovals`, `TrustScore`, `SpamTokenFilter`, `SecurityDashboard`, `WalletAccessReset`, `TaxReport`, `Subscription`, `WhatIfSimulator`, `HardwareWalletPage`, `Web3Browser`, `Documentation`, `Features`) are notably honest — use them as the template.
2. **Two fake QR generators** (`WalletSeedQR`, `MerchantQR`) draw decorative `Math.sin` patterns, not scannable codes — real fund-loss / payment-failure risk.
3. **Five orphan/unreachable page files** (`Login`, `Register`, `ForgotPassword`, `ResetPassword`, `Onboarding`) plus a dead `SocialAuthButtons` left over from the removed hosted-auth backend.
4. **Pervasive missing error states** on `useQuery`/async data — a failed fetch is usually indistinguishable from "empty".
5. **Recurring a11y gap:** icon-only buttons with no `aria-label`.

---

# CRITICAL — broken, dead, or misleading

## Dead interactions (buttons with no handler)

### src/pages/CloudBackup.jsx
- CRITICAL | CloudBackup.jsx:163-170 | "Decrypt and Restore Wallets" button has no `onClick` — dead control on the restore flow. | Wire it, or disable with a "preview only" label (page is `📋` UI-shell-only).

### src/pages/NFTGallery.jsx
- CRITICAL | NFTGallery.jsx:170 | "List for Sale" button has no `onClick`. | Wire or remove.
- CRITICAL | NFTGallery.jsx:169 | "Share" button has no `onClick`. | Wire or remove.

### src/pages/TaxHarvesting.jsx
- CRITICAL | TaxHarvesting.jsx:73-75 | "Harvest — Sell {currency} at Loss" button has no `onClick` — presented as an actionable trade control. | Disable/relabel (feature is `💡` UI-only).

### src/pages/SolanaTokens.jsx
- CRITICAL | SolanaTokens.jsx:61,159-172 | Send dialog "Send" button + recipient/amount inputs have no handler — fully styled live-looking send that does nothing. | Gate/disable send for SOL (matches `SendCrypto` honesty).
- CRITICAL | SolanaTokens.jsx:62,129,145,154,166 | "Swap via Jupiter", per-protocol "Connect", "Stake More SOL", "Manage mSOL", token-pick buttons all lack `onClick`. | Wire or remove/disable.

### src/pages/TronWallet.jsx
- CRITICAL | TronWallet.jsx:81-82 | Header "Swap" and "Freeze" buttons have no `onClick`. | Wire or disable.
- CRITICAL | TronWallet.jsx:140,165,177,200 | DApp "Open", "Freeze", SR "Vote" and dialog "Send {token}" buttons have no `onClick`. | Wire or disable.

## Misleading honesty (unbuilt/fabricated feature presented as real & working)

### src/pages/SolanaTokens.jsx
- CRITICAL | SolanaTokens.jsx:10-37,49,57,86-87 | Hardcoded fake SOL wallet address, fake SOL+SPL balances, prices, total USD and a live solscan link — a fabricated *funded* wallet, though SOL is `receive_only` per Feature-Status. | Use real derived address + on-chain reads, or label every value "sample/demo".
- CRITICAL | SolanaTokens.jsx:135-156 | Staking tab shows fabricated "Staked 1.5 SOL / Rewards 0.024 SOL / 2.14 mSOL" as real positions. | Label as sample or remove.

### src/pages/TronWallet.jsx
- CRITICAL | TronWallet.jsx:9-35 | Entire TRON wallet shows a fabricated address, TRX balance (4820), six TRC-20 balances, energy/bandwidth gauges and a "$" total as a funded live wallet — but TRON is not a built stack (`💡`). No demo/roadmap label. | Add a prominent "not built / preview" banner, or gate the page.

### src/pages/WalletSeedQR.jsx
- CRITICAL | WalletSeedQR.jsx:10-48 | `SeedQRCanvas` draws a `Math.sin`-hashed decorative pattern, **not a real QR encoder**, yet UI says "scannable QR code… Scan with a wallet app to import" (line 161) and prints it as a seed backup. A user trusting this to restore funds would lose them. | Use a real QR library (e.g. `qrcode`) to encode the seed, or remove the scan/import claims.
- CRITICAL | WalletSeedQR.jsx:58 | Seed sourced from the mock `Wallet` entity list, not the real vault — compounds the fake-QR into a non-functional backup that looks real. | Source from the actual vault + a real encoder.

### src/pages/MerchantQR.jsx
- CRITICAL | MerchantQR.jsx:13-35 | `QRCodeCanvas` draws a decorative sine-wave, **not a scannable QR** — the page's entire purpose (scannable payment QR) is non-functional. | Use a real QR library to encode `getQRData`.

### src/pages/BlockExplorer.jsx
- CRITICAL | BlockExplorer.jsx:11-89 | All tx/address/block data is `Math.random()`-generated (status, balances, gas, miner) and presented as real on-chain lookup ("Veyrnox Block Explorer"). | Label demo/simulated or wire to a real explorer API.

### src/pages/ERC20Discovery.jsx
- CRITICAL | ERC20Discovery.jsx:26-66 | `handleScan` fakes a 2.5s "Scanning blockchain… Querying Transfer events" then returns random tokens with `Math.random()` balances/spam scores — presented as a real on-chain scan. | Label "simulated/demo" or wire a real provider.
- CRITICAL | ERC20Discovery.jsx:68-71,197-201 | "Add"/"Add All" toast "N tokens added to your wallet" but only mutate a local `added` Set — nothing is persisted. | Persist or relabel preview-only.

### src/pages/DAppConnector.jsx
- CRITICAL | DAppConnector.jsx:27-160 | WalletConnect is `📋` POST-AUDIT-only, but the page fakes a 1.5s connect then shows "Session established. The dApp can now request transaction signing from your wallet" with a pulsing "connected" dot + a seeded `MOCK_SESSIONS` Uniswap session. | Add a clear "demo / not yet functional" banner.

### src/pages/WalletConnectPage.jsx
- CRITICAL | WalletConnectPage.jsx:34-57 | Simulated `setTimeout` handshake presents a "WalletConnect v2" Active Session with real-looking permissions/address + success toast; no demo label (`📋` post-audit). | Add an explicit simulated/preview banner.

### src/pages/FraudDetection.jsx
- CRITICAL | FraudDetection.jsx:65-69,100-101 | "Run AI Scan" is a 2s `setTimeout` → "no new threats detected"; title claims "AI Fraud Detection / Real-time monitoring". The built feature is local pre-sign anomaly heuristics, not a live scanner. | Relabel as demo or wire the real anomaly engine.
- CRITICAL | FraudDetection.jsx:33-40,138-144 | "Detection Rules" tab renders hardcoded `MOCK_RULES` (e.g. "Screens against OFAC list", `active:true`) as if running. | Label illustrative or wire up.

### src/pages/CryptoWillPage.jsx
- CRITICAL | CryptoWillPage.jsx:21-141 | Crypto Will is `📋` not built (audit+legal gated), yet the page creates `CryptoWill` entities and states "assets will be automatically transferred to your designated beneficiaries…" (line 54) and "time-locked asset transfers" (line 47) as if the mechanism exists. No roadmap label. | Add a prominent "roadmap — no transfer occurs" banner, or gate the page.

### src/pages/AIAssistant.jsx
- CRITICAL | AIAssistant.jsx:85-135 | Calls `base44.agents.*` (listConversations/createConversation/addMessage/subscribe), but **neither `localClient` nor `demoClient` implements `agents`** → throws/no-ops in every build. Unlike sibling `AIPortfolioAdvisor` it has **no `LLM_AVAILABLE` guard or `LocalBuildNotice`**, so it presents a working AI chat that cannot function (AI is `💡` none-built; `LLM_AVAILABLE` is false in local builds). | Gate behind `LLM_AVAILABLE` + add `LocalBuildNotice`, mirroring AIPortfolioAdvisor.

### src/pages/CarbonTracker.jsx
- CRITICAL | CarbonTracker.jsx:48-53,119,155 | "Buy Offset" / "Buy 1t" create records and toast "Carbon offset purchased!" — presents a real purchase/payment flow that does not exist (no payment rail). | Label tracking-only / demo; no real purchase occurs.

### src/pages/LoginActivityMap.jsx
- CRITICAL | LoginActivityMap.jsx:10-32 | Presents real-looking login/location history (London/Paris/NY/Tokyo + devices, "trusted/suspicious") as genuine account access — feature is `❌` out-of-scope and *conflicts with the deniability stack* per Feature-Status. | Remove the page/route (not just relabel).
- CRITICAL | LoginActivityMap.jsx:25-26 | `Math.random()` jitter applied to coordinates, presenting fabricated geolocation as actual session data. | Remove fabricated geo.

### src/pages/AccountAccess.jsx
- CRITICAL | AccountAccess.jsx:1-177 | Full "shared account access / invite users / roles & permissions" flow (create/approve/revoke, "Invitation sent" toast) operates on local-only data and presents multi-user collaboration that cannot function without the removed backend. | Label demo/non-functional or remove — an invite can't be sent with no backend.

### src/pages/Community.jsx
- CRITICAL | Community.jsx:1-147 | "Share watchlists with the community / discover public picks / follow" (create/follow/delete, follower counts) is presented as a working social layer but is local-only with no backend. | Label demo or remove the public/social semantics.
- CRITICAL | Community.jsx:25 | `myWatchlists = allWatchlists.filter(w => w.created_by_id)` with comment "all are mine for now" — ownership filter is a no-op; every watchlist shows as "mine". | Filter by the current user's id.

## Dead / unreachable code (orphans)

### Orphan auth pages (routes redirect to `/`, components never render)
- CRITICAL | Login.jsx:1-59 | `/login` → `Navigate to "/"`; component is unreachable dead code. | Remove file/route.
- CRITICAL | Register.jsx (whole file) | `/register` → redirect; entire multi-step register flow (OTP, biometric enrol, SocialAuthButtons) is dead. | Remove file/route.
- CRITICAL | ForgotPassword.jsx:1-57 | `/forgot-password` → redirect; unreachable. | Remove file/route.
- CRITICAL | ResetPassword.jsx:8-39 | `/reset-password` → redirect; unreachable. `window.location.href="/login"` (line 21) on success is also a dead path. | Remove file/route.
- CRITICAL | Onboarding.jsx (whole file) | `/onboarding` → redirect; unreachable. Also fabricates a random hex "wallet address" (lines 19-24) on create. | Remove file/route.

### src/components/auth/SocialAuthButtons.jsx
- CRITICAL | SocialAuthButtons.jsx:47 | "Continue with Apple/Google" call `base44.auth.loginWithProvider`, a no-op stub returning a fake demo user (hosted auth removed). Rendered only by the dead Login/Register pages — doubly dead, and would look like working social sign-in. | Remove the component and its usages.

---

# MAJOR — missing UI states, a11y gaps, fabricated data, dead links, broken logic

## Missing error / loading states (async data)
*Pattern: a `useQuery`/await with no error branch — a failed fetch shows the empty state, indistinguishable from "no data". Listed file:line of the query.*

- MAJOR | AIAssistant.jsx:85-136 | `loadConversations`/`send` await with no try/catch; failed call leaves `sending` stuck, error swallowed. | Add try/catch + error toast, reset `sending`.
- MAJOR | AccountAccess.jsx:39 | No loading/error state. | Add skeleton + error fallback.
- MAJOR | AddressBook.jsx:23-26 | No loading/error state. | Add loading + error.
- MAJOR | AdvancedAnalytics.jsx:36 | No loading/empty/error state. | Add all three.
- MAJOR | Analytics.jsx:52-60 | Two queries, no loading/error. | Add page-level loading + error.
- MAJOR | AnomalyDetection.jsx:59-60 | No loading/error (empty/all-clear only). | Add loading + error.
- MAJOR | AssetCorrelationTimeline.jsx:32-35 | No loading/error/empty. | Add states.
- MAJOR | AuditLogPage.jsx:32 | No error state (loading+empty present). | Add error fallback.
- MAJOR | BudgetLimits.jsx:21-22 | No loading/error. | Add states.
- MAJOR | Calculator.jsx:41-46 | Price fetch has loading but **no error state** — failure shows "—" everywhere silently. | Add an error banner.
- MAJOR | CarbonTracker.jsx:31 | No loading/error. | Add states.
- MAJOR | CorrelationMatrix.jsx:39 | No loading/empty/error — failure indistinguishable from "no holdings". | Add loading + error.
- MAJOR | CryptoWillPage.jsx:26 | No loading/error. | Add skeleton + error.
- MAJOR | CustomIndexBuilder.jsx:26 | No loading/error. | Add states.
- MAJOR | Dashboard.jsx:76-90 | No error state on transactions/triggeredAlerts/wallets. | Add error fallbacks.
- MAJOR | FeeAnalytics.jsx:31 | No error state (loading+empty present). | Add error fallback.
- MAJOR | FraudDetection.jsx:49 | No error state. | Add error fallback.
- (MINOR-tier query gaps — many pages miss only the error branch: InvoiceGenerator:26, MerchantQR:44, MultiChainNFT:37, NFTPortfolio:21, NetworkManager:27, NewsSentimentPage:51, NotificationCentre:14-32, PaymentLinks:30, PortfolioRewind:28, PortfolioSnapshots:21, PriceAlerts:45, Products:40, PublicProfiles:16, ReferralTracker:22, RiskScoring:32, SavingsGoals:22, SecurityCenter:38-52, SendCrypto:162 (balance read never surfaces RPC failure), SessionManager:25, SharedPortfolioView:21, SmartAlerts:30, SpamTokenFilter:71, SpendingPatterns:10, SuspiciousAddressChecker:105, TransactionReceipt:16, WatchlistPage:32 — see Minor section.)

## Fabricated / sample data presented as real (unlabeled)
*Display surfaces showing hardcoded or `Math.random` data as live, with no "sample/illustrative" disclaimer.*

- MAJOR | AdvancedAnalytics.jsx:9-33,133 | `MONTHLY_PERFORMANCE`, "Best Month +8.4% / Win Rate 67%", volatility/Sharpe/correlation tables hardcoded, shown as real "performance vs S&P 500". | Label illustrative or derive from real history.
- MAJOR | AssetCorrelationTimeline.jsx:7-21 | `PRICE_SERIES` + `EVENTS` ("Fed Rate Cut", "SEC Approval" with exact % moves) fabricated, shown as real event impact. | Label sample data.
- MAJOR | CorrelationMatrix.jsx:7-15 | Correlation coefficients hardcoded, shown as live ("See how your assets move together"). | Add an illustrative/estimate disclaimer.
- MAJOR | CustomIndexBuilder.jsx:16,60 | Performance % from a hardcoded `PERF` constant, rendered as a live green/red return. | Label sample or wire real prices.
- MAJOR | Dashboard.jsx:160-161 | `change24h`/`changePercent` hardcoded (2.34%), rendered as "▲ 2.34% (24h)" real portfolio change. | Compute from real data or label.
- MAJOR | PLTracking.jsx:16 | `CURRENT_PRICES` hardcoded, used for unrealised P&L + "close at current price" (page is "not core-wired"). | Source live prices or label indicative.
- MAJOR | PortfolioBenchmark.jsx:9-19,84-88 | `genBenchmark()` (Math.sin) fabricates Portfolio/BTC/ETH/S&P500 returns; "🏆 Beating Bitcoin" verdict from fake data. | Real history or "simulated" label.
- MAJOR | PortfolioRewind.jsx:9-16 | `PRICE_HISTORY` multipliers fabricate "what your portfolio was worth N days ago". | Label estimated/illustrative.
- MAJOR | PriceCharts.jsx:14-28 | `generateOHLCV()` (Math.random) fabricates all candlesticks/volume; header %/change derived from it. | Wire a real OHLCV feed or label sample.
- MAJOR | Leaderboard.jsx:6-17,25 | `MOCK_LEADERS` shown as a real leaderboard when DB empty (query also has no loading/error). | Add empty/demo notice (page is `💡` social).
- MAJOR | NFTGallery.jsx:8-15,32 | `DEMO_NFTS` (Bored Ape/CryptoPunk/Azuki + floor prices) shown as a real gallery; `totalValue` always computed from DEMO_NFTS even with real data. | Label demo; compute total from displayed set.
- MAJOR | WatchWallets.jsx:14-26 | When no wallets, injects `MOCK` entries (Vitalik.eth 1580 ETH, BTC whale 12.5 BTC) rendered identically to real ones; the genuine empty state at :56-61 is unreachable. | Label mocks as examples or show the empty state.
- MAJOR | WatchlistPage.jsx:15-22 | `MOCK_PRICES` (static) shown as live prices with up/down arrows + buy/sell triggers. | Indicative-price note or wire the feed.
- MAJOR | WatchlistWidget.jsx:11,66-80 | `MOCK_PRICES` rendered as live quotes with trend arrows + green/red 24h-change; never refreshes. | Wire a real feed or label static + drop the live-looking arrows.
- MAJOR | PortfolioChart.jsx:84-102 | With no transactions the chart fabricates a flat line at `currentBalance` and the badge reads "+$0 (0.00%)" as real performance. | Show a "not enough history" empty state.
- MAJOR | NewsSentimentPage.jsx:20-27,53 | `MOCK_NEWS` (Bloomberg/Reuters bylines) always merged into the feed + sentiment bars; only the AI-refresh is labelled illustrative. | Tag the always-on mock items as sample.
- MAJOR | MultiChainNFT.jsx:50 | On add with no image, assigns a random Unsplash stock photo (`Math.random()`) as the NFT's artwork. | Use a neutral placeholder.
- MAJOR | RiskScoring.jsx:16-22 | `HEDGING` strategies show fabricated "Reduces risk ~X pts" impacts as if actionable; none do anything. | Mark illustrative or link to real actions.
- MAJOR | LandingPage.jsx:97-107 | Fabricated stats: "100K+ Active Users", "$50B+ Assets Secured", "0 Breaches Ever" — dishonest for a pre-audit testnet build. | Remove or label illustrative.
- MAJOR | NetworkManager.jsx:11-19,28,71-73 | `DEFAULTS` include **mainnet** RPCs (ETH/BNB/Polygon/Arbitrum/Optimism/Avalanche) shown switchable with "Connected" status — contradicts the testnet-only/mainnet-gated invariant; Infura URL has no API key so it wouldn't connect anyway. | Restrict to enabled testnets; mark mainnets gated.

## Features shown as working that do nothing
- MAJOR | SmartAlerts.jsx:23,107-167 | Alerts persist `notify_email`/`notify_push` + show "Triggered" counts implying monitoring, but nothing evaluates conditions or sends — alerts never fire. | Label non-functional/manual, or wire evaluation.
- MAJOR | MessengerAlerts.jsx:32-37 | "Send Test Message" only `setTimeout`s then "Test message sent!" — never calls Telegram. | Call the API or relabel as a config check.
- MAJOR | SplitBill.jsx:14-169 | Bills stored with addresses/amounts and "Mark Done", but nothing sends/requests funds — a record-keeper presented as a payment splitter. | Clarify it only tracks (no payments).
- MAJOR | SharedPortfolioView.jsx:45,118-122 | Share link `${origin}?portfolio=<id>` presented as a working public link, but no route/handler renders it — the copied link goes nowhere. | Implement the public view or label non-functional.
- MAJOR | AnomalyDetection.jsx:54-67 | "AI Anomaly Detection / Machine learning analysis" but `scan()` is a fixed 2.2s `setTimeout`; detection is plain heuristics, not ML. | Drop "AI/ML" framing or label as a local heuristic check.
- MAJOR | BiometricAuth.jsx:61-67 | "Test Authentication" is a 1.5s `setTimeout` that always returns success regardless of any real biometric check. | Run a real `navigator.credentials.get`, or label simulated.

## Orphaned / 404 navigation targets
- MAJOR | PublicProfiles.jsx:27 | Link to `/profile/:username` — not a registered route; shared profile link 404s. | Register the route or remove the public link.
- MAJOR | ReferralTracker.jsx:46 | Referral link → `/register?ref=...`, but `/register` redirects to `/` — shared link is dead; also rewards `$` tally is fabricated (`💡` not built). | Point at `/`; label rewards non-functional.
- MAJOR | PaymentLinks.jsx:48,93 | Generated link → `/pay/:link_id`, not a registered route — shared/copied links 404. | Register `/pay/:id` or note links are illustrative.

## Dead links
- MAJOR | LandingPage.jsx:291-292 | Footer "Privacy Policy" / "Terms of Service" use `href="#"`. | Link real legal pages or remove.

## Accessibility — icon-only buttons with no `aria-label`
*Screen readers announce nothing. file:line of the control.*
- MAJOR | CryptoSigning.jsx:144,145,165,169,179,231,263 | Reveal/copy/expand icon buttons, no `aria-label`. | Add labels ("Reveal phrase", "Copy address", …).
- MAJOR | AccountAccess.jsx:95 | Trash delete, no `aria-label`. | `aria-label="Remove access"`.
- MAJOR | AddressBook.jsx:99-108 | Copy/star/trash raw `<button>`s, no `aria-label`. | Add labels.
- MAJOR | MerchantQR.jsx:102-104 | Delete (Trash2), no `aria-label`. | `aria-label="Delete QR code"`.
- MAJOR | SolanaTokens.jsx:163,169 / TronWallet inputs | Send-dialog inputs have `<Label>`s not associated via `htmlFor`/`id`. | Associate labels.
- MAJOR | QRScanner.jsx:68 | Close (X) icon button, no `aria-label`. | `aria-label="Close scanner"`.
- MAJOR | SessionManager.jsx:107 | Per-session revoke (ShieldX), no `aria-label`. | `aria-label="Revoke session"`.
- MAJOR | SharedPortfolioView.jsx:104,109,113 | Copy/revoke/delete icon buttons, no `aria-label`. | Add labels.
- MAJOR | DashboardWidgetSettings.jsx:51,71 | Settings-gear trigger, no `aria-label`. | `aria-label="Customize dashboard"`.
- MAJOR | GasTracker.jsx:181 | Refresh icon (has `title`, no `aria-label`). | `aria-label="Refresh gas fees"`.
- MAJOR | CommandPalette.jsx:54 | Search `<input>` has no label/`aria-label` (placeholder only). | `aria-label="Search features and pages"`.
- (Also: BudgetLimits:95, Calculator:92/144, CarbonTracker:99-101, CryptoWillPage:92, CustomIndexBuilder:72/122, InvoiceGenerator:108, MultiChainNFT:88, NFTPortfolio:108, NetWorthTracker:121, NetworkManager:106, NotificationCentre:144, PublicProfiles:113, ReferralTracker:125, SavingsGoals:137, SplitBill:107/133/140, StealthWallets:115/146/150/591, SuspiciousAddressChecker:143, VoiceCommands:79-82, WalletConnectPage:99, DuressPin:305 — same fix.)

## Other broken logic
- MAJOR | LandingPage.jsx:18-20 | `window.addEventListener("scroll", …)` registered in the render body with no cleanup — leaks a listener every render. | Move to `useEffect` with cleanup.
- MAJOR | DAppSecurityAlerts.jsx:93 | "Do Not Connect to This Site" is styled as a `destructive` button but has no `onClick` — reads as a dead action. | Make it non-interactive text/alert.

---

# MINOR — consistency & polish

## Design-system consistency (raw element instead of canonical primitive)
- MINOR | AIAssistant.jsx:221-230 | Raw `<textarea>` → use `Textarea`. Conversation rows/suggested prompts (173-199) raw `<button>` → `SafeButton`.
- MINOR | AIPortfolioAdvisor.jsx:86 | Suggested-prompt raw `<button>` → `SafeButton`.
- MINOR | AIRebalancer.jsx:43,59 | Strategy cards raw `<button>`, no focus ring → `SafeButton`.
- MINOR | ConnectWallet.jsx:203-235 | Provider rows raw `<button>` (file imports `Button`) → `Button variant="ghost"`.
- MINOR | CryptoSigning.jsx:200,224 | Raw `<textarea>` → `Textarea`.
- MINOR | Dashboard.jsx:296-301 | Tx search raw `<input>` → `Input` + `aria-label`.
- MINOR | HDWalletManager.jsx:251,365-372,456 | Tab nav + copy/eye + mnemonic raw `<button>`/`<textarea>` → primitives.
- MINOR | CryptoWillPage.jsx:135 | "Personal Message" single-line `Input` → `Textarea`.
- MINOR | PublicProfiles.jsx:59 | Raw `<textarea>` → `Textarea`.
- MINOR | SecurityScanner.jsx:112-126 | Calldata raw `<textarea>` + unassociated `<label>` → `Textarea` + `htmlFor`.
- MINOR | StealthWallets.jsx:311 / WalletAccessReset.jsx:328-335 | Recovery-phrase raw `<textarea>` + unassociated `<Label>` → primitive + `htmlFor`.
- MINOR | Settings.jsx:219,239,245 | Danger-zone raw `<button>`/`<input>` → primitives.
- MINOR | ReferralTracker.jsx:72,119-125 / Leaderboard.jsx:48,51 / NFTGallery.jsx:50-51 / NotificationCentre.jsx:108-117 / BlockExplorer.jsx:199 / AnomalyDetection.jsx:80 / Community.jsx:129-131 / AssetCorrelationTimeline.jsx:59-64 / Web3Browser tabs / DAppConnector.jsx:71 | Tab/filter/chip raw `<button>`s → `Button`/`SafeButton`.

## Labels not associated with inputs (`htmlFor`/`id`)
- MINOR | Calculator.jsx:106,156 / DAppConnector.jsx:107 / MessengerAlerts.jsx:87 / Products.jsx (multiple) / ResetPassword.jsx:32-33 / Login.jsx:41-42 / SendCrypto.jsx:785 (OTP raw `<input>`) / CloudBackup.jsx:125 | `<Label>`/`<label>` not linked to their input. | Add `htmlFor`/`id` (or use `SafeInput`).

## Ad-hoc colors instead of theme tokens
- MINOR | AIRebalancer.jsx:101-169 / AccountAccess.jsx:13-15 / AuditLogPage.jsx:17-19 / Analytics.jsx:13,193-261 / OnChainAnalytics.jsx:119-171 / CorrelationMatrix.jsx:21-108 / Web3Browser.jsx:6-19 / TronWallet.jsx:42-109 / AdvancedAnalytics.jsx:127-150 (`#EF4444` duplicates `destructive`) | Hardcoded `text-green-*`/`bg-red-*`/hex instead of `text-destructive`/`text-muted-foreground`/`bg-primary` etc. | Use theme tokens (asset-brand colors OK).

## Static USD/FX rates duplicated and shown as live `$`
- MINOR | AssetDistributionChart.jsx:3 / PortfolioChart.jsx:8 / TokenList.jsx:8 / NetWorthTracker.jsx:14 / BudgetLimits.jsx:14 / PortfolioRiskScore.jsx:6 / PortfolioSnapshots.jsx:13 / TransactionReceipt.jsx:8 / FiatCurrencySelector.jsx:6-9 / AIPortfolioAdvisor.jsx:10 | Hardcoded `USD_RATES`/FX rendered as real conversions; duplicated across files. | Centralize via `lib/cryptos` and label indicative.

## Stale "SafeCrypto Wallet" branding (app is Veyrnox)
- MINOR | PasskeySetup.jsx:33 | WebAuthn `rp.name: "SafeCrypto Wallet"` — **user-visible in the OS passkey sheet**. | Change to "Veyrnox".
- MINOR | ExportTransactions.jsx:100 | PDF footer "SafeCrypto Wallet — Confidential". | Change to "Veyrnox".
- MINOR | TaxReport.jsx:286,362 | Generated PDF branded "SafeCrypto Wallet". | Change to "Veyrnox".

## Event-handler / lifecycle hygiene
- MINOR | Layout.jsx:105-107 | Global `⌘K` assigns `window.onkeydown` on every render (clobbers other handlers, no cleanup). | Move to `useEffect` with add/removeEventListener.
- MINOR | TransactionReceipt.jsx:29-30 / WalletSeedQR.jsx:61-62 | `window.open(...)` return not null-checked before `.document` — throws if popup-blocked. | Guard `if (!win)`.
- MINOR | Onboarding.jsx:33-39 / PLTracking.jsx:30-59 / PaymentLinks.jsx:32-45 / PortfolioSnapshots.jsx:33-55 / PriceAlerts.jsx:57-75 / Products.jsx:45-58 / RecurringPayments.jsx:37-54 / CarbonTracker.jsx:48-52 | Mutations have no `onError` — failed save/delete silently does nothing. | Add `onError` toasts.

## Scope / copy drift
- MINOR | LandingPage.jsx:173-178 | Advertises "Instant Swaps / Staking" (`❌` out-of-scope-regulated) and "Hardware Wallet integration" (`📋` shell only) as live features. | Remove/soften to roadmap.
- MINOR | TransactionFilters.jsx:12 | `TYPES` includes `swap`/`stake` — removed/out-of-scope tx types the wallet never produces. | Drop `swap`/`stake`.
- MINOR | PushNotificationsPage.jsx:119 | Claims "Notifications appear even when Veyrnox is in the background" — uses local `Notification` API only (no service worker); overstated (PriceAlerts:167 has the honest caveat). | Align with the "only while app is open" caveat.
- MINOR | MessengerAlerts.jsx:81-92 | WhatsApp copy implies Twilio/WhatsApp Business sending works ("Configure your API key… to activate") — no such integration. | Clarify not yet wired.
- MINOR | AccountHeader.jsx:138 | "FIDO2 Secured" badge overstates (passkey is an app-layer unlock factor, not custody). | Soften to "Passkey enabled / FIDO2 unlock".
- MINOR | PortfolioHealthScore.jsx:33-57 | "Score" is a crude heuristic (Security = flat 30 if any wallet exists) presented as a meaningful security assessment. | Tie to real signals (passkey/biometric/backup) or label indicative.
- MINOR | BlockExplorer.jsx:121 | Hint claims "ENS name" search but `handleSearch` has no ENS branch. | Remove the hint or implement it.
- MINOR | NFTGallery.jsx:131 | Detail link hardcodes OpenSea `/assets/ethereum/${token_id}` even for Solana NFTs. | Route by chain.
- MINOR | Analytics.jsx:79-125 | "Net PnL" derived from send/receive flows (not cost-basis) but labeled PnL. | Rename "Net flow" or clarify.
- MINOR | Register.jsx:133,176 | `mobile` field collected but never sent; "Resend code" is fire-and-forget with no feedback (moot while orphaned). | n/a if removed.

## Component-specific minor
- MINOR | CoinLogo.jsx:30 | `alt={sym}` is just the ticker. | `alt={`${sym} logo`}`.
- MINOR | CryptoNewsFeed.jsx:11-17 | `fetchCryptoNews` has no error UI — failed fetch shows empty "No news available". | Add an `isError` branch with retry.
- MINOR | WalletCard.jsx:3-9 | `currencyIcons`/`currencyColors` cover only 5 symbols; others fall back to "●". | Reuse `CoinLogo`.
- MINOR | WhitelistManager.jsx:14-20 | Local regex validates only BTC/ETH/SOL/USDC/USDT; BNB/XRP/DOGE/ADA/TRX pass anything. | Reuse `lib/addressValidation.js`.
- MINOR | LandingPage.jsx:40-57,257 | "Login"/"Get Started"/"Launch App" CTAs `navigate("/login")`/`("/register")` — these route through redirect aliases to `/` (works, but indirect). | Point directly at `/`.
- MINOR | AnomalyDetection.jsx:24-30 | Comment says "10 minutes (simulated)" but logic checks 60 min — stale comment. | Fix the comment.
- MINOR | PriceCharts.jsx:73 | `useMemo` deps omit referenced `asset` (lint correctness; stable, no runtime bug). | Add `asset` to deps.
- MINOR | Leaderboard.jsx:37 | Podium maps `allTraders[0..2]` without guarding < 3 entries. | Guard for fewer than 3.
- MINOR | PublicProfiles.jsx:26 | `editForm` from `currentForm` at mount can hold stale defaults if `profile` loads later. | Reset on entering edit.
- MINOR | CustomDashboardWidgets.jsx:89 | Drag-handle interactive div has no `aria-label`/focus state. | Add `aria-label="Drag to reorder"`.
- MINOR | InvoiceGenerator.jsx:180 | Preview dialog hardcodes `bg-white text-gray-900` (intentional for print, breaks dark canon). | Acceptable if deliberate.

---

## Verified clean / honest (for reference — used as the template)
`SendCrypto` (gated assets hard-blocked, testnet reality shown), `TransactionHistory`, `TokenApprovals`, `TrustScore`, `SpamTokenFilter`, `SecurityDashboard` (never claims "safe"), `SecurityCenter`*, `WalletAccessReset`, `TaxReport`* (FIFO + "simulated prices" banner), `Subscription` (upgrade intentionally disabled with honest copy), `WhatIfSimulator` ("educational only"), `HardwareWalletPage` ("Planned — not yet available"), `Web3Browser` (opens real URLs, no fake in-app render), `Documentation`, `Features`, `GasFeeControl`, `ReceiveCrypto`, `PanicWipe`, `DuressPin` (live-vs-demo clearly labelled), `StealthWallets` ("Provisional (testnet)"), `RecurringPayments` (auto-debit gutted; hands off to `/send`), `LiveBalances`, `FeeSelector`, `QRCodeDisplay`, `TransactionPreview`, `TransactionSimulationDemo`/`BiometricPrompt`/`PasskeyPrompt` (explicit "demo" badges), `VeyrnoxLogo`, `WalletEntry`. (*minor gaps noted above.)

**Note (correction to a scope assumption):** `WalletPortfolioPage.jsx` is **not** an orphan — it is rendered by `Dashboard.jsx` in the non-demo/native build path, reached via `/`. No dedicated route is needed.
