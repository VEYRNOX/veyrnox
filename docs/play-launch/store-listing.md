# Google Play — Store listing (DRAFT for owner review)

> **Copy-paste-ready draft of every text field in Play Console → Store presence →
> Main store listing.** Each field has: (1) a **paste block** with the exact text to
> use, (2) a **character count** vs Play's limit, (3) the **reasoning** behind the
> wording. Every product claim is grounded in the codebase and cross-referenced.
>
> **How to use:**
> 1. Read every field's paste block + reasoning.
> 2. Resolve the **⚠ OWNER-DECISION** items at the bottom.
> 3. Paste each field into Play Console.
> 4. This file is the audit trail for what was submitted.
>
> **Scope:** targets Play's crypto-wallet policy review. The wording is deliberately
> honest about the coercion features' limits so a Play reviewer reading it doesn't
> flag an overclaim — the same honest-scope discipline CLAUDE.md's hard rules
> require for the code.

---

## Field 1 — App name

**Play limit:** 30 characters. **Draft:**

```
Veyrnox
```

**Count:** 7/30. Matches [capacitor.config.json](capacitor.config.json) `appName`.
No suffix, no tagline in the name (Play penalizes name-stuffing).

---

## Field 2 — Short description

**Play limit:** 80 characters. Shown at the top of the store listing and in search
results. Highest-impact single line on the whole listing.

**Recommended draft:**

```
Self-custody crypto wallet. Your keys stay on your device. Coercion-resistant.
```

**Count:** 77/80. Three claims, each defensible:
- *"Self-custody"* — no server-side custody, seed IS the identity
  (`docs/Feature-Status.md` §2 wallet core; no user-account backend)
- *"Your keys stay on your device"* — vault is AES-256-GCM behind Argon2id + Hardware
  KEK (Secure Enclave on iOS, StrongBox on Android); keys never leave the device
  (I1 invariant, [CLAUDE.md § Security invariants](CLAUDE.md))
- *"Coercion-resistant"* — Duress PIN, Stealth wallets, Panic Wipe
  ([src/wallet-core/duress.js](src/wallet-core/duress.js),
  [src/wallet-core/stealth.js](src/wallet-core/stealth.js),
  [src/wallet-core/panic.js](src/wallet-core/panic.js))

**Alternatives (if the owner wants a different angle):**
- `Self-custody wallet — 10 assets, hardware-backed keys, on-device only.` (66)
- `Multi-chain self-custody wallet with duress, stealth & panic wipe.` (65)
- `Your keys, on your device. Multi-chain, hardware-backed, no account.` (67)

---

## Field 3 — Full description

**Play limit:** 4,000 characters. This is what Play reviewers read most closely on
a crypto app.

**Recommended draft** (word-for-word paste block below the reasoning):

**Structure notes**
- Opens with what the app IS (not a hook / not a promise). Play reviewers dislike
  crypto listings that sound like ads for investment products.
- Lists supported assets by name — proves multi-chain support isn't just hype.
- Names the security stack in terms Play's reviewers know (Secure Enclave,
  StrongBox, BiometricPrompt, WebAuthn).
- Names the coercion features WITH their honest limits, matching the TermsLegal
  screen. This is the crypto-policy-friendly framing.
- Says explicitly what the app does NOT do (no account, no telemetry, no ads).
- Discloses that the seed is the user's own responsibility. Play's crypto policy
  cares about this.

**Paste block:**

```
Veyrnox is a self-custody crypto wallet built for people who take their own
security seriously. Your seed phrase is generated on your device and never
leaves it. There is no account to sign up for, no server holding your keys,
and no way for us to freeze, recover, or spend on your behalf.

Supported assets (10, all mainnet-live)
Ethereum (ETH), Bitcoin (BTC), Solana (SOL), Polygon (MATIC), Arbitrum (ARB),
Optimism (OP), Avalanche (AVAX), BNB Chain (BNB), USD Coin (USDC), and Tether
(USDT). Send, receive, and view live balances and transaction history for
each chain.

Security you can inspect
- Keys held in an encrypted vault: AES-256-GCM behind Argon2id + a hardware
  key on iOS (Secure Enclave) and Android (StrongBox / TEE).
- Biometric unlock and biometric two-factor at critical actions (Face ID,
  Touch ID, fingerprint) via the OS's own BiometricPrompt.
- WebAuthn passkey support on web; hardware wallet support (Trezor) for
  cold-signing.
- Runtime integrity checks (RASP): root, jailbreak, hook, emulator, and Play
  Integrity attestation — signing is refused when the device is compromised.
- Encrypted personal backup export (opt-in) for off-device seed portability.

Coercion resistance — with honest limits
- Duress PIN: if you're forced to unlock the app, entering a decoy PIN opens
  a decoy wallet instead of your real one. Runtime deniability — not
  hidden-volume storage. A forensic inspection of device storage can still
  reveal a second vault exists.
- Stealth (hidden) wallets: hide a wallet inside the app. On-chain data
  stays public — anyone who knows one of your addresses can still see its
  balance and history on a block explorer.
- Panic Wipe: destroys the local device copy of your wallet irreversibly.
  Protects the device, not the seed itself — a seed backup held elsewhere
  still recovers the wallet, and on-chain history remains public.

What Veyrnox is not
- No account, no email, no phone number, no signup.
- No wallet analytics, no ad SDKs, no attribution tracking.
- Not an investment platform, not a broker, not a custodian. Veyrnox does
  not offer, endorse, or advise on any investment.
- Not financial advice. Cryptocurrency values are volatile; you can lose
  everything you send.

Safety Plus — optional
Everything above is free. Safety Plus is an optional monthly ($5.99/mo) or
annual ($49.99/yr) subscription that unlocks advanced analytics, on-chain
portfolio insights, transaction simulation, address-poisoning warnings,
and other power-user features. You can manage or cancel your subscription
from within the app or from the Play Store subscription settings.

Your seed is your responsibility
Because Veyrnox never sees your keys, we cannot recover your wallet if you
lose your seed phrase. Please back it up somewhere safe and never share it.
Anyone with your seed can move your funds.

Privacy
Privacy policy: https://veyrnox.com/privacy
```

**Count:** 2,608 chars / 4,000 limit — leaves room for regional wording tweaks
without hitting the ceiling.

**⚠ OWNER-DECISION 1:** Play often wants a version-history / "What's new" mini-block
at the bottom. The current draft omits it; add a short "Version 1.0.2 — the annual
Safety Plus plan is here" line if you want. Keep it short.

---

## Field 4 — App category

**Draft:** **Finance**

Play's Finance category is where wallets and payment apps live. Sub-tag will be
auto-assigned by Play (typically "Wallet" or "Cryptocurrency"). Do NOT pick
"Business" or "Productivity" — the mismatch is a soft policy signal.

---

## Field 5 — Tags

**Not manually set.** Play chooses these from the category. Typical tags for a
Finance / Wallet app: `Wallet`, `Crypto`, `Bitcoin`, `Ethereum`, `Blockchain`.

---

## Field 6 — Contact details

**Draft:**

- **Email:** **⚠ OWNER-DECISION 2** — supply a monitored support email. Play
  requires a real address. Suggestion: `support@veyrnox.com` (matches the App
  Store Connect tester email used for the 2026-07-15 sandbox purchase).
- **Website:** `https://veyrnox.com`
- **Phone:** optional and NOT recommended for a self-custody wallet (a public phone
  number invites social-engineering support scams).

---

## Field 7 — Privacy policy URL

**Draft:**

```
https://veyrnox.com/privacy
```

Wired in the app by PR #1187 (LandingPage footer + TermsLegal in-app section).
**⚠ OWNER-DECISION 3:** confirm this page is publicly resolvable BEFORE clicking
submit — Play does a live fetch on the URL during review. A 404 or an unstyled
placeholder page is a soft rejection.

---

## Field 8 — Financial products declaration (crypto-specific)

Play Console → App content → Financial features has a specific declaration for
crypto/blockchain apps. The relevant sub-questions:

**"Does your app offer cryptocurrency-related financial features?"** → **Yes**

**Sub-declarations:**
- **Cryptocurrency exchange:** **No** — Veyrnox does not swap, trade, or exchange
  crypto within the app. Users send and receive existing crypto; any exchange
  happens through the underlying chain / an external service the user chooses.
- **Custodial cryptocurrency wallet:** **No** — Veyrnox is non-custodial.
  User seed is stored on-device only.
- **Non-custodial cryptocurrency wallet:** **Yes** — this is the correct category.
- **Cryptocurrency mining:** **No.**
- **Cryptocurrency initial coin offering (ICO):** **No.**

**⚠ OWNER-DECISION 4:** confirm none of the Safety Plus features cross into
"exchange" or "trading" territory. Advanced analytics, on-chain portfolio views,
and address-book features do not; if a future release ever adds an in-app swap,
this declaration flips.

---

## Assets NOT drafted in this file (need running app)

Play's store listing form also requires the following, which need a running app
on an Android emulator or device — so this waits for Sunday-on-Mac:

- **App icon** — 512 × 512 PNG, 32-bit, transparent-background not allowed
- **Feature graphic** — 1024 × 500 PNG or JPG
- **Phone screenshots** — 2 to 8, minimum 320 px on shortest side. Recommend 6:
  - Onboarding / vault-created screen
  - Home / balances view
  - Send flow with a QR-scanner-open preview
  - WalletConnect approval sheet
  - Security dashboard (RASP integrity clean state)
  - Duress PIN setup (honest-limits screen visible)
- **Tablet screenshots** — optional but Play encourages
- **Promo video** — optional; skip for the first release

**⚠ OWNER-DECISION 5:** decide the six screenshots on Sunday when the app runs on
device. Each screenshot text field on Play Console has a caption — I can draft
captions from the same honesty scope as the description once the images exist.

---

## Content rating (separate IARC form)

Not this doc's field, but the answers driven by the content of this listing:

- **Age category:** likely 12+ (financial content). ⚠ OWNER-DECISION.
- **Violence / sexual content / language:** all No.
- **Simulated gambling:** No.
- **Digital purchases (IAP):** Yes.
- **Location sharing:** No.
- **User-generated content:** No.

---

## ⚠ OWNER-DECISION consolidated checklist

- [ ] **1.** "What's new" mini-block at the bottom of the full description?
- [ ] **2.** Confirm the support email (`support@veyrnox.com` or another)
- [ ] **3.** Verify `https://veyrnox.com/privacy` returns a public, styled page
- [ ] **4.** Confirm no Safety Plus feature crosses into "exchange" or "trading"
- [ ] **5.** Screenshots + captions on Sunday when the app runs on device
- [ ] **6.** IARC age category (recommend 12+ for financial content)
- [ ] **7.** Confirm regional availability (Play defaults to worldwide; some
       regions restrict crypto apps — owner-decision on which markets to enable)

---

## Version and provenance

- **Drafted:** 2026-07-17
- **Draft author:** Claude (grounded in code and CLAUDE.md; not a marketing writer
  and not counsel)
- **Reviewer required:** owner (marketing + counsel voice)
- **Superseded by:** the next update to this file if the shipping feature list
  changes or the coercion features' honest limits are re-worded
- **Corresponds to:** `main` at the SHA of this commit
