# veyrnox.com legal corrections — 2026-09-07

Paste-ready copy for the four site-side findings from the 2026-09-06 audit. Same shape as
`docs/veyrnox-com-privacy-corrections-2026-09-05.md`: the site source is **not in this
repo** (uvicorn on Render behind Cloudflare, body client-rendered), so this is the only
lever available from here.

The app-side half is already fixed in code — see the PR that adds this file.

> **Verify by rendering, not `curl`.** veyrnox.com is a client-rendered SPA; `curl`
> returns the nav/SEO shell and gives false negatives on every claim below.

---

## 1. Data Deletion page — describes a procedure that does not exist

**Priority: highest.** A user can follow this page today and believe their key material
was destroyed when it was not.

### What the page says

> Go to **Settings → Delete wallet**. Confirm with biometrics. This will:
> • Zeroise the device shard in your secure enclave
> • Delete the cloud shard from your iCloud or Google Drive

### What the code does

| Claim | Reality |
|---|---|
| "Settings → Delete wallet" | The control is **"Remove wallet"** (`src/i18n/locales/en/wallet.json:684`) |
| "…zeroise the device shard" | `Settings.jsx:141`: Remove wallet *"clears the local entity cache; destroying key material is **Panic Wipe**"* |
| "Delete the cloud shard from your iCloud or Google Drive" | **No cloud-shard deletion path exists.** `git grep -inE 'delete.*shard\|shard.*delete\|revokeShard'` over `src` returns nothing. `PersonalBackup.jsx` is a user-driven `veyrnox.enc` file export — the app cannot reach into Drive to delete a file the user put there |

The **"8-digit PIN"** line on that page is **correct** — `pinStrength.js:19
MIN_PIN_LENGTH = 8`, and `/^\d{8}$/` in `panic.js`, `vaultBackup.js`,
`RestoreFromShares.jsx`. Leave it alone.

### Replacement copy

> ### How to delete your wallet
>
> Wallet deletion happens entirely from inside the app. Two controls do different
> things, and the difference matters:
>
> **Remove wallet** (Settings) takes a wallet out of the app on this device. It clears
> the local record of it. It does **not** destroy the encrypted key material.
>
> **Panic wipe** is what destroys key material. It erases the encrypted vault and the
> hardware-bound key that protects it, so the wallet cannot be recovered on this device
> by any means.
>
> If you have exported an encrypted backup file (`veyrnox.enc`) to Files, iCloud, Google
> Drive, or anywhere else, **you must delete those copies yourself.** Veyrnox has no
> access to your cloud storage and cannot remove them for you. A backup file plus its
> password is enough to restore the wallet, so leaving one behind leaves the wallet
> recoverable.
>
> After a panic wipe and the removal of any backup files you made, the wallet is
> unrecoverable. Transfer any funds out first — there is no support ticket, backup, or
> recovery method that can restore it. That is the trade-off of true self-custody.

---

## 2. Refund Policy — predates the product it has to cover

**Priority: high, and it is a commercial/legal exposure, not a wording nit.**

Dated 24 July 2026. Says *"there is no purchase price, subscription, or recurring fee"*
and *"Optional premium features (**if and when introduced**) will be governed by a
separate subscription agreement"*.

Safety Plus is **live**: `safety_plus_monthly_v2` and `safety_plus_annual` are both
`APPROVED` by Apple, and there is an active paying subscriber. The policy treats
subscriptions as hypothetical while money is being taken.

### Replacement for §2 ("No Charge for the Wallet Software")

> ### 2. The wallet is free. Subscriptions are not.
>
> The Veyrnox wallet is free to download and use. There is no purchase price for the
> core wallet software, and nothing to refund for it.
>
> **Safety Plus** is a paid subscription, billed by Apple or Google, not by Veyrnox.
> Because the store takes the payment, **the store handles the refund** — we cannot
> issue, approve, or refuse one on their behalf.
>
> - **App Store:** request a refund at reportaproblem.apple.com, or Settings → your name
>   → Media & Purchases → View Account → Purchase History. Apple's own refund policy and
>   time limits apply.
> - **Google Play:** request a refund in Google Play → Menu → Subscriptions, or at
>   play.google.com/store/account. Google's refund window applies.
>
> Cancelling stops future charges; it does not automatically refund the current period.
> Deleting the app does **not** cancel a subscription — cancel it in your Apple ID or
> Google Play account.
>
> If a store declines a refund and you believe that is wrong, write to
> support@veyrnox.com and we will look at it, but the final decision rests with the
> store that processed the payment.

**Also:** the Data Deletion page mentions *"AI Security Protection billing"*. That tier is
`READY_TO_SUBMIT` on Apple, not purchasable. Either drop the mention or mark it as not yet
available.

---

## 3. Privacy §8 — the Advisor paragraph overstates and under-discloses

Two corrections in one paragraph.

**Overstates:** *"the question and the transaction context you sent"*. The page snapshot
was cut at the egress boundary on 2026-09-05 (PR #2349). The wire now carries the current
screen name and the selected chain, nothing else about wallet state.

**Under-discloses:** *"we do not attach your identity or wallet addresses to them"*. Every
advisor call carries `device_id` — the same persistent install identifier used for usage
events (`SecurityAdvisor.jsx:1387`). It is not a name, but it is durable and per-install,
and the sentence as written implies nothing of the kind is attached. Separately, the local
scrubber removes recovery phrases, private keys and PIN-shaped digits but **not wallet
addresses**, so an address typed into the chat is transmitted.

### Replacement

> If you use the Security Advisor, the question you type goes through our own Supabase
> Edge Function and Cloudflare Worker and is answered by an AI model (Cloudflare Workers
> AI). Alongside it we send exactly two things about your session: the screen you are on
> and the chain you have selected. We do not send balances, your wallet address, or your
> wallet's state.
>
> Each request also carries the same random install identifier described in section 9,
> used only to enforce a per-device daily limit on questions. It is not linked to your
> name, wallet, or addresses, and it is removed when you delete the app, clear its
> storage, or run a panic wipe.
>
> Before a message leaves your device a local scrubber removes recovery phrases, private
> keys, and PIN-shaped digits. It does **not** remove wallet addresses — if you paste an
> address into the chat, that address is sent, and it may also be checked against the
> screening sources described below. We do not store your questions server-side, we do
> not attach your identity to them, and we do not train models on them. Cloudflare and
> its model providers operate under their own policies.

---

## 4. Privacy — no recipient-address screening section at all

The in-app policy gained a dedicated section for this on 2026-09-06 (PR #2362, corrected
2026-09-07). The website has none — and this is the one feature where a **wallet address
leaves the device**, so it is the disclosure most worth having.

The site's Data Deletion page does mention *"Threat intelligence queries (AI Security
Protection only), anonymised address … lookups"*. The tier gate is **correct**
(`SendCrypto.jsx:858` → `hasAdvisorOnlineAccess(currentTier)`), but **"anonymised" is
wrong**: the recipient address is sent in full.

### New section, to sit after §8

> ### Recipient address screening (Send)
>
> Before you send crypto, the app can check the recipient address against public
> sanctions lists, known phishing registries, hack-fund trackers, and contract-risk
> signals, so you get a warning if the address is a known bad actor. **This online check
> runs only on the paid AI Security Protection tier.** On every other tier the send
> screen uses a locally-cached, signed blocklist and nothing leaves the device.
>
> When the online check runs, what is sent to our proxy is: the recipient address, the
> chain, the token or contract address when you are sending a token, the amount, the
> transaction's call data, and — on Solana only — the unsigned transaction, so the
> aggregators can simulate it. The address is sent in full; it is not anonymised or
> hashed. **Your own wallet address is never sent** — a fixed all-zero address is sent in
> its place, so the check cannot be tied back to you.
>
> If no source can answer, the app says "unknown" rather than "clean". A missing check
> never quietly becomes a green light.
>
> In decoy (duress) sessions and in demo mode no address ever leaves the device: the
> locally-cached signed blocklist is used instead, so screening still runs but makes no
> network call of this kind.

---

## After publishing

Bump **Last updated** on each page touched. The in-app policy is now dated
**7 September 2026**; the site's privacy page was 5 September and should not claim a date
later than the content it actually carries.

Cross-check that no remaining site page repeats the corrected claims — the Data Deletion
page in particular restates the Advisor and screening behaviour in its own words.
