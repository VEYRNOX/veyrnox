# veyrnox.com/privacy — corrections needed (2026-07-26)

The live page is **not** as stale as `CLAUDE.md` claims. It already says
"Last updated: 23 July 2026" and already discloses usage events. The
"dated 16 June / no analytics or tracking" note in `CLAUDE.md` is wrong and
should be deleted.

What the page *does* need: it mirrors the **pre-consent** in-app policy. Since
2026-07-26 the app is opt-in with a permanent Settings toggle, and it sends
more events than the seven listed. Four edits below.

---

## 1. Section 9 — replace the body

**Currently reads:**

> The app does record a small number of anonymous usage events on our own
> infrastructure, so we can tell how many people set up a wallet and which
> features are actually used.
>
> Each event contains only three things: the name of the action, the time it
> happened, and a randomly generated install identifier. […] it disappears when
> you delete the app or clear its storage.
>
> The events we record are: a wallet was created / a wallet was imported / a
> backup was confirmed / a session was started / the receive screen was opened,
> and for which asset / a send completed, and for which asset / a WalletConnect
> session was approved

**Replace with:**

> **These events are opt-in.** We ask once, when you first set up or unlock a
> wallet, and nothing is sent unless you choose "Help improve Veyrnox". If you
> decline, no event is sent and no install identifier is even created. You can
> change your mind at any time in **Settings → Privacy**; switching it off stops
> all of it immediately.
>
> If you opt in, the app records a small number of anonymous usage events on our
> own infrastructure, so we can tell how many people finish setting up a wallet
> and which features are actually used.
>
> Each event contains the name of the action, the time it happened, a randomly
> generated install identifier, and — for some events — a small piece of
> context, such as which asset a screen was opened for or which step of a flow
> was reached. That identifier is created on your device the first time it is
> needed. It is not your advertising ID, not your Apple or Google ID, and not
> derived from any hardware identifier. It is never linked to your name, email,
> wallet, or addresses, and it is removed when you delete the app, clear its
> storage, or run a panic wipe.
>
> The events we record are:
>
> - a wallet was created, imported, or finished setting up
> - a backup was confirmed
> - a session was started
> - the receive screen was opened, and for which asset
> - funds arrived for the first time — the fact of it, never the amount
> - a send was started, reached a given step, was abandoned, or completed, and
>   for which asset
> - a WalletConnect session was approved
> - a subscription prompt was shown, dismissed, or accepted
> - a referral code was applied, and the code itself
> - your browser is missing the secure-context or cryptography features the app
>   needs
> - that you granted these permissions

**Keep unchanged** the two paragraphs that follow ("What is never included…" and
"What is never sent at all…"), but extend the first one:

> What is never included: wallet addresses, balances, amounts, transaction
> hashes, seed phrases, recovery data, contacts, location, IP-derived location,
> or anything identifying you. **Balances and amounts are excluded with no
> exception — not bucketed, not rounded, not sent at all.**

---

## 2. Section 2 — "What We Don't Collect"

**Currently:** "…and no profiling of you or your holdings. We do record a small
set of anonymous product-usage events — see section 9."

**Change to:** "…and no profiling of you or your holdings. **If you opt in**, we
record a small set of anonymous product-usage events — see section 9."

---

## 3. Section 4 — "Retention & Deletion"

**Currently:** "Apart from the anonymous usage events described in section 9, we
hold no personal data…"

**Change to:** "Apart from the anonymous usage events described in section 9 —
**which exist only if you opted in** — we hold no personal data…"

---

## 4. Section 6 — "Your Rights"

**Currently:** "Deleting the app removes the install identifier from your
device, after which no further events can be associated with that install."

**Change to:** "**Turning the setting off in Settings → Privacy stops any further
events immediately.** Deleting the app, clearing its storage, **or running a
panic wipe** removes the install identifier from your device, after which no
further events can be associated with that install."

---

## Then

Bump "Last updated" to **26 July 2026**, matching the in-app policy.

## Why each claim above is safe to publish

Every line is checked against shipped code on `fix/branch-review-2026-07-26`:

| Claim | Backed by |
|---|---|
| opt-in; declining sends nothing | consent gate in `src/api/trackEvent.js` (the single egress chokepoint) |
| declining mints no identifier | `TelemetryConsent.jsx` no longer calls `trackEvent` on denial |
| Settings → Privacy exists | toggle added to `src/pages/Settings.jsx` |
| balances never sent | `useFirstInbound` no longer passes `{ balance }` |
| panic wipe clears the identifier | `veyrnox-device-id` added to `panic.js` residue list |
| the event list | every wired `trackEvent`/`emit` call site |

The referral-code line is deliberate: `referralAttribution.js` sends the code,
so it has to be disclosed while that remains true.
