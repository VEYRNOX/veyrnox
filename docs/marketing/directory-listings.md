# Directory listings: kit and tracker

Status: DRAFT. Nothing has been submitted. Accounts are created and owned by the
owner; every submission is confirmed with the owner before the submit button.

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
    WalletConnect + QR pairing, live prices.
  - Safety Plus — $5.99/mo or $49.99/yr. Everything in Free, plus two
    independent recovery paths (Personal Backup: 2-of-3 Shamir Secret Sharing;
    Personal Vault: password+PIN encrypted, stored in the user's own iCloud/
    Google Drive/OneDrive — Veyrnox has no access to either), transaction
    simulation, continuous anti-phishing, anomaly/drain alerts, spending
    controls, security dashboard, and coercion resistance (decoy wallet,
    duress PIN).
  - AI Security Protection — $19.99/mo or $159.99/yr. Everything in Safety
    Plus, plus address threat screening, phishing-site detection, rule-based
    risk scoring, malicious-contract/drainer detection, token-approval
    review/monitoring, dApp/DEX warnings, an AI Security Advisor, and
    priority incident support. The AI layer is advisory only — it cannot
    sign transactions, hold keys, or act without the user's review.
- **Long description:** Veyrnox is a self-custody multi-chain crypto wallet
  (ETH, BTC, SOL, MATIC, ARB, OP, AVAX, BNB, USDC, USDT — 10 assets across 8
  networks) built for coercion resistance. A duress PIN opens a separate decoy
  wallet, hidden wallets conceal how many wallets exist, and a panic wipe
  destroys local key material. Keys are encrypted with AES-256-GCM and
  Argon2id, and bound to the device's Secure Enclave (iOS) or
  AndroidKeyStore/StrongBox (Android) — they never leave the device.
  Transactions are simulated locally before signing, with address-poisoning
  and approval warnings. WalletConnect v2 is supported. Fiat purchases go
  through Transak, which handles its own identity verification; Veyrnox never
  receives the customer's identity or card details from that flow.
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

## Fit triage (from memory; verify each site's current rules on submission)

| Tier | Sites | Note |
|---|---|---|
| Good fit | AlternativeTo, SaaSHub, ProductRank, SaaSworthy, SaaS Directory, GrowthList, Software Suggest, Crozdesk | Product submission forms |
| Low fit | G2, Capterra / GetApp / Software Advice (one Gartner vendor form), TrustRadius, FinancesOnline | B2B software oriented; check for a crypto-wallet category. No incentivised reviews |
| Weak fit | There's An AI For That, Futurepedia, Toolify, FutureTools, AI Tool Hunt, AI Explorer | Only as "AI security advisor for wallets" |
| Skip | Clutch, DesignRush | Agency directories |
| Unverified | Summit.co, Magnus Asset | Confirm URLs before any work |

## Tracker

| Site | Account (owner) | Submitted | Live URL | Notes |
|---|---|---|---|---|
| AlternativeTo | Yes (owner) | 2026-09-28 | Pending review (in queue) | Owner submitted; paid $15 for the "Human content review" add-on (their own Stripe checkout, order confirmed). Tags: cryptocurrency-wallet, bitcoin-wallet. Platforms: iPhone, Android with store links. Screenshots: 04/06/09 with captions. Full description expanded to the tier breakdown per owner request. |
| SaaSHub | | | | |
| ProductRank | | | | |
| SaaSworthy | | | | |
| SaaS Directory | | | | |
| GrowthList | | | | |
| Software Suggest | | | | |
| Crozdesk | | | | |

Record the outcome in the session that learns it (a submission is not a listing).
