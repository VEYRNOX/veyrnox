# Directory listings: kit and tracker

Status: IN PROGRESS. Two submissions live (AlternativeTo, SaaSHub — see Tracker).
Accounts are created and owned by the owner; every submission is confirmed with
the owner before the submit button.

**2026-09-30 correction (branch review 2026-09-29 caught this):** the Long
description below wrongly presented Safety Plus-only paid features (Duress
PIN, Stealth/hidden wallets, Panic wipe, Transaction simulation,
address-poisoning warnings — confirmed against `src/lib/tier.js`
`SAFETY_PLUS_FEATURES`) as general capabilities, and claimed Veyrnox "never
receives the customer's identity" from Transak when `functions/api/buy/webhook.js`
comments confirm the backend does receive email + address on some events (it
just doesn't log them). Both claims have already propagated into the live
AlternativeTo and SaaSHub submissions and need correcting there too — both are
still pending review as of this fix.

## Source facts (do not invent beyond these)

- Site: https://veyrnox.com (docs: https://veyrnox.com/veyrnox-docs.html)
- App Store: https://apps.apple.com/us/app/veyrnox/id6790188660
- Google Play: https://play.google.com/store/apps/details?id=com.veyrnox.app
- Support: support@veyrnox.com
- Logo: `public/icon-512.png`, `public/veyrnox-icon.svg`
- Wording base: `docs/play-launch/store-listing.md` (short description, full description)

## Screenshots

Vetted from `~/Downloads/Apple Store Photos/iPhone 6.9″ (1320×2868)/` (owner's
local machine, not in the repo). Each frame was opened and checked against its
own on-screen text before approval — several were rejected for mismatches.

**Approved for general directories:**
- `04.png` — "Split your seed, keep control" (Shamir backup)
- `06.png` — "60+ tools, one wallet" (feature grid)
- `09.png` — "A full security toolkit" (Duress PIN, Stealth Wallets, Panic Wipe, RASP, etc.)

**Approved for AI-directory listings only** (There's An AI For That, Futurepedia,
etc. — this is the one frame that actually shows the AI feature):
- `05.png` — Vigil chat blocking a sanctioned address

**Rejected — do not use anywhere without a fix:**
- `01.png` — headline "Live balances" contradicts on-screen "Reference rate, not live market data"
- `02.png` — status-bar text overlap ("Back" over the clock), keyboard bar visible
- `03.png`, `08.png` — both show the simulator's "Signing and key access are turned off in emulated environments" error banner
- `07.png` — headline price ($3,200) doesn't match the chart axis (~$2.4-2.5k); simulator balance
- `10.png` — headline "Dashboard, Center, Access, Anomalies" doesn't match the Suspicious Assets screen shown

**Not reviewed / excluded:** `veyrnox-photos/`, `veyrnox-photos-light/` (owner's
Downloads) — not opened. `05-buy` and `09-decoy` in those folders should stay out
regardless: Buy is the owner-only Transak area, and publishing decoy-mode UI is
the owner's call, not a default. iPad frames are excluded as out of scope for
these listings. The subscription-price renders ($19.99/$159.99) are **not** a
mismatch — confirmed 2026-09-28 (owner + live veyrnox.com/pricing) that this is
the AI Security Protection tier, a real, separate, higher tier above Safety
Plus ($5.99/mo, $49.99/yr). See Pricing below.

## Copy blocks

- **Name:** Veyrnox
- **Tagline:** Self-custody crypto wallet. Your keys stay on your device. Coercion-resistant.
- **Categories:** Cryptocurrency wallet; Finance; Security and privacy
- **Alternatives to name:** Trust Wallet, Exodus, MetaMask, Rainbow, Phantom
- **Pricing (owner-confirmed 2026-09-28, matches live veyrnox.com/pricing):**
  - Free — unlimited wallets/transactions, hardware-protected keys, biometric
    access, RASP runtime protection, plain-language transaction review,
    anti-phishing checks, full untruncated addresses, all 10 assets,
    WalletConnect + QR pairing, and USD reference-rate pricing (**not** "live
    prices" — `USD_RATES` in `src/lib/cryptos.js` is an explicitly static
    table; the app's own UI discloses "Reference rate, not live market data"
    on every figure derived from it — the owner's original paste said "live
    asset prices," but the code doesn't support that wording, so don't use it
    externally).
  - Safety Plus — $5.99/mo or $49.99/yr. Everything in Free, plus two
    independent recovery paths (Personal Backup: 2-of-3 Shamir Secret Sharing;
    Personal Vault: password+PIN encrypted, stored in the user's own iCloud/
    Google Drive/OneDrive — Veyrnox has no access to either), transaction
    simulation, continuous anti-phishing, anomaly/drain alerts, spending
    controls, security dashboard, and coercion resistance (duress PIN, decoy
    wallet, stealth/hidden wallets, panic wipe). **These coercion-resistance
    and transaction-simulation features are Safety Plus-only** — confirmed
    against `SAFETY_PLUS_FEATURES` in `src/lib/tier.js`. Do not describe them
    as general/Free-tier capabilities in any listing.
  - AI Security Protection — $19.99/mo or $159.99/yr. Everything in Safety
    Plus, plus address threat screening, phishing-site detection, rule-based
    risk scoring, malicious-contract/drainer detection, token-approval
    review/monitoring, dApp/DEX warnings, an AI Security Advisor, and
    priority incident support. The AI layer is advisory only — it cannot
    sign transactions, hold keys, or act without the user's review.
- **Long description (corrected 2026-09-30 — see note above; the version used
  in the live AlternativeTo/SaaSHub submissions predates this fix):** Veyrnox
  is a self-custody multi-chain crypto wallet (ETH, BTC, SOL, MATIC, ARB, OP,
  AVAX, BNB, USDC, USDT — 10 assets across 8 networks). Keys are encrypted
  with AES-256-GCM and Argon2id, and bound to the device's Secure Enclave
  (iOS) or AndroidKeyStore/StrongBox (Android) — they never leave the device.
  WalletConnect v2 is supported. A paid Safety Plus tier adds coercion
  resistance (duress PIN opens a decoy wallet, stealth/hidden wallets conceal
  how many wallets exist, panic wipe destroys local key material) and
  pre-sign transaction simulation with address-poisoning and approval
  warnings. Fiat purchases go through Transak, which handles its own identity
  verification; Transak's webhook data (which can include the customer's
  email and address on some events) reaches Veyrnox's backend but is not
  logged.
- **Roadmap (do not present as shipped):** ~100 supported assets, plus swap
  and bridge capabilities.

## Owner-supplied canonical copy (2026-09-28)

Verbatim source-of-truth text from the owner, more detailed than the blocks
above — use this to resolve any conflict, and pull from it directly for any
listing that wants full tier breakdowns or a "what is Veyrnox" description:

> Veyrnox is a self custody wallet. Private keys remain encrypted on the
> user's device, and Veyrnox cannot hold funds, move assets or access the
> user's personal cloud account.
>
> The wallet currently supports ten assets across eight networks: Ethereum,
> Bitcoin, Solana, Polygon, Arbitrum, Optimism, Avalanche, BNB Chain, USDC and
> USDT.
>
> RASP means Runtime Application Self Protection. It monitors for conditions
> such as rooted or jailbroken devices, debugging, hooking, instrumentation
> and application tampering. Veyrnox can warn the user or prevent sensitive
> actions when the operating environment appears unsafe.
>
> Creating and using the wallet does not require Veyrnox to hold an account
> containing the user's keys. Paid subscriptions are processed through Apple
> or Google and can be cancelled through the relevant app-store subscription
> settings.

Full tier feature lists are folded into the Pricing bullet above rather than
duplicated here.

## Claims that must not appear

**Owner-confirmed 2026-09-28: no audit claims at all, anywhere, in any form —
lead with the security stack instead.** The long description above follows
this.

- **"Independently audited" / "third-party audited", in any form, anywhere.**
  The 2026-06-23 "ECC" audit (`docs/audit-triage/ecc-independent-audit-2026-06-23.md`)
  was 10 parallel `veyrnox-honest-reviewer` **Claude subagents** run by the project
  itself, not an external firm — it calls itself "independent" only because the
  two agent runs didn't share context with each other. CLAUDE.md's hard rules
  say plainly: "the independent third-party audit of the full stack remains
  outstanding." External copy must follow that line, not the audit doc's own
  self-label. KEK and RASP are internal-only on top of that. (I4: internal is
  never presented as independent.) Safe alternative: describe the security
  stack factually (AES-256-GCM, Argon2id, hardware-bound keys, RASP) without
  any audit claim.
- "Verified" for anything other than a real on-chain tx.
- "No telemetry / no analytics / no attribution tracking". Telemetry is
  consent-gated and a referral attribute exists. The Play draft in
  `docs/play-launch/store-listing.md` (lines ~120-121) says otherwise; treat
  those lines as needing an honesty review before reuse anywhere.
- "AI-powered wallet". Only the paid Security Advisor uses AI.
- Anything about Buy/Transak beyond what is live (owner-only area).
- **Unqualified coercion-resistance claims.** `docs/play-launch/store-listing.md`
  (~lines 107-116) carries limits the kit's Long description currently omits:
  Duress PIN is "runtime deniability — not hidden-volume storage; a forensic
  inspection of device storage can still reveal a second vault exists."
  Stealth wallets: "on-chain data stays public — anyone who knows one of your
  addresses can still see its balance and history." Panic Wipe: "protects the
  device, not the seed itself — a seed backup held elsewhere still recovers
  the wallet." Where space allows, carry at least one of these; where it
  doesn't (character-limited forms), don't claim more than the feature does.

## Fit triage (each row dated with when it was actually checked)

| Tier | Sites | Note |
|---|---|---|
| Good fit, no blocker | AlternativeTo (done, needs correction), SaaSHub (done, needs correction), FutureTools | AlternativeTo/SaaSHub both carry the pre-2026-09-30-fix Long description (see status note at top) — corrected text given to owner to paste in directly, automation hit a Cloudflare bot-check wall on AlternativeTo and a lost SaaSHub login session. FutureTools checked and filled 2026-09-30: futuretools.io/submit-a-tool, no login, no phone — all fields set (Tool Name "Veyrnox — AI Security Advisor", URL to the /ai-security-protection page, Paid, category Finance), blocked only by a Cloudflare "Verify you are human" checkbox the owner needs to solve themselves before Submit Tool |
| Skip — no fitting category | FinancesOnline | Checked and attempted 2026-09-28: the form itself is a plain lead-capture (Name/Product/Job title/Email/Website, no login, no phone), but its required Category dropdown has no cryptocurrency/wallet option anywhere — closest matches are "Free Security Software" and "IT Security Software", which would misdescribe Veyrnox as a business security tool. Owner chose to skip rather than force an inaccurate category. |
| Good fit, needs phone number | Crozdesk | Checked 2026-09-28. "Apply to list your software" routes to vendor.revleads.com/user/signup — really a RevLeads ad-network signup (required phone + "Monthly Marketing Budget", reads as a sales funnel). Owner supplied +447949467271 2026-09-30, same number a separate session had removed from the public Google Play developer profile two days earlier — owner confirmed reuse is fine, but flag before reusing it again elsewhere |
| Good fit, needs owner's own browser | TrustRadius, SaaSworthy | TrustRadius checked 2026-09-28: solutions.trustradius.com/claim-your-profile/ has a genuine "Claim My Free Profile" flow. SaaSworthy: vendor-portal registration in progress, owner was mid-signup |
| Good fit, blocked by a site-side bug (not bot detection) | Software Suggest | **Correction 2026-09-30:** the earlier "invisible bot-detection" theory was wrong — the real blocker was a required "By signing up you agree to Terms of Use" checkbox that isn't visible without scrolling and was missed on the first two attempts. Once checked, step 1 submitted fine (verification email sent to support@veyrnox.com) and step 2 (Name/Email/Org/Phone/Website/London/2-9 employees/500+ customers/Software type) filled and saved correctly. The actual current blocker: the required "Select Competitors" field calls `registerverifyvendor/getcategorywisecompetitors`, and that endpoint returns zero results for every term tried (MetaMask, Trust Wallet, Norton, "security", "a") across every security-adjacent category tested (Cyber Security id 844, Blockchain Security id 1896, Internet Security id 402) — a genuine site-side data/indexing gap, not something fixable by category choice. Recommend "Blockchain Security" (id 1896) over "Cyber Security" (id 844) once it works — more accurate for Veyrnox. Owner asked to retry later; not auto-scheduled. |
| Blocked by bot detection | G2, Capterra, GetApp, Software Advice | Checked 2026-09-28. G2 itself 403s headless browsing outright. Capterra's "Get Your Product Listed" and GetApp/Software Advice all route into g2.com/products/new (Capterra is explicitly "powered by G2 Digital Markets" now) — same domain, same block. Needs the owner's own logged-in browser session, not this automation |
| Environment issue | (affects any site needing a visible sign-in window) | 2026-09-30: gstack's `handoff` (visible browser) is broken on this machine — macOS XProtect kills the headed Chromium at launch (gstack issue #2554), not a simple permission prompt; clearing the quarantine xattr didn't help. Headless `$B` still works fine for everything that doesn't need a human sign-in/CAPTCHA step. Until fixed, any "needs owner's own browser" site means the owner opens it directly themselves, not via a handoff window |
| Wrong site entirely | GrowthList, ProductRank | Checked 2026-09-28. growthlist.co is a B2B lead-gen service selling lists of newly-funded startups to recruiters/agencies — the opposite direction, no "list your product" flow exists. ProductRank: `.io` is a paid ecommerce-AEO audit SaaS, `.ai` is a separate AI-visibility tracker, `.co` only appears in an 11-year-old Medium post — none is the directory this kit assumed |
| Skip — doesn't fit | Clutch, DesignRush | Checked 2026-09-28. Both are pure service-provider/agency directories (Development, IT Services, Marketing, Design, Business Services / "List Your Agency") — no software-product category exists on either site. Veyrnox is a product, not an agency |
| Weak fit, blocked | There's An AI For That, Toolify | Checked 2026-09-30. There's An AI For That: same Cloudflare bot-check wall as AlternativeTo, needs the owner's own browser. Toolify.ai: 403s outright |
| Weak fit, no self-serve path | Futurepedia | Checked 2026-09-30: editorially curated, not a form — "Update a Tool" is for already-listed tools only. Getting listed needs an actual outreach pitch via Contact Us, not a submission |
| Weak fit, unreachable/unresolved | AI Tool Hunt, AI Explorer | AI Tool Hunt times out consistently from here (checked twice, 2026-09-30) — try from the owner's own connection. AI Explorer: no confirmed domain, name too generic |
| Unverified | Summit.co, Magnus Asset, SaaS Directory | Confirm exact URLs before any work — "SaaS Directory" is too generic a name to know which site is meant |

## Tracker

| Site | Account (owner) | Submitted | Live URL | Notes |
|---|---|---|---|---|
| AlternativeTo | Yes (owner) | 2026-09-28 | Pending review (in queue) | Owner submitted; paid $15 for the "Human content review" add-on (their own Stripe checkout, order confirmed). Tags: cryptocurrency-wallet, bitcoin-wallet. Platforms: iPhone, Android with store links. Screenshots: 04/06/09 with captions. Full description expanded to the tier breakdown per owner request. |
| SaaSHub | Yes (owner) | 2026-09-28 | Pending approval (up to 32 days, Free tier) — **description needs correction, see status note** | Owner submitted on the Free plan — declined the pre-selected $75 Priority+ upsell (asked first). Categories: Cryptocurrency Wallets, Security & Privacy, Mobile Wallet, plus Cryptocurrencies/Crypto/Blockchain/Cyber Security/Security from a follow-up step. Competitors: MetaMask.io, Trust Wallet, Phantom, Ambire Wallet, Atomic Wallet, Exodus.io, MyEtherWallet, Unstoppable Wallet. Logo + 3 screenshots uploaded. Pricing tab filled (Free/Paid yes, no trial, USD 5.99/mo Safety Plus). Extended description filled (2000-char limit found by trial — first attempt at 2889 chars was rejected). Not verified — "Verified+" badge is bundled only in the paid $75 tier; declined. Crawler also surfaced a real LinkedIn company page (linkedin.com/company/veyrnoxwallet, ~5 followers) not found in the repo/site search earlier — worth checking directly next time, not just repo/llms.txt/site footer. 2026-09-30: automation lost the vendor-portal login session (re-login needs the broken handoff window) — owner to paste the corrected description in themselves. |
| FutureTools | Yes (owner) | not yet — form filled, blocked on CAPTCHA | | See fit-triage row above. Owner needs to solve the "Verify you are human" checkbox and click Submit Tool. |
| ProductRank | n/a — wrong site, see triage | | | |
| SaaSworthy | | | | Registration in progress since 2026-09-28, owner was mid-signup — status unconfirmed |
| SaaS Directory | n/a — URL not confirmed | | | |
| GrowthList | n/a — wrong site, see triage | | | |
| Software Suggest | Yes (vendor record created) | Step 1 done 2026-09-30 | Not live — blocked mid-flow | Verification email sent to support@veyrnox.com. Step 2 fields all set (2-9 employees, 500+ customers, Software, category Cyber Security — recommend switching to Blockchain Security id 1896 on retry). Blocked on the required Competitors field: `getcategorywisecompetitors` returns empty for every term/category tried — a site-side bug, not fixable here. Owner asked to retry later. |
| Crozdesk | | | | Owner supplied phone number 2026-09-30, not yet attempted — vendor.revleads.com/user/signup is really an ad-sales funnel, see fit-triage row |

Record the outcome in the session that learns it (a submission is not a listing).
