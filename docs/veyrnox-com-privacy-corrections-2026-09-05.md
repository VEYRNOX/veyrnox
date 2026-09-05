# veyrnox.com/privacy — corrections and additions, 2026-09-05

**Purpose:** paste-ready copy for the veyrnox.com CMS. This repo does NOT hold the
site source (the site is served by uvicorn on Render behind Cloudflare; the body
is client-rendered so `curl` shows only the SEO shell — locate the CMS before
editing). This file is what to paste into it, section by section.

**Precedent:** `docs/veyrnox-com-privacy-corrections-2026-07-26.md` did the same
job for the July telemetry consent update. Follow the same workflow: paste, bump
the "Last updated" date, verify by rendering the live page (NOT curl), commit
this doc as the record of what was intended.

**Live policy verified 2026-09-05 by rendering** (title `Privacy Policy | VEYRNOX
Wallet`, last-updated line on the page not visible in the current copy — check
before pasting). Sections numbered against the currently-rendered structure:
1 Model, 2 What We Don't Collect, 3 What Stays On Your Device, 4 Retention &
Deletion, 5 Security, 6 Your Rights, 7 Children's Privacy, 8 Third-Party
Networks, 9 Product Usage & Diagnostics, 10 Website Cookies & Tracking, 11
Changes, 12 Contact.

---

## Why these changes

Four disclosure gaps against the currently-shipped product:

1. **RevenueCat.** Safety Plus IAP subscriptions route through RevenueCat, which
   holds a `rc_user_id` per subscriber. The current policy claims "no user
   database" without qualification; RC is a user database for subscribers.
2. **Transak.** The Buy flow (US$-to-crypto on-ramp) hands off to Transak, which
   performs KYC. That's real personal data leaving the wallet's zero-collection
   envelope the moment a user taps Buy. Not currently named.
3. **WalletConnect relay.** Session metadata (dApp name, chain, pubkey) traverses
   reown's relay servers. §8's "public blockchain RPC nodes and price feeds"
   list does not cover it.
4. **TIP chat (Security Advisor AI).** User-initiated dApp/transaction advice
   flows through Supabase Edge Function → Cloudflare Worker → Workers AI. LLM
   inference on user context; not identifying by itself but a distinct
   processing chain that deserves a line.

And one addition tied to a specific ship gate:

5. **Bug-report screen recording.** Not shipped yet — `VITE_BUG_REPORT_ENABLED`
   is default OFF. The copy below MUST be live on veyrnox.com/privacy AND on the
   in-app privacy screen AND on the Play Data Safety / Apple App Privacy forms
   BEFORE Slice 3 flips the flag (see `docs/bug-report-recording-plan.md` for
   the full design). A reviewer comparing the three surfaces cannot find
   contradictions.

---

## Section 2 — What We Don't Collect

**REPLACE the first bullet:**

> • No account or sign-up in the wallet itself. You don't register with VEYRNOX
>   to use the wallet, and we never ask for a name or password to hold your
>   funds. Two optional features do involve a third-party account you already
>   have: buying crypto with a card (Transak) and paying for the Safety Plus
>   subscription (RevenueCat via Apple or Google). See section 8.

Rationale: the current bullet says "you don't register" full stop. That is not
technically true if a user has ever bought via Transak or subscribed via Apple/
Play — those flows involve third-party accounts even though we don't run one.

---

## Section 4 — Retention & Deletion

**INSERT after the current paragraph, before "To erase your VEYRNOX data":**

> If you sent a bug report (section 11), the encrypted recording is stored on
> our Supabase instance in the EU for 30 days, or until we close the support
> ticket you attached it to, whichever is first. We cannot decrypt a recording
> without a physically separated offline device.
>
> If you have paid for Safety Plus, RevenueCat holds a subscriber record tied
> to your Apple or Google purchase identifier. Deleting the app does not cancel
> your subscription — cancel it in Apple ID → Subscriptions or Google Play →
> Subscriptions. RevenueCat's own retention policy applies.

---

## Section 8 — Third-Party Networks

**REPLACE the current single paragraph with three:**

> To show balances and broadcast transactions, the app connects to public
> blockchain RPC nodes and price feeds. These requests are necessary to use a
> blockchain. They are not used to build a profile of you, and we do not attach
> your identity to them. Those providers operate under their own policies.
>
> To connect to decentralised apps ("dApps") using WalletConnect, session
> metadata (dApp name, chain, and the public address you approve for a session)
> traverses the WalletConnect relay operated by Reown. Contents of individual
> signing requests are end-to-end encrypted between your device and the dApp
> and are not readable by the relay. Reown operates under its own privacy
> policy.
>
> If you use the Security Advisor to ask about a dApp or transaction, the
> question and the transaction context you sent go through our own Supabase
> Edge Function and Cloudflare Worker, and are answered by an AI model
> (Cloudflare Workers AI). We do not store your questions server-side. We do
> not attach your identity or wallet addresses to them, and we do not train
> models on them. Cloudflare and its model providers operate under their own
> policies.
>
> Two optional features hand off to third parties that hold their own account
> for you:
>
> • **Buying crypto (Transak).** If you tap Buy, we hand off to Transak's
>   hosted flow. Transak performs identity verification (KYC), collects the
>   personal data required by financial regulations in your jurisdiction, and
>   processes card payments. VEYRNOX does not receive that personal data;
>   Transak sends the purchased crypto to the wallet address your device
>   provides at the time you press Continue. Transak operates under its own
>   privacy policy.
>
> • **Safety Plus subscription (RevenueCat).** If you subscribe to Safety
>   Plus, the purchase goes through Apple's App Store or Google Play. We use
>   RevenueCat to track your entitlement across devices. RevenueCat holds a
>   subscriber record identified by an Apple or Google purchase identifier —
>   never linked to your wallet address, seed phrase, or in-app activity. We
>   do not send RevenueCat any wallet data. Cancel the subscription in your
>   Apple ID or Google Play account. Apple, Google, and RevenueCat operate
>   under their own policies.

---

## Section 9 — Product Usage & Diagnostics

**No structural change; verified accurate as of 2026-09-05 (matches shipped
`api/trackEvent.js`).** The five event groups, opt-in gate, install identifier
description, decoy/demo suppression, and 4 KB per-event cap are all correct.

**Add ONE line to "What is never included":** insert `, screen contents,` after
`amounts` so the list reads `wallet addresses, balances, amounts, screen
contents, transaction hashes, seed phrases…`. This is a defensive
clarification; the current shipped telemetry does not send screen contents, and
adding this line makes it clear that the bug-report screen recording described
in section 11 is a separate, opt-in-per-report mechanism — NOT a subset of
routine diagnostics.

---

## NEW Section 11 — Bug reports (opt-in, per-report)

**Insert BEFORE the current "Changes to This Policy" section (renumber
following sections).**

> ## 11. Bug Reports
>
> These recordings are opt-in per report. Nothing is captured or uploaded
> unless you tap "Report a problem" in Settings, confirm the explainer, start
> a recording, watch it back, and tap Send.
>
> If you tap "Report a problem", the app can record up to 30 seconds of your
> screen. Before capture starts, we show you an explainer describing what will
> be captured. Nothing is recorded until you tap Start. Nothing is uploaded
> until you have watched the clip back and tapped Send.
>
> **Sensitive screens are excluded.** The following screens cannot be recorded
> and will automatically stop a recording in progress: your seed phrase,
> seed-phrase verification and backup, PIN entry, unlock, wallet setup,
> transaction confirmation and signing, WalletConnect approval and signing,
> and any decoy, duress, stealth, or panic-wipe flow. Adding a new screen
> requires an explicit change to our allowlist — new screens are never
> recordable by default.
>
> **End-to-end encrypted to a device we keep offline.** Recordings are
> encrypted on your device to a key whose private half lives on a support
> device that is never connected to the internet. To view a recording, our
> support team physically transfers the encrypted file to that device. No one
> at VEYRNOX can decrypt a recording from an online machine.
>
> **What we store with the recording.** A random report identifier generated
> for that single report (not linked to the install identifier from section
> 9), the app version, the platform (iOS or Android), the upload time, and
> any text description you typed. The description is encrypted alongside the
> video and is not readable server-side.
>
> **What we never store.** IP addresses (stripped at our edge before the
> request reaches storage), your wallet addresses or balances, seed material,
> or any correlation between a bug report and the telemetry install identifier
> in section 9.
>
> **Retention.** 30 days, or until we close the support ticket you attached
> the report to, whichever is first.
>
> **In a decoy, duress, or demo session, the "Report a problem" entry is not
> shown at all.** The recording mechanism is fully disabled in those sessions.

---

## Section 10 — Website Cookies & Tracking

**No change.** Current copy (Google Tag Manager + Reddit advertising pixel with
a consent banner) is accurate.

---

## Section 12 (currently) — Contact Us

**No copy change**, but renumber to §13 if the bug-report section is inserted
as §11.

---

## Post-paste checklist

- [ ] Bump "Last updated" date on the live page
- [ ] Render the page (NOT curl — SPA) and verify all sections show
- [ ] Diff against this file to confirm nothing was lost in paste
- [ ] Cross-check in-app privacy screen matches the new §8 and (once shipped)
      §11 copy
- [ ] Cross-check Play Data Safety form (`docs/play-launch/data-safety-form.md`)
      declares WalletConnect + Transak + RevenueCat + (once shipped) bug-report
      screen recording
- [ ] Cross-check Apple App Privacy declarations match
- [ ] Section 11 bug-report copy MUST NOT be pasted until
      `VITE_BUG_REPORT_ENABLED` is flipped on for the same build that ships to
      users. Pasting it earlier promises a feature users do not have.

## What this file does NOT commit to

- Whether the CMS is Contentful / Sanity / a static markdown file on Render /
  a Django admin — you find that when you go to paste.
- The exact "Last updated" date to write — depends on when the paste happens.
- Whether §11 lands in the SAME paste as §2/§4/§8 or a later paste after
  Slice 3 — that's a scheduling call. Sections 2/4/8 correct existing
  disclosure gaps and can land any time; §11 is timing-locked to the flag flip.
