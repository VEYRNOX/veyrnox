# Base44 privacy-policy handoff — veyrnox.com/privacy (2026-08-12)

Base44 hosts `veyrnox.com`. The privacy page currently mirrors the in-app policy
as of 2026-07-23. Since then, the app's telemetry surface has grown from ~10
events to 40+ (mostly onboarding/funnel/diagnostic instrumentation) and the
July corrections doc (`docs/veyrnox-com-privacy-corrections-2026-07-26.md`) is
now materially incomplete. This document supersedes it.

Send this whole file to Base44. Every claim below is grounded in code and
cited to file path — the "Backed by" table at the end lists the exact source.

---

## What Base44 needs to change

Bump **"Last updated"** to **12 August 2026** and apply the four edits below.

### 1. Section 9 — replace the body

**Replace with (verbatim):**

> **These events are opt-in.** We ask once, when you first set up or unlock a
> wallet, and nothing is sent unless you choose "Help improve Veyrnox". If you
> decline, no event is sent and no install identifier is even created. You can
> change your mind at any time in **Settings → Privacy**; switching it off
> stops all of it immediately.
>
> If you opt in, the app records anonymous usage events on our own
> infrastructure (Supabase, EU region) so we can tell how many people finish
> setting up a wallet, which features are used, and where the app fails.
>
> Each event contains the name of the action, the time it happened, a randomly
> generated install identifier, and — for some events — a small piece of
> context, such as which asset a screen was opened for, which step of a flow
> was reached, or which trigger showed a prompt. That identifier is created on
> your device the first time it is needed. It is not your advertising ID, not
> your Apple or Google ID, and not derived from any hardware identifier. It is
> never linked to your name, email, wallet, or addresses, and it is removed
> when you delete the app, clear its storage, or run a panic wipe.
>
> The events we record fall into five groups:
>
> **Setup and lifecycle**
> - a wallet was created, imported, or finished setting up
> - a seed phrase was generated, revealed, or its backup was acknowledged
> - your seed-phrase verification was started, attempted, passed, failed,
>   deferred, or resumed
> - a lock method (PIN, biometric) was set
> - an unlock was attempted, and whether it succeeded
> - a session was started, and whether you were returning
> - your consent choice (granted or denied) — a denial is recorded locally and
>   never transmitted
>
> **Use of features**
> - the receive screen was opened, and for which asset
> - funds arrived for the first time — the fact of it, never the amount
> - a send flow was started, reached a given step, was abandoned, or completed,
>   and for which asset
> - a WalletConnect session was approved, and dApp-connect attempts and their
>   results
>
> **Subscriptions and referrals**
> - a subscription prompt was shown, dismissed, or accepted, and which trigger
>   showed it
> - a referral code was applied, the code itself, and whether you typed it in
>   or came in through a link
>
> **Security signals (aggregate, not identifying)**
> - your device signalled tampering (root/jailbreak indicators, debugger,
>   emulator markers) — the fact of the signal, never device identifiers
> - a security modal was shown to you
> - a hardware-key unwrap failed on your device
>
> **Diagnostics**
> - your browser is missing the secure-context or cryptography features the
>   app needs
> - the fact that you granted these permissions
>
> **What is never included:** wallet addresses, balances, amounts, transaction
> hashes, seed phrases, recovery data, contacts, location, IP-derived
> location, or anything identifying you. **Balances and amounts are excluded
> with no exception — not bucketed, not rounded, not sent at all.**
>
> **What is never sent at all:** if you use a decoy, duress, or demo session,
> no event of any kind is transmitted from that session, regardless of your
> consent setting.

### 2. Section 2 — "What We Don't Collect"

Change: "…and no profiling of you or your holdings. We do record a small set
of anonymous product-usage events — see section 9."

**To:** "…and no profiling of you or your holdings. **If you opt in**, we
record anonymous product-usage and diagnostic events — see section 9."

### 3. Section 4 — "Retention & Deletion"

Change: "Apart from the anonymous usage events described in section 9, we
hold no personal data…"

**To:** "Apart from the anonymous usage events described in section 9 —
**which exist only if you opted in** — we hold no personal data. Those events
are stored on our own Supabase instance in the EU. Rate limits, dedup keys,
and the 4 KB per-event size cap are enforced server-side."

### 4. Section 6 — "Your Rights"

Change: "Deleting the app removes the install identifier from your device,
after which no further events can be associated with that install."

**To:** "**Turning the setting off in Settings → Privacy stops any further
events immediately.** Deleting the app, clearing its storage, **or running a
panic wipe** removes the install identifier from your device, after which no
further events can be associated with that install."

---

## Backed by (for Base44's legal/compliance reviewer)

Every publishable claim above is grounded in shipped code as of commit
`main` on 2026-08-12:

| Claim | Source of truth |
|---|---|
| Opt-in; declining sends nothing | `src/api/trackEvent.js:41` — single egress chokepoint, `hasConsent()` gate |
| Declining mints no identifier | `src/api/trackEvent.js:42` — `getOrCreateDeviceId()` runs only after consent check |
| Settings → Privacy toggle exists | `src/pages/Settings.jsx` (Privacy switch) + `src/lib/consent.js` (setConsent/clearConsent) |
| Balances/amounts never sent | Full event enum at `src/api/trackEvent.js:57-102` — no balance/amount field on any event; `SEND_COMPLETED` sends `{ currency }` only |
| No addresses sent | Same enum; `RECEIVE_VIEWED` sends `{ asset }` symbol, not address |
| Panic wipe clears identifier | `veyrnox-device-id` in `ALL_RESIDUE_KEYS` (`src/lib/panic.js`) |
| Decoy/demo transmits nothing | `src/api/trackEvent.js:23` — `DEMO || isDeniabilityOrDemoActive()` early return |
| Decoy/demo cannot mutate consent | `src/lib/consent.js:44,53` — `setConsent()` and `clearConsent()` NO-OP in decoy/demo |
| Server-side rate limits + 4 KB cap | `sql/api-security-hardening.sql` (`track_event()` 60/device/hour) + `sql/telemetry-events-allowlist.sql` (event allowlist + 4 KB cap) |
| EU region | Supabase project `nszlbcmcysftwyudthjz` (staging) + `jwstkrtslotnjyerzzsi` (production), both EU |
| Referral code IS transmitted | `src/lib/referralAttribution.js:23` — sends `{ code, source: 'deep_link' \| 'manual_entry' }` |
| Full event allowlist | `src/api/trackEvent.js:57-103` (EVENT enum) — this is the complete, enforced list; anything else is rejected client-side AND server-side |

## Complete event allowlist (for Base44's reference — do NOT paste into
the public policy verbatim; the section 9 replacement above is the public
version)

```
wallet_created            wallet_imported             wallet_ready
session_start             backup_confirmed
seed_generated            seed_revealed               seed_backup_acknowledged
seed_verify_started       seed_verify_attempt         seed_verify_passed
seed_verify_failed        seed_verify_deferred        seed_verify_resumed
lock_method_set           unlock_attempt              unlock_result
consent_granted           consent_denied
receive_viewed            receive_address_viewed      first_receive_shown
first_inbound_detected
send_flow_started         send_step_reached           send_abandoned
send_completed            first_send
wc_session_approved       dapp_connect_start          dapp_connect_result
paywall_shown             paywall_dismissed           paywall_converted
referral_code_applied
first_open                onboarding_start            custody_path_chosen
crypto_diagnostics        tamper_signal               security_modal_shown
kek_unwrap_failed
```

Total: 40 events. Enforced by `Set<string>` at `src/api/trackEvent.js:107` +
Postgres allowlist in `sql/telemetry-events-allowlist.sql`.

## What Base44 should NOT change

- The two paragraphs following section 9's body ("What is never included…"
  and "What is never sent at all…") — the replacement above already includes
  the updated versions. Do not add them a second time.
- The "Last updated" format — keep the existing D Month YYYY style.
- The section numbering.
- Anything in sections 1, 3, 5, 7, 8, 10+ — no changes required.

## Deployment note for Base44

`veyrnox.com` is served by uvicorn on Render behind Cloudflare with a
client-rendered body. `curl` returns only the SEO shell — verify the deployed
change by loading the page in a browser, not by fetching the HTML source.
