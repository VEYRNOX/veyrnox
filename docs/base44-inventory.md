# Base44 Inventory & Removal Recon (REPORT ONLY)

> **Scope of this document.** A complete map of every `base44` reference in the
> app and repo, what each is used for, and a *proposed* phased removal plan.
> **This is reconnaissance for a removal decision — nothing here has been
> removed or changed.** No code outside this file was touched. Do not treat the
> phased plan as approved or executed.
>
> Generated on branch `docs/base44-inventory` (off `main`). Docs-only.

---

## TL;DR (the four headline answers)

1. **Is the real self-custody wallet independent of Base44?**
   **YES — completely.** `src/wallet-core/**` (HD derivation, vault, keystore,
   signing, BTC/SOL/EVM keys) and `src/lib/WalletProvider.jsx` have **zero**
   Base44 dependencies. The only match in `wallet-core` is a single explanatory
   *comment* in `evm/anomaly.js:17`. Keys are derived and stored on-device;
   signing and broadcast go through `wallet-core` providers + direct RPC, never
   through Base44. **Confirmed, not assumed.**

2. **What is Base44 actually?**
   **Both a hosted backend SDK and a local demo stub.**
   - In **real mode**, `@base44/sdk` is a hosted backend the app calls at
     runtime: entity CRUD store, hosted auth/sessions, Deno serverless
     functions, and integrations (LLM, email). It **phones home**.
   - In **demo mode** (`?demo=1`, `VITE_DEMO_MODE=1`, or native dev build),
     `src/api/demoClient.js` replaces the SDK with a fully client-side mock that
     **makes no network calls and touches no keys**. The whole app already runs
     offline against this mock.

3. **What is load-bearing vs cosmetic?**
   - **Cosmetic (trivially removable):** README branding, `package.json` name
     `base44-app`, `base44_*` localStorage key prefixes, `base44/` builder
     config files, the Vite legacy-import plugin, the `anomaly.js` comment, and
     regenerated mobile/dist bundles.
   - **Load-bearing (needs a replacement):** the `base44Client` singleton that
     **89 files** import, the hosted **auth** flow (`AuthContext` + login/
     register/OTP/social), and the genuine backend **functions/integrations**
     (`rpcProxy` live balances, price-alert check, PDF generation, `InvokeLLM`,
     `SendEmail`). The wallet's keys/signing/custody are **not** in this set.

4. **What breaks on removal (without a replacement)?**
   Everything that *displays or persists app data* and everything behind hosted
   auth: balances list, transaction history, watchlists, alerts, approvals,
   address book, all the analytics/portfolio pages, login/register/session, the
   AI pages, live-balance lookup, price-alert checks, PDF export, and email
   notifications. **The actual wallet — unlock, key custody, on-chain
   send/receive/sign — keeps working.** Note: the app *already* runs all of the
   above with **no Base44 backend** in demo mode, because `demoClient.js`
   implements the entire surface locally. That mock is the seed of the
   local-first replacement.

---

## 1. Reference map — every file, grouped by role

`base44` appears in **two senses**: the runtime SDK/data layer the app calls,
and the `base44/` builder folder (schemas + serverless backend). Both are mapped.

### 1a. The client singleton (the chokepoint)

| File | Role |
|---|---|
| `src/api/base44Client.js` | Creates the SDK client (`@base44/sdk` `createClient`) and exports `base44`. **In demo mode it exports `demoBase44` instead.** Every data-layer import in the app flows through this one module. |
| `src/api/demoClient.js` | Fully client-side mock of the *entire* Base44 surface — `entities.*` CRUD (seeded + mutable in-memory store), `auth.*`, `functions.invoke`, `integrations.Core`. 215 lines. "Nothing here touches real keys or the network." |
| `src/lib/app-params.js` | Reads `VITE_BASE44_APP_ID` / `_APP_BASE_URL` / `_FUNCTIONS_VERSION`, `?access_token`, and persists them under `base44_*` localStorage keys. Feeds the real client config. |

> **Architectural keystone:** `base44Client.js` is a single swap point —
> `export const base44 = DEMO ? demoBase44 : realClient()`. All 89 consumers
> import `{ base44 }` from here. Replacing the implementation behind this export
> changes the whole app without touching the 89 call sites.

### 1b. Auth layer

| File | Role |
|---|---|
| `src/lib/AuthContext.jsx` | The hosted-auth provider. Imports `base44`, `appParams`, and `@base44/sdk/dist/utils/axios-client` (`createAxiosClient`). Calls `/api/apps/public/...` for public settings, `base44.auth.me()` for session, `base44.auth.logout()`, `redirectToLogin()`. **Short-circuited entirely in demo mode** (`if (DEMO) return`). |
| `src/components/ProtectedRoute.jsx` | Consumes `useAuth()` to gate routes. |
| `src/App.jsx` | Wraps app in `AuthProvider`, consumes `useAuth()` for loading/error states. |
| `src/pages/Login.jsx` | `base44.auth.loginViaEmailPassword`. |
| `src/pages/Register.jsx` | `base44.auth.register`, `verifyOtp`, `setToken`, `resendOtp`. |
| `src/components/auth/SocialAuthButtons.jsx` | `base44.auth.loginWithProvider`. |
| `src/pages/ForgotPassword.jsx`, `src/pages/ResetPassword.jsx` | `base44.auth.resetPassword` / `resetPasswordRequest`. |
| `src/components/Layout.jsx` | `base44.auth.logout()` on the sign-out buttons. |

### 1c. Backend functions & integrations (genuine server calls)

| Call site | Function/integration | Purpose |
|---|---|---|
| `src/pages/LiveBalances.jsx` (×3) | `functions.invoke("rpcProxy", …)` | Live balance / gas / token lookup via a server-side RPC proxy. |
| `src/pages/PriceAlerts.jsx` | `functions.invoke("checkPriceAlerts")` | Server price check. |
| `src/pages/Documentation.jsx` (×2), `src/pages/Features.jsx` | `functions.invoke("generate…PDF" / "generateArchitectureDocuments")` | Server-side PDF/DOCX generation. |
| `src/pages/AIPortfolioAdvisor.jsx`, `src/pages/AIRebalancer.jsx`, `src/pages/NewsSentimentPage.jsx` | `integrations.Core.InvokeLLM` | LLM completions for the AI pages. |
| `src/components/security/MFADialog.jsx`, `src/pages/SendCrypto.jsx` | `integrations.Core.SendEmail` | Email notifications (MFA code, send receipt). |

### 1d. Entity data layer — the 89 consumers

Every page/component below imports `{ base44 }` and calls
`base44.entities.<Name>.list/filter/get/create/update/delete`. This is the app's
**data/metadata store** — display state and per-user app records, **not** key
material.

- **Pages (77):** AIAssistant, AIPortfolioAdvisor, AIRebalancer, AccountAccess,
  AddressBook, AdvancedAnalytics, Analytics, AnomalyDetection,
  AssetCorrelationTimeline, AuditLogPage, BudgetLimits, CarbonTracker,
  CloudBackup, Community, ConnectWallet, CorrelationMatrix, CryptoWillPage,
  CustomIndexBuilder, Dashboard, Documentation, ERC20Discovery, Features,
  FeeAnalytics, ForgotPassword, FraudDetection, HDWalletManager,
  HardwareWalletPage, InvoiceGenerator, Leaderboard, LiveBalances, Login,
  LoginActivityMap, MerchantQR, MultiChainNFT, NFTGallery, NFTPortfolio,
  NetWorthTracker, NetworkManager, NewsSentimentPage, NotificationCentre,
  OnChainAnalytics, Onboarding, PLTracking, PaymentLinks, PortfolioBenchmark,
  PortfolioRewind, PortfolioRiskScore, PortfolioSnapshots, PriceAlerts,
  Products, PublicProfiles, RecurringPayments, ReferralTracker, Register,
  ResetPassword, RiskScoring, SavingsGoals, SecurityCenter, SecurityDashboard,
  SendCrypto, SessionManager, Settings, SharedPortfolioView, SmartAlerts,
  SpamTokenFilter, SpendingPatterns, SplitBill, StealthWallets,
  SuspiciousAddressChecker, TaxHarvesting, TaxReport, TokenApprovals,
  TransactionReceipt, WalletConnectPage, WalletSeedQR, WatchWallets,
  WatchlistPage.
- **Components (8):** ExportTransactions, Layout, SessionRevocationGuard,
  WatchlistWidget, auth/SocialAuthButtons, security/MFADialog,
  security/SessionSettings, security/WhitelistManager.
- **Hooks (2):** `useAuditLog.js`, `usePriceAlertNotifier.js`.
- **Lib (2):** `txLimits.js` (reads `Transaction` for daily-limit running
  total), `AuthContext.jsx`. (`securityPosture.js`, `sessionRevocation.js`,
  `PageNotFound.jsx` reference Base44 via comments/indirect use.)

**Entities actually referenced (39 distinct), by call volume:**
Wallet (39), Transaction (18), UserSession (11), PriceAlert (10), NFTAsset (8),
PersonalWatchlist (7), PaymentLink (7), FraudAlert (6), AddressBook (6),
TransactionLimit (5), SmartAlert (5), ReferralRecord (5), PLRecord (5),
HardwareWallet (5), WhitelistedAddress (4), TokenApproval (4), SplitBill (4),
SharedWatchlist (4), SavingsGoal (4), RecurringPayment (4), Product (4),
PortfolioShare (4), NetworkConfig (4), Invoice (4), BudgetLimit (4),
AccountAccess (4), StakingPosition (3), PublicProfile (3), PortfolioSnapshot (3),
NewsSentiment (3), NetWorthAsset (3), CustomIndex (3), CryptoWill (3),
CarbonOffset (3), WalletToken (2), AuditLog (2), SocialTrader (1), RASPEvent (1),
LendingPosition (1), CryptoLoan (1).

### 1e. Entity SCHEMAS — `base44/entities/*.jsonc` (60 files)

Declarative schemas for the Base44 hosted datastore. **60 files**:
AccountAccess, AddressBook, AuditLog, AutomationRule, BankAccount,
BridgeTransaction, BudgetLimit, CarbonOffset, ConditionalSwap, CryptoLoan,
CryptoPayroll, CryptoSubscription, CryptoWill, CustomIndex, DAOProposal,
DCASchedule, DecentralizedIdentity, EncryptedMessage, ExchangeConnection,
FiatBalance, FraudAlert, GeoBlock, HardwareWallet, Invoice, KYCProfile,
LendingPosition, NFTAsset, NetWorthAsset, NetworkConfig, NewsSentiment,
OptionsPosition, PLRecord, PaymentLink, PersonalWatchlist, PortfolioShare,
PortfolioSnapshot, PriceAlert, Product, PublicProfile, RASPEvent,
RebalancingConfig, RecurringPayment, ReferralRecord, SavingsGoal,
SharedWatchlist, SmartAlert, SocialTrader, SplitBill, StakingPosition,
StakingStrategy, TokenApproval, Transaction, TransactionLimit, UserSession,
Wallet, WebhookConfig, WhitelistedAddress, YieldFarmPosition.
(More schemas exist than entities the app reads — many are legacy/unused by
current pages.)

### 1f. Backend serverless functions — `base44/functions/*/entry.ts` (9)

Deno (`Deno.serve`) functions importing `npm:@base44/sdk@0.8.25`
(`createClientFromRequest`). These run on Base44's backend, not in the app:
- `rpcProxy` — proxies Ethereum RPC (ankr) + token lookups (ethplorer). **Called
  by LiveBalances.**
- `checkPriceAlerts` — fetches CryptoCompare prices. **Called by PriceAlerts.**
- `generateDocumentationPDF`, `generateArchitectureDocuments`,
  `generateArchitecturePDF` — server-side jsPDF/docx generation. **Called by
  Documentation/Features.**
- `executeDCA`, `rebalancingMonitor`, `fetchExchangeBalances`, `rateLimiter` —
  **not invoked by any current page** (legacy/orphaned backend).

### 1g. Builder config & branding (cosmetic)

| File / location | Reference |
|---|---|
| `base44/.app.jsonc` | `{ "id": "6a16108352624b0bcb254538" }` — Base44 app id. |
| `base44/config.jsonc` | Build/serve commands; `"name": "untitled"`. |
| `base44/agents/assistant.jsonc`, `base44/connectors/googledrive.jsonc` | Builder agent/connector config. |
| `package.json:2` | `"name": "base44-app"` + deps `@base44/sdk`, `@base44/vite-plugin`. |
| `vite.config.js:1,35-38` | `@base44/vite-plugin` (legacy SDK import shim, `legacySDKImports`). |
| `README.md` | Base44 branding/links throughout ("Welcome to your Base44 project", Base44.com, docs). |
| `app-params.js` | `base44_*` localStorage key prefixes. |
| `src/wallet-core/evm/anomaly.js:17` | Explanatory **comment** mentioning "base44 Transaction entities" — no code dependency. |
| Docs (`docs/*.md`) | Mentions in Hosting.migration (12), MOCK_AUDIT (19), SendCrypto.integration (5), VALIDATION_UX_FINDINGS (3), MVP.roadmap (2), PhaseA.eth-core (2), Audit.scope, CLAUDE_CODE_TASK, MobileSetup, Security.roadmap (1 each). |
| Build artifacts | `android/.../index-DBZaOGq7.js`, `ios/.../index-DBZaOGq7.js`, `dist/assets/index-DBZaOGq7.js` — each bundle contains base44 (1 occ.); **regenerated on every build**, not source. |

---

## 2. Categorization summary

| Category | What | Files | Removability |
|---|---|---|---|
| **(a) Demo/backend DATA layer** | `base44.entities.*` CRUD for Wallet/Transaction/all app records; the client singleton; the demo mock | `base44Client.js`, `demoClient.js`, 89 consumers | **Load-bearing** (but already mocked locally by `demoClient`) |
| **(b) AUTH** | hosted login/register/OTP/social/session/logout; `AuthContext`; `@base44/sdk` axios client | `AuthContext.jsx`, `App.jsx`, `ProtectedRoute.jsx`, Login/Register/Forgot/Reset, `SocialAuthButtons`, `Layout` | **Load-bearing** (but parallel on-device unlock already exists) |
| **(c) UI BRANDING** | "base44" names, README, package name, builder config | README, `package.json`, `base44/*.jsonc`, `app-params` key prefixes, anomaly comment | **Cosmetic** |
| **(d) Entity SCHEMAS** | `base44/entities/*.jsonc` | 60 files | **Cosmetic to the running app** (only the hosted datastore reads them) |
| **(e) Else — backend fns + integrations** | Deno functions; `functions.invoke`; `integrations.Core` (LLM, Email) | 9 `base44/functions/*`, ~12 call sites | **Mixed** — 5 functions live-used, 4 orphaned; integrations need real providers or removal |

---

## 3. Critical determinations

### 3.1 Does the real self-custody wallet depend on Base44? — NO (confirmed)
`grep -rin base44 src/wallet-core` returns exactly **one line**: a comment in
`evm/anomaly.js:17`. `WalletProvider.jsx`, `keystore/*`, `vault.js`,
`signing.js`, `derivation.js` — **zero** matches. `SendCrypto.jsx` proves the
boundary: keys/signing come from `useWallet()` + `wallet-core/evm/send`
(`signAndBroadcast`); Base44 is used there only to *read* the Wallet/limit/
history records for display and to *record* a Transaction row + send an email
after the on-chain send already happened. **Removing Base44 cannot affect key
custody, signing, or on-chain send/receive.**

### 3.2 What is Base44 — SDK, stub, or both? Does it phone home?
**Both.** Real mode = hosted backend SDK that makes network calls (entity CRUD,
auth, Deno functions, LLM/email). Demo mode = `demoClient.js`, a complete local
mock that makes **no** network calls and touches **no** keys. The selector is
`DEMO` in `demoClient.js` (`?demo=1` / `VITE_DEMO_MODE=1` / native dev). So
"does it phone home" depends entirely on mode — and the app is **already proven
to run fully without the backend** in demo mode.

### 3.3 What breaks if Base44 is removed (no replacement)?
- **Breaks:** all entity-backed display/persistence (balances list, tx history,
  watchlists, alerts, approvals, address book, analytics/portfolio/NFT/tax/
  social pages — ~77 pages); hosted auth (login/register/OTP/social/session);
  `LiveBalances` RPC proxy; `PriceAlerts` server check; PDF export
  (Documentation/Features); AI pages (`InvokeLLM`); email notifications.
- **Does NOT break:** wallet unlock, HD derivation, vault/keystore, signing,
  BTC/SOL/EVM send/receive, fee selection, simulation, poison/spam/approval
  *logic* (the detection lives in `wallet-core`; only the *records* it reads are
  Base44-backed), duress/stealth/panic — all on-device.

### 3.4 Trivially removable vs load-bearing
- **Trivially removable (cosmetic, no runtime effect):** README, `package.json`
  name, `base44_*` key prefixes, `base44/` builder config, the Vite legacy
  plugin (once SDK imports are gone), the anomaly comment, build artifacts.
- **Load-bearing (app stops without a replacement):** `base44Client` +
  `demoClient` data layer (89 consumers), `AuthContext` auth, and the
  live-used backend functions/integrations (`rpcProxy`, `checkPriceAlerts`,
  PDF gen, `InvokeLLM`, `SendEmail`).

> **The single most useful fact for removal:** `demoClient.js` already
> reimplements the *entire* Base44 surface locally. The migration is therefore
> mostly "promote the demo mock to a real, persistent, default backend" rather
> than "rewrite 89 pages." The 89 call sites import one symbol from one module.

---

## 4. Proposed phased removal plan (NOT executed)

**Strategic context** (from `docs/Hosting.migration.md`): the agreed direction is
that the **marketing site stays on Base44**, while the **wallet app moves to
self-controlled hosting**, non-custodial and local-first. This plan removes
Base44 *from the wallet app runtime*; it does not touch the separate marketing
site. The natural replacement for the in-app data layer is **local-first
on-device storage** (the app's "entities" are per-user app metadata, not custody
funds), and the natural replacement for auth is the **on-device unlock model
that already exists** (`WalletProvider` unlock + passkey + biometric +
`keyStore.changePassword`).

Recommended replacement target: **local-first, no hosted backend.** Entity data →
persistent on-device store (IndexedDB on web / Capacitor secure or filesystem
storage on native) behind the *same* `base44.entities.*` API shape. Auth → drop
hosted accounts; the seed phrase + on-device unlock *is* the account. Backend
functions → fold into direct client calls (RPC, price, PDF libs already vendored)
or remove.

| Phase | Goal | Work | Breaks / needs | Effort | Risk |
|---|---|---|---|---|---|
| **0. Cosmetic** | Strip branding with zero runtime impact | Rename `package.json` (`veyrnox`), rewrite README, optionally rename `base44_*` key prefixes (migrate stored values), update the anomaly comment. Leave the SDK in place. | Nothing functional. Key-prefix rename needs a one-time localStorage migration or it logs users out of stored params. | XS | Very low |
| **1. Local-first data adapter** | Replace the data backend behind the one chokepoint | Promote `demoClient.js`'s in-memory store to a **persistent local adapter** (same `entities.*`/`auth.*`/`functions`/`integrations` shape) and make `base44Client.js` export it as the **default** (not just under `?demo`). Keep the API surface identical so the **89 consumers don't change**. | Needs a persistence layer (IndexedDB/Capacitor) + initial seed/empty-state policy + a data-migration story for anyone with real hosted data. Demo mode becomes "the" mode. | M | Low–Med (broad blast radius, but funnels through one module; covered by the existing demo path) |
| **2. Auth** | Remove hosted auth | Replace `AuthContext` network path with the on-device unlock state (`WalletProvider`/passkey/biometric). Decide the account model: for a non-custodial wallet the **seed is the identity** — likely delete Login/Register/OTP/social/Forgot/Reset rather than reimplement them. Repoint `ProtectedRoute` and `Layout` logout to the unlock/lock lifecycle. Drop `@base44/sdk/dist/utils/axios-client`. | Removes email/password + social + OTP flows entirely. Need product sign-off that "no hosted accounts" is intended (it aligns with the non-custodial design). `UserSession`/`AuditLog` semantics shift to local-only. | M | Med (UX/product decision, not just code) |
| **3. Backend functions & integrations** | Remove the 9 Deno functions + `functions.invoke`/`integrations.Core` | Per call site: `rpcProxy` → direct RPC via existing `wallet-core` providers; `checkPriceAlerts` → client-side price fetch (CORS permitting); PDF gen → client-side `jspdf`/`docx` (already deps); `InvokeLLM` → wire a real provider key or remove the AI pages; `SendEmail` → remove (no server) or make in-app only. Delete the 4 orphaned functions outright. | CORS on direct price/RPC from the client; a server may still be wanted for LLM key secrecy and email — decide keep-a-tiny-backend vs drop-features. PDF gen is a clean client-side win. | M–L | Med (some features may be cut, not ported) |
| **4. Delete the SDK + schemas + plugin** | Final teardown | Remove `@base44/sdk` + `@base44/vite-plugin` from `package.json`; remove the Vite plugin from `vite.config.js`; delete `app-params.js` Base44 config (or trim to local-only); delete `base44/` (schemas + functions + builder config) if the marketing-site repo doesn't need them; collapse `base44Client.js`/`demoClient.js` into one local-data module; drop the `VITE_BASE44_*` env contract. | Only safe **after** phases 1–3 leave no live SDK calls. `base44/entities/*.jsonc` can go once nothing reads the hosted datastore. Rebuild regenerates the mobile/dist bundles. | S | Low (mechanical, once nothing imports the SDK) |

### Ordering rationale
1 before 2/3 because the data adapter is the chokepoint that keeps the app
running while auth and functions are reworked. 4 is strictly last — you can't
delete the SDK until no module imports it. Phase 0 is independent and can land
anytime. Each phase is independently shippable and leaves the app working
(local-first) at every step. **Net effect once complete:** a self-contained,
local-first, non-custodial wallet with no hosted-backend dependency — matching
the direction already recorded in `docs/Hosting.migration.md`.

### Effort/risk at a glance
- **Lowest-hanging:** Phase 0 (cosmetic) and Phase 4's mechanical deletes.
- **Highest-leverage:** Phase 1 — one adapter swap behind one export neutralizes
  89 call sites.
- **Biggest *decisions* (not code):** Phase 2 (kill hosted accounts?) and Phase 3
  (keep a minimal backend for LLM/email, or drop those features?).

---

## 5. Appendix — how to reproduce this inventory

```sh
# Every base44 reference in source (excludes node_modules)
grep -rin "base44" --include="*.js" --include="*.jsx" --include="*.ts" \
  --include="*.tsx" --include="*.json" --include="*.jsonc" --include="*.md" .

# Prove wallet-core independence (expect only the anomaly.js comment)
grep -rin "base44" src/wallet-core/

# The data chokepoint and its consumers
grep -rl "import { base44 }" src        # 89 files
grep -oE "base44\.(entities|auth|functions|integrations)\.[A-Za-z]+" -r src
```
