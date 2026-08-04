# Transak on/off-ramp — integration spec

**Status:** DRAFT — awaiting owner sign-off before implementation.
**Author:** Claude (session 2026-07-29).
**Scope:** MVP integration of Transak as sole on/off-ramp provider on iOS + Android.
Web is out of scope (no fiat rails on the web build).
**Blocking prereqs:** Transak KYB complete, staging API key issued via partner portal.
Production keys + signed partner agreement are NOT required to build; they are required
to ship.

---

## 1. Recon findings (what the app already looks like)

- **Runtime:** Capacitor 8.4.2 (`@capacitor/core`, `@capacitor/ios`, `@capacitor/android`).
  App id `com.veyrnox.app`, name `Veyrnox`. `capacitor.config.json` has
  `server.allowNavigation: []` — no in-app top-level navigation to external hosts is
  currently permitted, which we should preserve.
- **Installed Capacitor plugins:** `app`, `filesystem`, `haptics`, `local-notifications`,
  `share`. **Not installed:** `@capacitor/browser`, `@capacitor-community/inappbrowser`.
- **CSP:** `index.html` line 32 — strict. `frame-src 'self'`, `connect-src` is an
  audited allowlist, `img-src` explicit host list. Any in-webview embedding of a
  third party requires widening at least `frame-src` and `connect-src`.
- **Deniability (I3) primitive:** `src/wallet-core/deniabilitySession.js`. In-memory
  boolean, authoritative setter is `WalletProvider.unlock`, cleared on lock. Reader
  `isDeniabilityOrDemoActive()` is already used by 89 files across the codebase and
  is the correct chokepoint for hiding the Buy entry.
- **Consent primitive:** `src/lib/consent.js` (write-gate) + `api/trackEvent.js`
  (egress-gate). Two-chokepoint pattern from PR #1410 — copy this shape.
- **Native surfaces:** `Dashboard.jsx` splits DEMO vs native (`WalletPortfolioPage`).
  Buy button belongs on the native path only. `ReceiveCrypto.jsx` is the natural
  companion — Buy is a fiat-in-crypto-out, Receive is a crypto-in-crypto-out.

---

## 2. Architecture choice — SFSafariViewController / Chrome Custom Tabs

**Recommended:** `@capacitor/browser` (opens SFSafariViewController on iOS,
Chrome Custom Tabs on Android) loading Transak's hosted widget URL.

**Rejected:** in-app WKWebView / WebView (`@capacitor-community/inappbrowser` or a
custom plugin embedding Transak inside our app's process).

### 2.1 Why the recommendation, given the earlier "same UX as MetaMask/Trust"

The system browser tab (SFSafariViewController / Custom Tabs) IS what users perceive
as native in 2026. It renders with the OS's own chrome — swipe-to-dismiss on iOS,
back-arrow on Android, no visible URL bar unless the user explicitly reveals it —
and Apple/Google explicitly recommend it for third-party auth, KYC and payment
handoffs. Users tolerate the visible seam (Transak's forms are obviously not our
forms) because the ENTIRE industry has trained them to.

Choosing this over a true in-process WebView costs us one thing (a native title bar
wrapping the Transak content), and gains us four:

1. **Separate cookie jar and process** — Transak's KYC session, device fingerprints,
   analytics SDKs run outside our app process. I2 (no silent egress by Veyrnox)
   remains a defensible claim.
2. **No CSP widening** — the Transak URL is loaded by the system browser, not our
   webview. `frame-src`, `connect-src`, `img-src` stay unchanged. The existing
   `csp-policy.test.js` suite continues to pass without exception.
3. **No new supply-chain surface** — one Apple-blessed / Google-blessed dependency
   (`@capacitor/browser`, official Ionic plugin), not a WKWebView-embedding plugin
   or a Transak SDK.
4. **Store privacy label** — smaller delta. Transak's data collection happens in a
   sandboxed browser context, mirroring "you tapped a link and left the app." Play
   Data Safety still needs a fourth-party disclosure (per section 8), but Apple's
   "Data Collected by Third Parties in Your App" question can be answered honestly
   as "no" for anything the system browser handles.

### 2.2 The upgrade path if item (1) is unacceptable

If review or a business decision requires the native header wrapping the Transak
content, upgrade to `@capacitor-community/inappbrowser` (a WKWebView-based plugin
with a Capacitor-native toolbar). At that point:

- `frame-src` and `connect-src` widen to include `*.transak.com` and their KYC
  vendors' domains (Onfido/Jumio/Veriff/Sumsub — providers subcontract, exact list
  comes from Transak).
- Apple App Privacy adds `Data Collected by Third Parties`.
- Play Data Safety adds `App activity → Product interaction` and probably
  `Identifiers → Advertising ID` if any embedded KYC SDK uses it.
- A one-time "You're leaving Veyrnox's data boundary" disclosure sheet mounts
  before the WebView (see section 6.5).

Ship (2.1) for MVP, defer (2.2) to a follow-up only if a specific need arises.

---

## 3. User flow

```
Dashboard  →  [ Buy ]  →  Buy screen (native)  →  Provider row: Transak
                              │
                              ├─ Amount (native input, our currency selector)
                              ├─ Asset (native picker, from portfolio)
                              └─ [ Continue with Transak ]
                                     │
                                     ├─ First-time only: disclosure sheet
                                     │     "Transak Ltd handles this purchase.
                                     │      Their terms + privacy policy apply."
                                     │     [ Cancel ]  [ Continue ]
                                     │
                                     └─ Browser.open(transakUrl)  ← SFSafari / Custom Tabs
                                                │
                                                ├─ Transak collects card / KYC
                                                ├─ On success, Transak redirects to
                                                │  https://veyrnox.com/buy/return?tid=…
                                                └─ Universal link fires appUrlOpen
                                                       │
                                                       └─ Native "Purchase in progress"
                                                            screen; on-chain polling on
                                                            deposit address begins.
```

Off-ramp (sell) mirrors the same shape with `productsAvailed=SELL` and the flow
returning to a "Send-to-Transak-address" screen where the user signs a native send
to Transak's payout address. This is a follow-up phase — not MVP.

---

## 4. Entry-point placement

Two entry points, both hidden in decoy/demo:

1. **Primary — Dashboard action row.** New `Buy` button alongside existing
   `Send` / `Receive`. Design system: same size, teal-accent icon, label
   `nav.buy` (new i18n key).
2. **Secondary — Empty state on Receive.** When the wallet's balance for a
   given asset is 0, the Receive screen's empty state gains a
   "Or buy [ASSET]" secondary CTA.

**No entry point in:**
- Decoy or hidden sessions (`isDeniabilityOrDemoActive() === true` returns null from
  the render — component doesn't mount, doesn't fetch quotes, doesn't touch storage).
- The DEMO build (`DEMO === true` in `demoClient.js`).
- Builds where `VITE_BUY_ENABLED !== 'true'`. This is the ship gate — flag is
  `false` in every branch until prod keys + agreement land.

---

## 5. Deniability gate (I3)

Two-chokepoint pattern, copied from `lib/consent.js`:

### 5.1 RENDER chokepoint

```jsx
// src/pages/BuyCrypto.jsx (new)
import { isDeniabilityOrDemoActive } from "@/wallet-core/deniabilitySession";

export default function BuyCrypto() {
  if (isDeniabilityOrDemoActive()) return null;
  if (import.meta.env.VITE_BUY_ENABLED !== 'true') return null;
  // ... render ...
}
```

The Dashboard/Receive buttons that route to `/buy` are guarded by the same check
so a decoy user never sees the entry point.

### 5.2 EGRESS chokepoint

```js
// src/lib/buy/transakUrl.js (new)
import { isDeniabilityOrDemoActive } from "@/wallet-core/deniabilitySession";

export function buildTransakUrl(params) {
  if (isDeniabilityOrDemoActive()) {
    throw new Error("DENIABILITY_ACTIVE"); // fail-closed (I4)
  }
  // ... URL construction, param signing if required ...
}
```

Test: red-before-fix Vitest that opens a decoy session then invokes
`buildTransakUrl` and asserts it throws. Mirror
`src/wallet-core/sol/__tests__/hw-send-i3-gate.test.js`.

**Do NOT rely on the render gate alone.** The K-2 lesson from 2026-07-20 — a
render-time deniability check without a write-time check let real state escape to
shared storage — applies verbatim here. Two writers, two chokepoints.

---

## 6. Per-chain widget parameters

Transak accepts `cryptoCurrencyCode`, `network`, `walletAddress`, `fiatAmount`,
`fiatCurrency`, `productsAvailed=BUY`, `disableWalletAddressForm=true`,
`walletAddressesData` (JSON, one per chain if we open the aggregate widget), and
partner API key. Exact parameter names to be re-verified against the docs Transak
serves at portal-signup time.

### 6.1 Chain / asset matrix

| App asset | Transak `cryptoCurrencyCode` | Transak `network` | Source of address |
|---|---|---|---|
| ETH  | `ETH`   | `ethereum` | EVM shared (m/44'/60') |
| MATIC| `MATIC` | `polygon`  | EVM shared |
| ARB (ETH on Arbitrum) | `ETH` | `arbitrum` | EVM shared |
| OP (ETH on Optimism)  | `ETH` | `optimism` | EVM shared |
| AVAX | `AVAX`  | `avaxcchain` | EVM shared |
| BNB  | `BNB`   | `bsc`      | EVM shared |
| BTC  | `BTC`   | `mainnet`  | BTC (m/84'/0'/0') |
| SOL  | `SOL`   | `solana`   | SOL (ed25519 SLIP-0010) |
| USDC on ETH | `USDC` | `ethereum` | EVM shared |
| USDC on Polygon | `USDC` | `polygon` | EVM shared |
| USDT on ETH | `USDT` | `ethereum` | EVM shared |
| USDT on Tron| out of scope | — | (Veyrnox doesn't support Tron) |

Multi-network USDC/USDT: the Buy amount screen must ask the user which network to
receive on before opening the widget. Do not default; getting this wrong sends
funds to an unusable address.

### 6.2 Address correctness rule (I5)

The address handed to Transak comes DIRECTLY from the on-device derivation for the
currently active wallet — never from a cached value, never from a URL param,
never from a WC-supplied `from`. Read the address at the moment the Continue
button is pressed, not at mount. Same rule as `SendCrypto.jsx`.

---

## 7. Return handling & confirmation

### 7.1 Universal link, not custom scheme

- iOS: `https://veyrnox.com/.well-known/apple-app-site-association` gains a
  `/buy/return` path scope.
- Android: `https://veyrnox.com/.well-known/assetlinks.json` gains the same.
- Both point at the existing app id (`com.veyrnox.app`) and Team ID (R54268MWFV).
- Transak `redirectURL` param = `https://veyrnox.com/buy/return`.

Custom schemes (`veyrnox://buy/return`) are rejected — Chrome strips them from
external redirects, App Store review dislikes them. Universal links are the
Apple/Google-blessed path.

### 7.2 On `appUrlOpen`

```js
// src/App.jsx or existing deep-link handler
App.addListener('appUrlOpen', (event) => {
  const url = new URL(event.url);
  if (url.pathname === '/buy/return') {
    navigate('/buy/in-progress?tid=' + encodeURIComponent(url.searchParams.get('tid') || ''));
  }
});
```

### 7.3 Do NOT trust the return payload

The `in-progress` screen shows a neutral "Purchase in progress — funds appear when
the deposit lands on-chain." It does NOT display "Purchase successful — you bought
X of Y" from the return URL. Confirmation comes from the SAME on-chain polling
the Receive flow already uses (`useQuery` on the asset's balance / recent txs),
scoped to the deposit address. This is I5 (backend untrusted) applied to Transak
specifically — a spoofed return URL cannot show a fake success.

If a Transak webhook is desired later for faster UX (their standard webhook posts
to a partner endpoint), route it via a Supabase edge function that VERIFIES the
webhook signature and updates ONLY a status hint the app polls. The on-chain
observation remains the source of truth.

---

## 8. Store privacy labels & policy delta

### 8.1 Apple App Privacy

- No new categories under **Data Used to Track You** — SFSafariViewController's
  data collection is not attributed to our app.
- No new categories under **Data Linked to You** or **Data Not Linked to You** for
  the Transak flow itself.
- Existing categories from PR #1321 (Usage Data → Product Interaction if declared)
  are unchanged.

**Caveat:** Apple's review team may still ask about the third-party redirect.
Prepare a one-line response: "Transak Ltd is a fiat on-ramp opened in
SFSafariViewController. Their privacy policy governs data collected in that
session; Veyrnox neither observes nor stores it."

### 8.2 Play Data Safety

- Add **Financial info → Purchase history** — collected by Transak, disclose as
  "shared with third parties" (the third party being Transak, since the URL we
  hand off contains the deposit address and asset).
- Data type collected by Veyrnox for this feature: none. We hand off a URL and
  wait for on-chain confirmation.

### 8.3 In-app privacy policy (§9 update)

New subsection:

> **9.4 Fiat on-ramp (buy / sell).** When you use Buy or Sell, Veyrnox opens
> Transak Ltd's hosted widget in your device's system browser (Safari on iOS,
> Chrome on Android). Transak is the money-services business handling the
> transaction; they collect and hold the identity, payment and address data
> required by their regulators. Veyrnox does not observe, store, or transmit
> anything you enter in that browser session. Their privacy policy is at
> https://transak.com/privacy. If you use Buy in a decoy or hidden session,
> Veyrnox does not open the browser — the Buy option is not shown at all.

### 8.4 `veyrnox.com/privacy`

Mirror the in-app §9.4 as a new section. Same wording, same location as the PR
#1410-era consent update. Add Transak Ltd to the "Third parties" list at the
foot of the page.

---

## 9. Threat model delta

| Threat | Pre-Transak | Post-Transak (MVP) | Mitigation |
|---|---|---|---|
| Silent egress to Transak (I2) | N/A | Only when Buy tapped; hard-fails in decoy | 5.2 egress gate |
| Buy entry visible in decoy (I3) | N/A | Would leak that a real wallet exists | 5.1 render gate |
| Deposit address swap (address given to Transak ≠ user's) | N/A | Attacker on the URL bar could redirect funds | 6.2 derive at press time; system browser prevents URL tampering |
| Spoofed return URL claims success | N/A | Fake in-app confirmation | 7.3 poll on-chain, never trust return |
| Transak KYC data leaks to Veyrnox | N/A | Would put us in PCI/KYC scope | System browser sandboxing — we never see it |
| Third-party analytics attribute to Veyrnox app | N/A | Data Safety mislabelling | 8.2 disclose "shared with Transak" only |
| Malicious Transak URL (compromised partner endpoint) | N/A | Phishing user card details in Safari-branded chrome | Out of scope — Transak's problem; monitor their security advisories, pin the widget origin |

No changes required to RASP gates. Buy is a fiat entry point, not a signing entry
point — RASP tier does not need to gate it. (If a future decision is to require
GREEN RASP for Buy, add a check in `BuyCrypto.jsx` mount; not proposed for MVP.)

---

## 10. Implementation checklist

Phase 1 — foundation (staging, no ship):

- [ ] `npm i @capacitor/browser@^8` + `npx cap sync ios android`
- [ ] `src/lib/buy/transakUrl.js` — pure URL builder, egress gate
- [ ] `src/lib/buy/transakUrl.test.js` — deniability throw, chain param matrix,
      address correctness
- [ ] `src/pages/BuyCrypto.jsx` — amount + asset picker, provider row, Continue
- [ ] `src/pages/BuyCrypto.test.jsx` — render gate under decoy, no mount without
      `VITE_BUY_ENABLED`
- [ ] `src/pages/BuyInProgress.jsx` — neutral polling screen
- [ ] Dashboard action row + Receive empty-state entry points, both render-gated
- [ ] `App.jsx` deep-link handler adds `/buy/return` route
- [ ] i18n keys: `nav.buy`, `buy.title`, `buy.provider.transak`,
      `buy.disclosure.title`, `buy.disclosure.body`, `buy.disclosure.continue`,
      `buy.inProgress.title`, `buy.inProgress.body`, `buy.emptyState.cta`
- [ ] `VITE_BUY_ENABLED=false` default in `.env.example` + CI

Phase 2 — universal links (staging validation):

- [ ] `veyrnox.com/.well-known/apple-app-site-association` — add `/buy/return`
- [ ] `veyrnox.com/.well-known/assetlinks.json` — add `/buy/return`
- [ ] iOS Associated Domains capability re-verified in the Apple Developer portal
- [ ] Android intent filter for `veyrnox.com/buy/return` in `AndroidManifest.xml`
- [ ] End-to-end staging test on TestFlight + Play internal — real device, real
      universal-link return, Transak test card

Phase 3 — ship gate (post agreement + prod keys):

- [ ] Swap staging → prod partner key + widget base URL
- [ ] Publish updated in-app privacy policy §9.4
- [ ] Publish updated `veyrnox.com/privacy`
- [ ] Publish updated Play Data Safety declaration
- [ ] Publish updated Apple App Privacy declaration (if any change needed)
- [ ] Flip `VITE_BUY_ENABLED=true` in the release build
- [ ] Real-money smoke test: single small purchase, deliver to a fresh receive
      address, capture the on-chain txid, record it against the "verify, don't
      assert" rule.

Phase 4 — off-ramp (follow-up, not MVP):

- [ ] `productsAvailed=SELL` flow with Transak-supplied payout address
- [ ] Native send composer pre-fills payout address, marks it as "Transak sell"
      in the tx history
- [ ] Additional Data Safety / privacy-policy delta if KYC scope differs for sell

---

## 11. Explicit non-goals for MVP

- Aggregation of multiple on-ramps (MoonPay, Coinbase Pay, Ramp) — deferred.
- Off-ramp (sell) — phase 4.
- Google Pay / Apple Pay integration inside the app — Transak handles this
  inside the system browser, we don't touch it.
- Transak webhooks / server callbacks — on-chain observation is the source of
  truth; no server component required.
- In-app KYC status display — Transak owns the record, we don't mirror it.
- Buy with saved payment methods across sessions — that state lives in Transak's
  cookie jar and is fine to lose.

---

## 12. Owner decisions required before Phase 1 begins

1. Confirm SFSafariViewController / Chrome Custom Tabs (section 2.1) over
   in-app WKWebView (section 2.2). This is the biggest single choice.
2. Confirm the two entry points in section 4 (Dashboard + Receive empty state).
3. Confirm the Play Data Safety additions in section 8.2 will be published the
   same day the feature flips on.
4. Confirm the `VITE_BUY_ENABLED` ship gate is acceptable as a hard block until
   agreement + prod keys land.
5. Confirm we do NOT add a RASP gate on Buy for MVP (fiat-in only, no signing).

Once all five are confirmed, Phase 1 starts.
