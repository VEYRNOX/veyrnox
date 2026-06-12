# Image & LCP recon scan — findings

**Date:** 2026-06-12
**Type:** Read-only investigation (per `brief-image-lcp-recon-scan.md`). No `src/` edits, no build-config
changes, no commits, no new app code. This document in `docs/` is the deliverable.
**Runtime:** Capacitor + Android System WebView (Chromium), Vite + React 18. Images are app assets.
**Method note:** evidence is file-path + measured geometry, not assertion. The one live measurement taken
was an ephemeral PerformanceObserver/geometry trace against the Vite dev server (see Q5); it added no
instrumentation that survives the scan and no per-wallet-set probe (§0 honoured).

---

## TL;DR (the reality the scan was built to settle)

1. **The LCP element on the first screen is TEXT, not an image.** On the cinematic welcome screen (the
   true first paint, pre-PIN) the largest contentful element is a body-copy `<p>`, then list items, then
   the "VEYRNOX" wordmark — all text. The 76×76 brand mark is an **inline `<svg>`**, which is **not an
   LCP-eligible candidate** by spec. There are **zero image candidates** in the contentful set of the
   first screen.
2. **On the post-unlock hero (portfolio) screen the LCP is also text** — the `$0.00`/total-value figure
   (`text-4xl`) and its label, rendered after the vault decrypts and balances resolve. Coin icons there
   are tiny (`64×64`, ≤6.8 KB), `loading="lazy"`, and sit in the asset list (below the headline figure).
3. **All app-rendered images on the first screens are bundled, trivially small, and not on the LCP path.**
   The only runtime-network image fetches live on the **News** and **NFT** screens (behind navigation),
   and they are an **I2/I5 finding** (egress / untrusted origin), *not* an LCP/CLS concern.

**Therefore the right next brief is (b) a text-render / font / decrypt-path LCP brief — NOT bundled-image
optimization.** Bundled images are already near-optimal and off the critical-paint path. See §Recommendation.

---

## Q1 — What is the LCP element on the first meaningful screen?

There are two "first" screens; both are text-dominated.

### (a) Cinematic welcome screen — the actual first paint (pre-PIN)
`src/components/WalletEntry.jsx:113-186` (`WelcomeHero`), reached via
`src/components/WalletGate.jsx` → `WalletEntry` when no vault exists.

Measured LCP-eligible candidates on this screen (computed from rendered geometry — the same "largest
contentful element" the LCP algorithm picks; see Q5 on why the engine's own LCP entry was unavailable):

| Rank | Element | Type | What it is | Source |
|------|---------|------|------------|--------|
| 1 | `<p>` body copy | **text** | "Self-custody, coercion-resistant. Your keys never leave this device." | `WalletEntry.jsx:155-157` |
| 2 | `<li>` feature rows | **text** | "Multi-chain receive & balances", etc. | `WalletEntry.jsx:160-169` |
| 3 | `<span>` wordmark | **text** | "VEYRNOX" (`text-3xl`, gradient clip) | `WalletEntry.jsx:152` → `VeyrnoxWordmark` |
| — | brand mark `<svg>` 76×76 | **SVG — NOT LCP-eligible** | `VeyrnoxLogo` inline vector | `WalletEntry.jsx:148` → `VeyrnoxLogo.jsx:21-70` |

No `<img>`, no CSS `background-image` candidates exist on this screen at all. **LCP = text.**

> Spec note (why the logo doesn't count): LCP candidates are limited to `<img>`, `<image>` inside `<svg>`,
> `<video>` poster, elements with a CSS `background-image: url(...)`, and block-level **text** nodes. An
> author-drawn inline `<svg>` (paths/gradients) is explicitly excluded. The prominent teal logo is visually
> the hero but contributes nothing to LCP.

### (b) Post-unlock hero (portfolio) screen
`src/pages/WalletPortfolioPage.jsx` (rendered after unlock via `WalletGate`).

- **Largest/last contentful element: the total-value figure**, `src/pages/WalletPortfolioPage.jsx:505-508`:
  ```jsx
  <p className="text-xs ... uppercase tracking-widest mb-1">{activePortfolioName} · Total Value</p>
  <p className="text-4xl font-bold">{formatFiat(pfTotal, "USD")}</p>
  ```
  This is **text behind decrypt** (see Q1-note below). Rendered in Schibsted Grotesk (sans), not mono.
- Coin icons (`CoinLogo`) appear in the asset **list** beneath the headline; each is a `64×64` PNG,
  `loading="lazy"`, ≤6.8 KB — not a plausible LCP element.

**Text-behind-decrypt, stated explicitly (per brief Q1):** the headline figure is gated on
`usePortfolio(wallets, walletAddresses)` (`WalletPortfolioPage.jsx:377-378`), which only populates after
`unlock()` decrypts the vault (Argon2id) and async balance RPC reads resolve
(`src/lib/portfolioBalances.js:91-179`, `staleTime: 30_000`). So the hero LCP is **text whose paint time
is dominated by decrypt + network**, not by any image. **Image work is largely irrelevant to LCP here.**

---

## Q2 — Bundled or fetched?

### Bundled into the APK (loaded by the WebView from local `dist/` files) — the first-screen set
- `public/coins/*.png` — 14 coin icons (ada, arb, avax, bnb, btc, doge, eth, matic, op, sol, trx, usdc,
  usdt, xrp). Referenced via `logoFor(symbol)` → `` `/coins/${symbol.toLowerCase()}.png` ``
  (`src/lib/cryptos.js:71`), rendered by `src/components/CoinLogo.jsx:28-37`.
- `public/veyrnox-icon.svg` — favicon / apple-touch-icon only (`index.html:5,8`). Not page content.
- `public/metamask.svg`, `public/phantom.svg` — provider icons referenced by
  `src/pages/ConnectWallet.jsx:14,24` (Connect-wallet screen, behind navigation).
- Inline vector graphics (not files): `VeyrnoxLogo.jsx`, `GoogleIcon.jsx`, lucide-react icons, and Recharts
  chart SVGs (`PortfolioChart.jsx`, `Analytics.jsx`, `OnChainAnalytics.jsx`, `PortfolioHealthScore.jsx`).
- QR codes: generated **in-memory** as a data URL via the `qrcode` lib (`src/components/QRCodeDisplay.jsx:61`)
  — local, no fetch.

### Native-only (in the APK, but **never loaded by the WebView**)
- `android/app/src/main/res/drawable*/splash.png` (×10, up to 17.7 KB) and `mipmap-*/ic_launcher*.png`
  (×12, up to 15.5 KB). These are the OS splash / launcher icons. Irrelevant to WebView LCP/CLS.

### Fetched at runtime from a network origin — **I2 / I5 surface (finding)**
None on the first/hero screens. All live behind navigation:

| Site | Origin | File:line | Note |
|------|--------|-----------|------|
| News thumbnails | CryptoCompare CDN (`article.imageurl` from `min-api.cryptocompare.com`) | `src/components/CryptoNewsFeed.jsx:13,32-37` | Third-party CDN image, no origin allow-list |
| NFT images | user-supplied `image_url` (arbitrary HTTPS) | `src/pages/NFTPortfolio.jsx:89`, `src/pages/MultiChainNFT.jsx:74,99` | Unvalidated remote URL |
| NFT placeholders | hardcoded `images.unsplash.com` URLs | `src/pages/MultiChainNFT.jsx:22-27,50` | Remote CDN fallback |

> **Flag (not for this brief to fix):** these are silent third-party image GETs from inside the wallet —
> an I2 (egress) / I5 (untrusted origin) decision, separate from image-perf. Worth a deniability/egress
> ticket; **out of scope** for an image-optimization brief and not an LCP/CLS contributor (off the first
> screens).

---

## Q3 — Current formats, sizes, dimensions

**Coin icons** — all PNG, all `64×64` intrinsic, displayed at the `size` prop (default 40px). Ranked by weight:

| File | Format | Intrinsic | Size | Has explicit w/h | Loading |
|------|--------|-----------|------|------------------|---------|
| `arb.png`  | PNG | 64×64 | 6824 B | yes (`width/height={size}`) | lazy |
| `usdc.png` | PNG | 64×64 | 4310 B | yes | lazy |
| `avax.png` | PNG | 64×64 | 4161 B | yes | lazy |
| `ada.png`  | PNG | 64×64 | 3965 B | yes | lazy |
| `eth.png`  | PNG | 64×64 | 3914 B | yes | lazy |
| `btc.png`  | PNG | 64×64 | 3709 B | yes | lazy |
| `usdt.png` | PNG | 64×64 | 3609 B | yes | lazy |
| `doge.png` | PNG | 64×64 | 3521 B | yes | lazy |
| `bnb.png`  | PNG | 64×64 | 3347 B | yes | lazy |
| `matic.png`| PNG | 64×64 | 3013 B | yes | lazy |
| `op.png`   | PNG | 64×64 | 2927 B | yes | lazy |
| `xrp.png`  | PNG | 64×64 | 2824 B | yes | lazy |
| `trx.png`  | PNG | 64×64 | 2363 B | yes | lazy |
| `sol.png`  | PNG | 64×64 | 1716 B | yes | lazy |

All 14 combined ≈ **50 KB**. `veyrnox-icon.svg` = 1161 B (favicon only).

**Ranked by byte weight (the "heaviest few"):** `arb.png` (6.8 KB) → `usdc.png` (4.3 KB) → `avax.png`
(4.2 KB). The genuinely heaviest image *files* in the repo are native splash PNGs
(`drawable-land-xxxhdpi/splash.png` 17.7 KB, `drawable-port-xxxhdpi/splash.png` 17.5 KB,
`mipmap-xxxhdpi/ic_launcher_foreground.png` 15.5 KB) — **but the WebView never loads these.**

**Explicit dimensions / CLS:** `CoinLogo` (`width`+`height` props) and `QRCodeDisplay` (`width`+`height`)
set explicit dimensions → no CLS. Remote images use CSS-box sizing without `width`/`height` attrs
(`CryptoNewsFeed.jsx:32` `h-14 w-14` fixed box → low CLS; NFT images container-defined) — all off the
first screens regardless.

---

## Q4 — Loading model in the WebView

- **Coin icons are already deferred:** `CoinLogo` sets `loading="lazy"` (`src/components/CoinLogo.jsx:33`)
  and has a graceful colored-glyph fallback on error (no broken-image CLS). So the bundled images that
  *could* appear above the fold are lazy by default.
- **Welcome screen:** the only "visual" is the inline `<svg>` logo (eager, but free — vector, ~5 KB of
  inline markup, no network). Entrance is Framer Motion fade/translate that **degrades to an instant static
  render under `prefers-reduced-motion`** (`WalletEntry.jsx:114,119-124`); the glow is CSS
  `motion-safe:animate-pulse`. No image decode on this screen.
- **No existing `<link rel=preload>` for images, no `decode()` hints, no IntersectionObserver image
  deferral** beyond native `loading="lazy"`. (There is also no image preload to remove — the prior
  website-style brief's `<link rel=preload>` assumption does not map here.)
- **Fonts** are the real first-paint network dependency, not images: `index.html:13-16` pulls Schibsted
  Grotesk + IBM Plex Mono from Google Fonts CDN with `display=swap` and `preconnect` hints. Because LCP on
  both first screens is **text**, font fetch/swap directly gates LCP. No local/self-hosted `@font-face` or
  bundled font files exist in the repo.
- **Deniability coupling (brief Q4):** which coin icons render is derived from the **unlocked set's
  holdings** (`CoinLogo` keyed off wallet/asset data; `logoFor(symbol)`), so icon load order does reveal
  which assets a session holds. This is a **reported finding**, consistent with the existing decoy model
  (balances/holdings already differ per set); the scan added no probe. Not an LCP matter. **No load/decode
  branch keys on real-vs-decoy beyond the holdings that the UI already shows post-unlock.**

---

## Q5 — Honest baseline measurement, app-correct

**Correct method for this runtime:** `chrome://inspect` remote-debugging the **Android System WebView**
against the running APK on a device/emulator, reading `largest-contentful-paint` / `layout-shift`
PerformanceObserver entries (or a DevTools Performance trace) **inside the WebView**. Lighthouse-against-a-URL
is wrong here and was not used.

**What was actually available in this recon environment:** no Android emulator/device was attached, and
iOS native build is impossible on this Windows host (per `CLAUDE.md`). So a true on-device WebView LCP
number was **not obtainable**. What *was* obtainable: a desktop-Chromium reading against the Vite dev
server (`localhost:5173`), on the real welcome-screen DOM.

**What that measurement yielded (honest, with caveats):**
- The dev-server Chromium did **not emit** buffered `largest-contentful-paint` or `paint` PerformanceEntries
  in this preview's headless config (both came back empty) — itself a reason the brief warns against
  trusting a single web-style metric. Navigation timing did work: `domContentLoaded ≈ 1594 ms`,
  `load ≈ 1603 ms` (desktop, dev build — **not** a release-APK cold-start number).
- LCP **element identification** was therefore computed from rendered geometry (the same "largest
  contentful element among eligible types" the LCP algorithm selects). Result: **largest eligible element
  is text** (a `<p>`), with no image/background-image candidates present. This is the load-bearing finding
  and it is **layout-determined, so it transfers** to the WebView.
- **CLS** on the welcome screen measured **0** (zero layout-shift entries).
- **Caveat on absolute numbers:** the preview window was a narrow **132×766** viewport, so wrapped text
  areas are not phone-representative, and desktop CPU/GPU + Vite dev build + no cold WebView start + no
  mobile-network font fetch mean the **timing** does not transfer. Only the **element identity and the
  zero-image-candidate conclusion** transfer.

**Baseline, stated as what it honestly is:**
- LCP element (first screen): **text** (welcome body copy / wordmark; post-unlock: the total-value figure).
- LCP timing: **not honestly measurable on-device in this environment** — needs `chrome://inspect` on an
  Android build. The dev-server proxy gives `load ≈ 1.6 s` desktop/dev only, which should **not** be quoted
  as the WebView LCP.
- CLS (first screen): **~0** (no shifts observed; images that exist carry explicit dimensions).

---

## Asset table (brief §2)

| Asset | Format | Size | Dimensions | Bundled / Fetched | Explicit dims | Eager / Deferred | On LCP path? |
|-------|--------|------|------------|-------------------|---------------|------------------|--------------|
| `public/coins/arb.png` | PNG | 6824 B | 64×64 | bundled | yes | lazy | no |
| `public/coins/usdc.png` | PNG | 4310 B | 64×64 | bundled | yes | lazy | no |
| `public/coins/avax.png` | PNG | 4161 B | 64×64 | bundled | yes | lazy | no |
| `public/coins/*.png` (other 11) | PNG | 1.7–4.0 KB | 64×64 | bundled | yes | lazy | no |
| `public/veyrnox-icon.svg` | SVG | 1161 B | vector | bundled | n/a (favicon) | eager | no (favicon) |
| `public/metamask.svg` / `phantom.svg` | SVG | — | vector | bundled | n/a | eager | no (Connect screen) |
| `VeyrnoxLogo` (inline) | inline SVG | ~5 KB markup | 76×76 render | bundled (inline) | yes | eager | **no — SVG not LCP-eligible** |
| `android/.../splash.png` (×10) | PNG | ≤17.7 KB | varies | native only | n/a | n/a | no (not WebView) |
| `android/.../ic_launcher*.png` (×12) | PNG | ≤15.5 KB | varies | native only | n/a | n/a | no (not WebView) |
| News thumbnail | remote (CryptoCompare) | runtime | varies | **fetched** | no | eager | no (News screen) |
| NFT image / placeholder | remote (user URL / Unsplash) | runtime | varies | **fetched** | no | eager | no (NFT screen) |

**3 heaviest WebView-loadable assets:** `arb.png` (6.8 KB), `usdc.png` (4.3 KB), `avax.png` (4.2 KB).
**3 most likely LCP / CLS contributors:** (1) **text + web-font swap** on the welcome screen (LCP);
(2) **text-behind-decrypt** total-value figure on the hero (LCP, gated by Argon2id + balance RPC);
(3) **font load** generally (since both screens' LCP is text). No image is in the top-3.

---

## Recommendation (brief §2, one paragraph)

The right next brief is **(b) a text-render / font / decrypt-path LCP brief**, not bundled-image
optimization. The LCP element on both first screens is **text**: the welcome screen has *no* image LCP
candidate at all (the hero logo is an LCP-ineligible inline SVG), and the post-unlock hero's LCP is the
total-value figure, whose paint time is dominated by **vault decrypt (Argon2id) + balance RPC**, with a
secondary dependency on the **Google-Fonts web-font swap** that gates all that text. The bundled coin PNGs
are already near-optimal for their job — `64×64`, ≤6.8 KB, `loading="lazy"`, explicit dimensions (no CLS),
and below the headline — so converting/compressing/preloading them would move neither LCP nor CLS. If an
implementation session is spent here, the high-leverage levers are: self-hosting/subsetting the two fonts
(kill the CDN round-trip and the I2 egress in one move) or preloading them, and tightening the
decrypt→first-balance path (skeleton/instant-zero render) — **not** image work. Two smaller, separate
tickets fall out of this scan but are **not** image-perf and **not** mainnet blockers: the runtime remote
image fetches on News/NFT (I2/I5 egress) and the holdings-derived icon-load coupling (deniability note).
Consistent with the brief's closing: worth one well-spent session, but this whole thread does not gate the
audit or the first willingness-to-pay conversation.
