# Design decision: Remote-image egress in shipped screens (I2 / I5)

**Status:** DECISION REQUIRED before any code. This doc decides and documents only — no source files are touched.
**Owner:** Al · **Reviewer (required):** independent audit (§24)
**Framing:** PRE-AUDIT. Concerns I2 (no silent data egress) and I5 (backend / third-party untrusted by design), with one I3 (deniability) sub-finding.

---

## 1. The problem in one sentence

Every `<img src="https://third-party/…">` in a shipped screen is a **silent outbound request to a host the user did not choose** — it leaks the user's IP, `User-Agent`, `Referer`, and request timing to that host on every render (I2/I5) — and when the image URL is **attacker-controllable** (NFT token metadata an attacker can airdrop), loading it becomes a **tracking / deanonymization beacon** against a wallet whose entire premise is coercion-resistance.

The concern is not "does the image render." It is "who learns the user opened this screen, and from what IP." On a self-custody coercion-resistant wallet that boast I1–I5, a third-party-controlled pixel is a real deanonymization primitive, not a cosmetic detail.

## 2. Surfaces found (whole-`src/` sweep)

`git grep -nE "https?://…\.(png|jpg|jpeg|svg|webp|gif)"` plus `git grep -n "<img"` under `src/` returns six `<img>` sites across five files. Three are local/same-origin (no egress); three are remote. Distinct **remote-image** surfaces: **3** (news thumbnails, NFT images ×2 pages, Unsplash placeholder pool). The two NFT pages share the same vector and are treated as one surface family.

| Surface | Host / source | Trust level | Fires in deniability? | Recommendation |
|---|---|---|---|---|
| `CryptoNewsFeed.jsx:32` (`article.imageurl`) | `*` — any host CryptoCompare news returns (publisher CDNs, arbitrary) | known-third-party feed, **arbitrary image hosts** | **Yes** — on Dashboard, any unlocked set | Proxy through same-origin cache **or** gate behind explicit opt-in; disclose |
| `NFTPortfolio.jsx:89` / `MultiChainNFT.jsx:74,99` (`image_url`) | **arbitrary** — user/metadata-supplied URL, any host | **arbitrary, attacker-controllable** (airdropped token metadata) | **Yes** — whenever the NFT screen renders | **Strongest:** proxy through same-origin cache (strip IP/headers) **and** opt-in per image; never auto-load attacker URLs |
| `MultiChainNFT.jsx:23–26` (`PLACEHOLDER_IMAGES`) | `images.unsplash.com` (4 hard-coded photo IDs) | known-third-party, first-party-chosen | **Yes** — used as default + `onError` fallback | Bundle locally (4 static assets); removes the host entirely |
| `CoinLogo.jsx:28` → `cryptos.js:75 logoFor()` | `/coins/<sym>.png` (same-origin, bundled — confirmed `public/coins/*.png`) | **first-party / local** | n/a — no egress | **No action** (already correct: local, offline-safe) |
| `QRCodeDisplay.jsx:61` | `dataUrl` (locally generated data: URI) | **first-party / local** | n/a — no egress | **No action** (no network) |

`useBasketPrices.js` and `PriceAlerts.jsx` contain **no image references**. They are price-data fetches to `min-api.cryptocompare.com` and are out of scope for *image* egress — but note (below) they establish that the cryptocompare host is already contacted, which bears on the news-feed verdict.

## 3. Per-surface analysis

### 3.1 NFT images — `NFTPortfolio.jsx` / `MultiChainNFT.jsx` (HIGHEST RISK)

`NFTPortfolio.jsx:89` renders `<img src={nft.image_url}>` and `MultiChainNFT.jsx:74,99` render `<img src={n.image_url} … onError={… PLACEHOLDER_IMAGES[0]}>`. `image_url` is a free-text field (`MultiChainNFT.jsx:203`, `NFTPortfolio.jsx:127`) and, in any real NFT-portfolio feature, is populated from **token metadata** — i.e. a string an attacker fully controls by airdropping an NFT to the user's public address.

Why this is the worst case:
- **Attacker-controlled host.** The attacker picks the domain. Rendering the card sends the user's **IP + headers to the attacker's server**, correlating "this IP opened a wallet that holds the NFT I sent to address 0x…". That links an on-chain pseudonymous address to a network identity — the exact deanonymization a coercion-resistant wallet must resist (I5: every third party is hostile by default).
- **Airdrop is unconsented.** The user never chose to "add" the NFT; it appeared. Auto-loading its image converts an unsolicited on-chain event into an outbound ping.
- **Per-pixel tracking.** A unique URL per recipient turns the image into a read-receipt/geolocation beacon.

Today these are demo-seeded via `base44.entities.NFTAsset` and the Unsplash placeholder, so the live attacker path is latent — but the **rendering pattern is unsafe by construction** and must be settled before any real token-metadata wiring lands.

**Recommendation (strongest treatment):** do **not** auto-load arbitrary `image_url`. Combine: (a) **proxy through a same-origin cache** so the third-party host only ever sees the proxy's IP, never the user's, and headers are stripped; and (b) **explicit opt-in per image** ("Load image from <host>?") so the user consents to contacting an attacker-chosen host. Absent a proxy, the honest fallback is to render the local placeholder and **honestly disclose** that remote NFT art is not loaded for anti-tracking reasons. This is an **audit line-item** — the proxy is backend surface and is audit-gated (§24).

### 3.2 News thumbnails — `CryptoNewsFeed.jsx` (MEDIUM)

`fetchCryptoNews()` (line 11) hits `min-api.cryptocompare.com`; each article's `article.imageurl` (line 32) is then loaded directly. The image hosts are **arbitrary publisher CDNs** chosen by CryptoCompare's editorial feed — not attacker-controllable, but not first-party either, and **not the cryptocompare domain** the app already trusts for prices. So each news render fans the user's IP out to a *set of unknown third-party hosts*.

This feed is mounted on the **Dashboard** (`Dashboard.jsx:387`), which renders for **any unlocked set**, so it fires in deniability/decoy sessions too (see §4).

**Recommendation:** **proxy thumbnails through the same-origin cache** (preferred — keeps the one-host-only property the price feed already has) **or gate the whole news tile behind explicit opt-in** and disclose that enabling it contacts third-party publisher hosts. Cheapest honest interim: render text-only cards (drop the thumbnail) — the data already comes from one host; only the images fan out.

### 3.3 Unsplash placeholders — `MultiChainNFT.jsx:23–26` (LOW, trivially fixable)

Four hard-coded `images.unsplash.com` URLs serve as the default image and the `onError` fallback. The host is **first-party-chosen** (not attacker-controlled), but it is still a third-party request that leaks IP/timing to Unsplash on every NFT card with no real image — and it is the `onError` target, so a *failed* attacker URL still falls through to an Unsplash ping.

**Recommendation:** **bundle locally.** Ship the four images under `public/` (as `public/coins/*.png` already are) and reference same-origin paths. This deletes the Unsplash host entirely — zero egress, no opt-in needed, no disclosure debt.

### 3.4 Local surfaces — `CoinLogo.jsx`, `cryptos.js`, `QRCodeDisplay.jsx` (NO ACTION)

`logoFor()` (`cryptos.js:75`) returns `/coins/<sym>.png`; `LOGOS` (`cryptos.js:69–71`) maps the same. These are **bundled, same-origin, offline-safe** assets — confirmed present in `public/coins/` (ada/arb/avax/bnb/btc/doge/eth/matic/op/sol/trx/usdc/usdt/xrp). `CoinLogo.jsx:28` renders them with a coloured-glyph fallback. `QRCodeDisplay.jsx:61` renders a locally generated `data:` URI. **None of these touch the network.** They are the model the remote surfaces should converge toward.

## 4. Deniability (I3) finding

I3 ("zero backend calls in deniability mode") is enforced at the wallet-set / `walletMeta` layer — `stealth.js`/`duress.js` carry no metadata writes. **None of the three remote-image surfaces consult deniability state.** They fire on render based purely on which screen is mounted:

- The **news tile is on the Dashboard**, which renders for any unlocked set — so in a **duress/decoy unlock**, opening the dashboard still pings third-party publisher hosts. The egress itself reveals nothing about the *hidden* set (the request is the same for any user), so this is an I2 concern more than a hard I3 break — but it is network traffic during a session the user may believe is "quiet."
- NFT screens are opt-in routes; they only fire if navigated to. If a coercer drives a decoy session into the NFT tab and an **attacker-airdropped** image loads, that is the dangerous combination: attacker host + decoy-session IP.

The `useBasketPrices.js` header (lines 4–19) documents the correct posture for price data: **byte-identical request for every user, demo or real, never narrowed to holdings.** Remote-image surfaces violate the spirit of that rule — an NFT image request is, by construction, *not* identical across users; it encodes which NFT the user holds. That asymmetry is exactly why NFT images are the high-risk surface.

## 5. Prioritized action list

1. **NFT images (P0, audit-gated).** Decide the proxy-vs-disclose construction before any real token-metadata wiring. Until then: do not auto-load arbitrary `image_url`; render the local placeholder. The same-origin image proxy is backend surface → **§24 audit line-item**, ship any interim as HONEST-DISABLED for remote art.
2. **Unsplash placeholders (P1, trivial, no audit needed).** Bundle the four images under `public/` and reference same-origin. Removes a third-party host outright with no behavioural change.
3. **News thumbnails (P1).** Either proxy thumbnails same-origin, or ship text-only cards and gate any image-loading behind an explicit, disclosed opt-in. The article *text* already comes from one trusted host; only the images fan out.
4. **Document the rule (P2).** Add a standing invariant: shipped `<img>` `src` must be same-origin/bundled, a generated `data:` URI, or an explicitly-opted-in, proxied third-party URL — never a raw attacker- or feed-controlled remote URL. CoinLogo/QRCodeDisplay are the reference pattern.

## 6. What this is really telling you

The wallet already solved this once — coin logos are bundled, the QR is a data URI, and the price feed is deliberately one-host and holdings-decoupled. The image surfaces are the places where that discipline lapsed. The NFT path is the one that matters: it is the only surface where the remote host is **attacker-chosen**, and it is therefore the only one that turns an unsolicited on-chain event into a network-level deanonymization beacon. That is a security decision, not a UI polish item, and it belongs in front of the auditor.
