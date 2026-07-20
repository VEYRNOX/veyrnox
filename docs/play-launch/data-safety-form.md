# Google Play — Data Safety form (DRAFT for owner/counsel review)

> **This is a draft answer key for Play Console → App content → Data safety, not a legal
> deliverable.** The Data Safety form is a *self-declaration* under Google's Developer
> Programme Policies. A misstated answer is a policy strike and — for a wallet app —
> can trigger crypto-policy escalation. Every claim here is **cross-referenced to a
> specific file/line in the codebase** so the owner and counsel can verify before
> submission. Sections marked **⚠ OWNER-DECISION** need an explicit yes/no from the
> owner before this can be entered on the form.
>
> **How to use this file:**
> 1. Read every section; verify the cross-reference matches current code.
> 2. Answer every **⚠ OWNER-DECISION** flag.
> 3. Copy the "Play form field" quoted answers verbatim into the Play Console UI.
> 4. Retain this file as the audit trail for the answers submitted.
>
> **Scope:** Veyrnox as it exists on `main` at the time of this draft. If new egress
> surfaces are added (new API, new SDK, new attestation source), this file must be
> updated BEFORE submitting an app update with those changes, because the Data Safety
> form is versioned per release.

---

## Overview — the three yes/no gates

Play opens the form with three high-level questions. Answers derived from
`src/lib/entitlement.js` (I3 deniability chokepoint), the vault crypto model
(`src/wallet-core/vault.js`), and the panic-wipe implementation
(`src/wallet-core/panic.js`).

| Play question | Answer | Reasoning |
|---|---|---|
| Does your app collect or share any of the required user data types? | **Yes** | Wallet addresses, purchase receipts, and app-attestation payloads leave the device (see §§2–4 below). |
| Is all of the user data collected by your app encrypted in transit? | **Yes** | All egress uses HTTPS (`fetch`/`CapacitorHttp`) or WSS (WalletConnect relay). No unencrypted socket in production code. |
| Do you provide a way for users to request that their data be deleted? | **Yes** | Panic wipe (`src/wallet-core/panic.js`) destroys the local vault and residue keys irreversibly. On-chain history remains public regardless — an honest limit called out on the `TermsLegal` screen. No server-side user record exists to delete because there is no user account. |

---

## Section 2 — Data types collected

Play lists 14 top-level categories. For each: **collected?**, **shared with third
parties?**, **required or optional?**, **ephemeral or stored?**, **purpose**.

### 2.1 Personal info

**Answer: NOT COLLECTED.** No name, email, phone, address, race/ethnicity, political
or religious beliefs, sexual orientation, or other personal info is captured by the app.
There is no account, no signup — the seed IS the identity. Cross-reference: no
`setEmail`, `setDisplayName`, `setPhoneNumber`, or any user-attribute call in
`src/lib/purchases.js`; the RC SDK audit in CLAUDE.md §"RevenueCat SDK feature usage"
enumerates the deliberately-not-added SDK features.

### 2.2 Financial info

**Answer: COLLECTED — "Purchase history"** (Safety Plus IAP receipts) **and "Other
financial info"** (on-chain wallet addresses + balances queried from public chains).

| Sub-type | Collected? | Shared? | Required? | Ephemeral? | Purpose |
|---|---|---|---|---|---|
| User payment info (card, bank) | No — Play/Apple handle payment; the app never touches card details | — | — | — | — |
| Purchase history | **Yes** (Safety Plus IAP receipts via RevenueCat) | **Yes — with RevenueCat, Apple, Google** | Required (for the paid feature) | Stored (RC customer-info cache; server-side entitlement record) | **App functionality** (unlock Safety Plus features) |
| Credit score | No | — | — | — | — |
| Other financial info | **Yes** (wallet addresses + on-chain balances) | **Yes — with third-party RPC providers** (see §4) | Required (wallet is unusable without a chain read) | Ephemeral on server side (RPC providers don't persist per-request logs long-term) | **App functionality** (show balances, submit signed transactions) |

**Honest note:** Play defines "collected" as "your app transmits data off the user's
device," so a wallet address queried via a public RPC counts. Balances themselves are
returned FROM the third party, not sent TO them — but the address IS transmitted, so
this section applies. **Play form field:** *"App transmits wallet addresses to
third-party RPC endpoints to read the public on-chain state associated with those
addresses (balances, transaction history, gas prices). Balances and history are public
data on the blockchain and are not shared with the app operator."*

### 2.3 Health and fitness

**Answer: NOT COLLECTED.**

### 2.4 Messages

**Answer: NOT COLLECTED.** No SMS, email, or in-app messaging surface. WalletConnect
requests contain protocol-level session data, not user messages.

### 2.5 Photos and videos

**Answer: NOT COLLECTED.** QR scanner (`src/components/QRScanner.jsx`) uses the
camera to decode QR codes on-device via `jsQR`; **video frames are never persisted
or transmitted**. Only the decoded plain-text QR payload (typically a wallet
address or WalletConnect URI) is used inline, then discarded.

**⚠ OWNER-DECISION:** Play's rule is nuanced — "processed ephemerally on device" is
usually **not collected** on the form. Confirm this reading with counsel; the safest
public wording (belt-and-braces) is a mention in the store listing: *"The camera is
used only to decode QR codes in the Send flow; frames are processed on-device by the
`jsQR` library and are not stored or transmitted."*

### 2.6 Audio files

**Answer: COLLECTED — "Voice or sound recordings"**, but **⚠ OWNER-DECISION** on
how to declare because the mechanics are ambiguous.

| Sub-type | Collected? | Shared? | Required? | Ephemeral? | Purpose |
|---|---|---|---|---|---|
| Voice or sound recordings | **Yes** — mic is used by Voice Commands (`src/context/VoiceContext.jsx` via `@capacitor-community/speech-recognition`) | **Yes — with Google Speech Service** (the OS-level speech recognizer that ships on the device; audio leaves the app process to Google's service on Android) | **Optional** (Voice Commands is off by default and can be disabled entirely) | **Ephemeral** — Google's speech recognizer returns text back to the app and does not, per its own docs, persist the audio for later training when invoked by an app-level recognizer session | **App functionality** (voice navigation only — read-only navigation, never initiates or signs a transaction) |
| Music files | No | — | — | — | — |
| Other audio files | No | — | — | — | — |

**⚠ OWNER-DECISION 1:** Google Play's rule for the on-device SpeechRecognizer is:
if the recognizer is invoked via `SpeechRecognizer.startListening()` (as our plugin
does), Google's own docs previously described the audio as processed by Google's
speech service rather than stored — but the exact classification changed in the
2024 policy update. Ask counsel whether we should declare **"Shared with Google
Speech Service"** or the more conservative **"Shared with third-party speech
services"**. Draft language, safe bet: *"Audio is used only for real-time voice-
command recognition via the device's built-in speech recognizer (Google Speech
Service on Android). The app does not store audio; transcribed text is used only
to navigate the app and is discarded immediately after use. Voice Commands is
off by default and can be turned on or off at any time in Settings."*

**⚠ OWNER-DECISION 2 — RESOLVED FROM CODE:** Voice Commands defaults to OFF.
`src/context/VoiceContext.jsx:40` — `const [listening, setListening] = useState(false);`.
No auto-start on mount, no onboarding trigger to enable it. User must explicitly
tap the mic button (or navigate to `/voice-commands` and start a session).
Answer: **"Optional"** on the Play form is correct.

### 2.7 Files and docs

**Answer: NOT COLLECTED** by default. The encrypted personal backup export
(`src/wallet-core/vaultBackup.js`) writes a `.enc` file to the user-chosen
location on-device. The app does not automatically upload or share this file.

**⚠ OWNER-DECISION 3:** the `.enc` file is encrypted with a user-set passphrase.
If a user explicitly shares it (e.g. via the OS share sheet to iCloud/Drive/email),
that's the user's own action, not Play data collection by our app. Counsel should
confirm we don't need to declare this as "collected" — I read the rule as no, but
declaration decisions of this kind are the exact policy interpretation counsel
handles.

### 2.8 Calendar

**Answer: NOT COLLECTED.**

### 2.9 Contacts

**Answer: NOT COLLECTED.** The in-app address book (`src/pages/AddressBook.jsx`) is
a local store of user-labelled wallet addresses; it does NOT read the device's
Contacts. No `READ_CONTACTS` permission is declared in the manifest.

### 2.10 App activity

**Answer: COLLECTED — "In-app actions" and "Other user-generated content"**, both
required to make the app work.

| Sub-type | Collected? | Shared? | Required? | Ephemeral? | Purpose |
|---|---|---|---|---|---|
| App interactions | **Yes** — WalletConnect session events (approve/reject/expire) leave the app to the relay | **Yes — WalletConnect relay** (relay.walletconnect.com) | Required (WC is a core feature) | Ephemeral (relay is a message bus, not a store) | **App functionality** (WalletConnect protocol) |
| In-app search history | No — search is local-only | — | — | — | — |
| Installed apps | No — never queried | — | — | — | — |
| Other user-generated content | **Yes** — signed transactions are broadcast to public chains | **Yes — public blockchains + RPC providers** | Required (send is a core feature) | Stored on-chain **permanently** (public blockchain is by definition a permanent public record) | **App functionality** (send funds) |
| Other actions | No | — | — | — | — |

**Play form field for "Other user-generated content":** *"Users' signed transactions
are broadcast to public blockchains via third-party RPC endpoints and become part
of the public on-chain record. This is the intended and only way to send funds
from a self-custody wallet."*

### 2.11 Web browsing

**Answer: NOT COLLECTED.**

### 2.12 App info and performance

**Answer: COLLECTED — "Crash logs" is ⚠ OWNER-DECISION; diagnostics = No.**

| Sub-type | Collected? | Shared? | Required? | Ephemeral? | Purpose |
|---|---|---|---|---|---|
| Crash logs | **⚠ OWNER-DECISION** — see below | — | — | — | — |
| Diagnostics | **No** — no analytics SDK is wired (per RC audit) | — | — | — | — |
| Other app performance data | No | — | — | — | — |

**⚠ OWNER-DECISION 4 — RESOLVED FROM CODE:** No third-party crash SDK is present.
`grep -E "firebase|@sentry|bugsnag|crashlytics" package.json` returns empty. Manifest
also sets `android:allowBackup="false"` at `android/app/src/main/AndroidManifest.xml:5`.
Google's system-level ANR/crash reporter (out-of-app, OS-side) doesn't count as our
collection per Play's rule. **Answer: No for Crash logs collected and No for shared.**
Revisit if a future PR adds Sentry/Crashlytics/Bugsnag.

### 2.13 Device or other IDs

**Answer: ⚠ OWNER-DECISION** — depends on RevenueCat's default behavior.

The RevenueCat SDK, **by default**, generates a randomised anonymous App User ID
(the string that identifies purchases across sessions on the same install). Play
treats a stable app-generated ID that leaves the device as a **"Device or other
IDs"** collection.

- If we do **NOT** call `Purchases.collectDeviceIdentifiers()` (we don't — CLAUDE.md
  §"RevenueCat SDK feature usage" explicitly rules it out) and we do **NOT** call
  `Purchases.logIn(appUserId)` (we don't), the app still transmits RC's
  auto-generated random UUID with every purchase — which is a persistent identifier
  in Play's terms.

**Recommended answer** (safest, correct given SDK default behavior):

| Sub-type | Collected? | Shared? | Required? | Ephemeral? | Purpose |
|---|---|---|---|---|---|
| Device or other IDs | **Yes** — RevenueCat App User ID (randomly generated per install, not tied to any personal identifier) | **Yes — with RevenueCat, Apple, Google (Play Billing side)** | Required (RC uses it to key purchase records) | Stored (RC keeps a customer record keyed by this ID) | **App functionality** (link a purchase to the install so restore-purchases works) |

**⚠ OWNER-DECISION 5:** confirm counsel is comfortable declaring the RC App User
ID as a "Device or other ID." If counsel prefers to keep it out of that category
(arguing the ID is app-generated not device-derived), that's a defensible position
but Play reviewers sometimes push back. Safer to declare.

### 2.14 Contact info (deprecated)

Handled under 2.1.

---

## Section 3 — Security practices

### 3.1 Data encryption in transit

**Answer: Yes.** All egress in production code uses HTTPS or WSS. Cross-reference:
- `fetch()` / `CapacitorHttp` calls throughout `src/wallet-core/*/provider.js` —
  every configured RPC URL starts with `https://` (per grep of
  `src/wallet-core/rpcConfig.js`).
- WalletConnect relay: `wss://relay.walletconnect.com`.
- CoinGecko / Binance / CryptoCompare / OpenRouter / RevenueCat — all HTTPS.
- Play Integrity API — HTTPS (Google-hosted).

### 3.2 Committed to Play's Families Policy

**⚠ OWNER-DECISION 6:** wallets are typically NOT designed for children, so this
should be **No, my app is not designed for children**. Confirm target audience
declaration matches (see §4 of the Play Content Rating flow, separately).

### 3.3 Independent security review

**⚠ OWNER-DECISION 7 — CRITICAL PER CLAUDE.MD HARD RULES:** Play's optional
"Independent security review" attestation. Per CLAUDE.md hard rules, the
independent third-party security audit is **still outstanding**. Two options:

- **Answer NO** (do not attest to independent review). Honest, matches the current
  state, and consistent with the CLAUDE.md invariant that "Internal is never to be
  presented as independent." **Recommended.**
- **Answer YES** and cite the internal audits. **Do not do this** — misstating this
  is exactly the kind of dishonest scope claim I4 forbids.

### 3.4 Users can request data deletion

**Answer: Yes.** Panic Wipe irreversibly destroys the local vault and residue keys.
There is no server-side user record because there is no user account — so there is
nothing else to delete. Cross-reference: `src/wallet-core/panic.js`. Optional
supporting doc URL for Play: link to a public page describing the deletion process
(the honest coercion-limits note on the `TermsLegal` screen would fit).

**⚠ OWNER-DECISION 8:** does the app include a public URL Play can link to
describing the data deletion flow? If not, the answer is still Yes (Panic Wipe
exists), but Play's form has an optional "URL" field — could point at the same
`https://veyrnox.com/privacy` page or a dedicated `/data-deletion` page.

---

## Section 4 — Third parties data is shared with

Play doesn't list every recipient by name on the form, but the app's Data Safety
answers are only defensible if the answers here match the actual set of third
parties. Master list of **network destinations that receive data of any kind** in
production code:

| Recipient | Data transmitted | Purpose | Cross-reference |
|---|---|---|---|
| Third-party RPC endpoints (Alchemy, `publicnode.com` public RPCs, Solana RPCs, etc.) | Wallet addresses, contract calls, signed transactions | Chain reads + broadcast | `src/wallet-core/rpcConfig.js` (per-chain URLs, env-overridable) |
| Public block explorers linked from the UI (etherscan, bscscan, polygonscan, arbiscan, snowtrace, mempool.space, explorer.solana.com) | Only via user-tapped hyperlinks — no automatic egress | Deep-link to view txids/addresses | scattered across `src/pages/*` — the link is fetched by the OS browser, not the app |
| WalletConnect relay (`relay.walletconnect.com`) | Session proposal / signing request payloads | WalletConnect protocol | `src/lib/WalletConnectProvider.jsx` |
| Price feeds (`api.coingecko.com`, `api.binance.com`, `min-api.cryptocompare.com`) | Coin symbols only — NO wallet address or user identifier | Price display | `src/lib/coinGecko.js`, `src/lib/binance.js`, `src/lib/cryptoCompare.js` |
| RevenueCat (`api.revenuecat.com`) | RC App User ID + purchase receipts | Entitlement verification for Safety Plus | `src/lib/purchases.js` |
| Google Play Billing (via Play SDK, indirectly via RC) | Purchase receipts | Payment | Google Play Billing SDK |
| Google Play Integrity API | Attestation nonce + Play Integrity JWT | Runtime device integrity for RASP | `src/rasp/attestation.js`, `PlayIntegrityPlugin.kt` |
| OpenRouter (`openrouter.ai`) | News-summarisation prompts | News feed sentiment LLM call — **⚠ OWNER-DECISION 9:** confirm this is used in production or gated to dev; if gated, remove from list | `src/api/openrouterClient.js` |

**Not third-party recipients (deliberately not wired):**
- No analytics (no GA, Amplitude, Mixpanel, PostHog, Segment)
- No attribution SDKs (no Facebook, Adjust, AppsFlyer, Branch)
- No crash reporters (no Crashlytics, Sentry, Bugsnag) — **subject to ⚠4**
- No customer support SDKs (no Intercom, Zendesk, HubSpot)
- No push service beyond the Capacitor default local-notifications plugin (no OneSignal, Airship)

---

## Section 5 — Data collection is suppressed in decoy/hidden sessions

Important Play context — a wallet that ships coercion resistance handles a
decoy/hidden ("deniability") session state that must NEVER egress the same data as
the real session, or the deniability claim breaks. Cross-reference:
`src/lib/entitlement.js:17-33` (I3 chokepoint: `if (isDeniabilitySessionActive())
return 'free'` before any RC call), `src/lib/TierProvider.jsx:46-53` (SDK not
configured in deniability sessions), and every RPC/price provider file gates on
`isDeniabilityOrDemoActive()`.

This isn't a Play-form field, but it's context worth including in the store
listing description or the privacy policy page, because a Play reviewer looking
at "collects wallet addresses" WITHOUT knowing about the deniability gate might
assume the app collects real-wallet data during every session.

**Suggested one-liner** for the privacy policy page: *"When Veyrnox is in a
duress/decoy or hidden-wallet session, the app makes zero backend calls — no RPC
reads, no price fetches, no entitlement checks. This is not a display state; it
is enforced at every egress choke point in the code."*

---

## Section 6 — Follow-up checklist before submission

Owner tasks to complete before entering the answers on the Play Console form:

- [x] **⚠ OWNER-DECISION 1** — RESOLVED FROM CODE (2026-07-20): **Audio = collected, ephemeral, App functionality; processed by the OS speech service, never by Veyrnox.** iOS requests on-device recognition when the device/locale supports it — `VeyrnoxSpeechRecognitionPlugin.swift:150-151` sets `requiresOnDeviceRecognition = true` guarded by `recognizer.supportsOnDeviceRecognition` (falls back to Apple's own service otherwise). Android uses the platform `RecognizerIntent.ACTION_RECOGNIZE_SPEECH` dialog (no `EXTRA_PREFER_OFFLINE`), which on stock devices routes via Google's speech service — that is Google's processing, not Veyrnox's. **Veyrnox itself never persists or transmits audio:** `VoiceContext.jsx:56-80` receives only a transcript string and does local string-matching against `COMMANDS`; no network call, no storage beyond transient `lastCommand` state. `partialResults` defaults `false` (one-shot, not streaming). Feature defaults OFF (⚠2).
- [x] **⚠ OWNER-DECISION 2** — RESOLVED FROM CODE: Voice Commands defaults to OFF (`useState(false)`)
- [x] **⚠ OWNER-DECISION 3** — RESOLVED FROM CODE (2026-07-20): **No declaration needed — the `.enc` backup never leaves the device via app code.** `vaultBackup.js:297-333 downloadBackupFile`: Android writes locally via `FileSaver.saveToDownloads` (`:303-306`); iOS writes to `Directory.Cache` then invokes the OS **share sheet** (`Share.share`, `:311-324`) and deletes the temp file in `finally` (`:331`). Zero network primitives in the file (grep-confirmed). If a user chooses AirDrop/Cloud/Email from the share sheet, that is a **user-initiated OS action**, not transmission by Veyrnox, and does not require declaring a third-party recipient.
- [x] **⚠ OWNER-DECISION 4** — RESOLVED FROM CODE: no crash-log SDK; answer "No" for crash logs
- [x] **⚠ OWNER-DECISION 5** — RESOLVED FROM CODE (2026-07-20): **Declare "Device or other IDs" = YES (collected + shared).** `purchases.js:37 Purchases.configure()` causes the RevenueCat SDK to generate and persist an **anonymous app-generated user ID** that is transmitted with every purchase/customer-info call. No `logIn`/`logOut`/`setEmail`/`collectDeviceIdentifiers` are called. **⚠ NEW FINDING — reconcile with CLAUDE.md:** `setAttributes` **IS** now used — `purchases.js:100-105 setReferralAttribute()` sends a `referralCode` custom attribute to RevenueCat. CLAUDE.md's 2026-07-17 RC-audit list still records `setAttributes` under "explicitly NOT added" and is therefore **stale on this point**. No wallet address, seed, or balance is sent, but a referral code is a persistent attribution association and must be reflected here. Purpose: App functionality + Analytics (purchase attribution).
- [ ] **⚠ OWNER-DECISION 6** — Families Policy declaration (recommended: not designed for children) — **owner/counsel call, not code-resolvable**
- [x] **⚠ OWNER-DECISION 7** — **RESOLVED (2026-07-20): answer NO.** Play's optional "independent security review" attestation must be answered **No**. Per CLAUDE.md hard rules the independent third-party security audit remains **outstanding**; every audit to date is INTERNAL (Claude/Codex passes, internal static analysis), and "Internal is never to be presented as independent" (I4 honesty). Answering Yes would be a false attestation.
- [ ] **⚠ OWNER-DECISION 8** — public URL for data deletion documentation — **owner action** (needs a hosted page, e.g. `veyrnox.com/data-deletion`)
- [x] **⚠ OWNER-DECISION 9** — **RESOLVED (2026-07-20): do NOT declare `openrouter.ai`. The LLM feature ships DISABLED.** Verified against the actual signed release AAB (`app-release.aab`, built 2026-07-20 with `VITE_RELEASE=1`): **no OpenRouter key value is baked into the bundle** (searched for `sk-or-v1-…`, zero matches), `VITE_OPENROUTER_API_KEY` is **absent from `.env.local`**, **absent from the shell env**, and **never referenced by any CI workflow** (`.github/workflows/*.yml` — no matches); `.env.example:73` carries only an empty placeholder. The code is hard-gated: `openrouterClient.js:16` `const API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY \|\| ''` → `:20` `OPENROUTER_AVAILABLE = !!API_KEY` → `false`, and `:29` throws `'OpenRouter API key not configured'` before any `fetch`. The `openrouter.ai` URL string is present in the bundle (client code ships) but is unreachable without a key, so **no data can be transmitted**. Prompt content would be safe even if enabled: `NewsSentimentPage.jsx:55` sends a static generic market-sentiment prompt with **no interpolated user data** (no wallet address, balance, tx data, or identifiers); headers carry only `HTTP-Referer: veyrnox.com` / `X-Title`. I3 fail-closed guard also present (`openrouterClient.js:24-28`).
  > **⚠ CONDITION — this answer is only valid while the key stays unset.** If `VITE_OPENROUTER_API_KEY` is ever added (to `.env.local`, a CI secret, or any release build config), the feature activates and `openrouter.ai` **must** then be declared as a third party — category **App activity**, purpose App functionality. Re-verify this before each submission (Data Safety is versioned per release).
- [ ] Counsel review of §§2.1–2.14 answers before pasting into Play Console
- [ ] Re-verify this file matches shipping `main` on the day of submission (Data Safety is versioned per release)
- [ ] **Follow-up (docs honesty):** update CLAUDE.md's RC-audit "explicitly NOT added" list — `setAttributes` is now used by `setReferralAttribute` (see ⚠5)

---

## Version and provenance

- **Drafted:** 2026-07-17
- **Updated:** 2026-07-20 — resolved ⚠1, ⚠3, ⚠5, ⚠7, ⚠9 from code/hard-rules
  (6 of 9 owner-decisions now code-grounded, up from 2; ⚠9 verified against the signed
  release AAB — LLM ships disabled, conditional on the key staying unset). Surfaced a CLAUDE.md staleness:
  `setAttributes` IS now used (`setReferralAttribute`) contrary to the RC-audit
  "explicitly NOT added" list — affects the Device-IDs declaration (⚠5).
- **Draft author:** Claude (grounded in code, not a lawyer)
- **Reviewer required:** owner + counsel
- **Superseded by:** the next update to this file if the app adds a new egress
  surface, a new third-party SDK, or a new user-data category
- **Corresponds to:** `main` at the SHA of this commit
