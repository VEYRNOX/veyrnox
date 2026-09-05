# Bug-report recording — design plan

Status: **TARGET / HONEST-DISABLED**. Design frozen 2026-09-05. Owner-approved for
1.0.2 (NOT 1.0.1 — hold remains in effect for 1.0.1). Foundations (this slice) may
land during 1.0.1 because they have zero runtime effect.

This document is the contract every slice must satisfy. If a slice deviates, this
doc gets amended in the same PR — not the other way round.

## Purpose

Let a user record a 30-second clip of what they were doing, review it, and send it
to support with a bug report. The mechanism is deliberately narrower than
session-replay analytics: user-triggered, short, previewable, and
end-to-end-encrypted to a support key held OFFLINE.

## Why this design is different from session replay

A wallet cannot ship session replay:

- Recording the seed-reveal screen captures the seed as pixels — I1 (keys never
  leave the device) becomes false.
- Recording PIN entry captures the PIN by tap coordinates + timing — reversible.
- Automatic recording in a decoy/duress session proves a hidden wallet exists — I3.
- Continuous recording is silent egress — I2.

Every design decision below trades a "nice-to-have" against one of those four
consequences, and picks the invariant.

## Invariants this design enforces

| Invariant | Enforced by |
|---|---|
| I1 (keys stay on device) | Fail-closed route allowlist — seed/PIN routes CANNOT be reached during a recording. |
| I2 (no silent egress) | Recording is user-initiated, previewable, and only uploaded on a second explicit confirm. |
| I3 (deniability = zero backend) | UI hidden, native bridge no-ops, upload RPC rejects in decoy/demo. |
| I4 (fail closed) | Every gate defaults DENY: missing route entry = no recording; missing flag = no recording; unknown session type = no recording. |
| I5 (backend untrusted) | Video is E2E-encrypted client-side to a support keypair whose private half is held OFFLINE. |

## Known conflict with existing security controls (added 2026-09-05, slice 2b)

**Android FLAG_SECURE (M13, MainActivity.java).** The window carries
`WindowManager.LayoutParams.FLAG_SECURE` window-wide, which blocks
OS-level screenshots + screen recording. MediaProjection cannot
capture a `FLAG_SECURE` surface — a recording made with the flag on
comes back as black frames.

Slice 2b's `BugReportPlugin.setSecureFlag(enabled)` gives Slice 2c the
coordination hook. Rules Slice 2c MUST enforce:
- On enter recording state: `setSecureFlag(false)`
- On any terminal state (stop, abort, close, kill switches, JS unmount):
  `setSecureFlag(true)` BEFORE releasing the recorder
- On route kill switch fired: `setSecureFlag(true)` first, then abort
- NEVER call `setSecureFlag(false)` from a decoy/demo session (I3 — a
  coerced tap must not disable the seized-device screenshot guard)

Never leave FLAG_SECURE cleared after a recording ends — it is the
window-wide guarantee against seized-device screenshotting.

**RASP interaction (both platforms).** `RaspIntegrityPlugin` (Android
+ iOS) treats an active MediaProjection / ReplayKit broadcast as a
tamper signal. For the bug-report path this is EXPECTED. Slice 2c/2d
must notify RASP of a legitimate recording window so RASP does not
raise its own indicator.

## Non-goals

- Automatic screen recording on crash. (Would fail Apple 5.1.1(i) — consent
  before capture.)
- Continuous session replay. (Would fail I2.)
- Microphone or camera capture. (Not needed; adds two permission surfaces.)
- Analytics correlation. (Reports use a fresh random ID per report, NOT the
  telemetry device ID.)
- In-app redaction UI. (Skipped for v1 — user deletes and re-records if a
  screen slipped.)
- AI transcription or summarisation of captured video. (Adds a processing
  purpose that would need declaring.)

## Composed gates (all must return true, otherwise no recording)

Mirrors the `useBuyEnabled()` pattern in `src/lib/buyEnabled.js`.

1. **Ship gate:** `VITE_BUG_REPORT_ENABLED === '1'` — load-time constant. Default
   OFF. Flipped ON only in the specific build train whose store disclosures
   declare screen capture.
2. **Deniability gate:** `!isDeniabilityOrDemoActive()`. In decoy/duress/stealth
   or demo, the Settings entry is hidden AND the native bridge no-ops.
3. **Platform gate:** native platform only (iOS or Android). Web returns
   `capabilityAvailable=false`; the button is hidden.
4. **Route gate (per-frame during recording):** current route must be in the
   allowlist AND must not be in the denylist. Route change into a denied route
   during recording → abort + wipe buffer.

## Route allowlist (design)

Both lists are hardcoded in `src/lib/bugReport/recordableRoutes.js`. Adding a
route requires an explicit line change. New routes default to DENIED — a route
not in the allowlist cannot be recorded.

> **Corrected 2026-09-05.** The lists below originally named routes this app
> does not have. Of 24 literals only 3 were real, and **all 16 denylist entries
> matched zero routes** — `/pin`, `/seed`, `/wc`, `/decoy`, `/settings/wipe` and
> the rest are not paths in `src/App.jsx`. Nothing was exploitable, because a
> denylist of phantoms behind an allowlist of phantoms fails closed, but the
> denylist would have stopped nothing the moment Slice 1b made the allowlist
> real. The segment-boundary rule made it worse rather than better: a naive
> `startsWith` would have caught `/duress-pin` under `/duress`; requiring
> `prefix + '/'` means it does not.
>
> Every entry below is now a path declared in `src/App.jsx`, and
> `routesMatchRouter.test.js` fails if that stops being true. **Do not add a
> route to either list without checking it against the router** — the previous
> lists, the module and its tests were all consistent with each other and none
> of them was consistent with the app.

**The allowlist is EXACT-match. The denylist is PREFIX-match.** The asymmetry is
deliberate: broad matching in the deny direction fails safe, broad matching in
the allow direction is how an unreviewed route becomes recordable. A subroute of
an allowed route is a new route, and new routes default to DENIED.

This replaced "`/settings` (top level and all subroutes)" on 2026-09-05. Prefix
allow-matching meant any future `/settings/<x>` would become recordable the
moment it was added, silently — contradicting the default-deny promise directly
above. The design tried to contain that with a `/settings/wipe` denylist entry,
which is not a route. Exact matching removes the hazard rather than re-guarding
it, and costs nothing today because every entry is a leaf route.

**Allowlist (recording MAY happen if user has consented on these routes):**

- `/` — Dashboard
- `/receive` — address display page
- `/settings` — **DECIDED 2026-09-05: stays recordable.** See below.
- `/plans`
- `/docs` — the Documentation page. Replaces the design's `/help` and
  `/documentation`, neither of which exists. `/features` redirects here.

### `/settings` — the decision

It was flagged for re-decision because the design's only guard for it was a
phantom. Resolved in favour of keeping it, on three grounds:

1. **The coercion concern is absent.** Settings renders no duress, stealth or
   panic state; those pages are separate routes and all three are denied. It
   does not even link to them. The rehearsal row is deliberately built to
   disclose nothing — *"must read as ordinary — no wallet/set count, no
   multi-set hint, no 'decoy' wording"* (`RehearsalSettingsRow.jsx`).
2. **What it does render is posture booleans** — KEK enrolled, biometric on, 2FA
   on. The #2256 Advisor review judged exactly these non-coercion-relevant in
   the same breath as removing `duress_configured` and `stealth_pool_present`.
   Same threat model, same answer.
3. **Denying it would break the feature, not narrow it.** The bug-report button
   lives in Settings, and `useRouteKillSwitch` aborts immediately when armed on
   a denied route — every recording would abort the instant it started.

**Residual, stated rather than hidden.** `WhitelistManager` renders inline on
Settings and lists counterparty addresses. That is a real disclosure to support.
It is the same class the design already accepted for `/receive` (the address QR)
and `/` (balances), and the accepted v1 mitigation applies: no in-app redaction,
the user previews and re-records if a sensitive detail lands in frame. Denying
`/settings` over a weaker disclosure than one already allowlisted would be
incoherent. If v1 redaction is reconsidered, `WhitelistManager` is the first
candidate.

**`/send` is not recordable, and cannot be split today.** The design wanted
`/send/form` recordable with `/send/confirm` and `/send/sign` denied. Those are
not routes: `SendCrypto.jsx` is a single `/send` route and the confirm and sign
steps are component state inside it, so the gate has no path to distinguish
them. `/send` is therefore denied whole — stricter than the design asked for.
Splitting `SendCrypto` into real subroutes is the prerequisite for recording the
amount form; until then, denying the route is the honest option.

**Denylist (prefix-matched; recording is ALWAYS aborted on these routes, and
deny wins over allow on any overlap):**

Seed and backup material:
- `/wallet-seed-qr` — the seed on screen as a QR
- `/verify` — seed-word verification quiz
- `/personal-backup` — shard export + passphrase entry
- `/onboarding/*` — covers `/onboarding/restore-shares`
- `/hd-wallet` — derivation paths / account tree

Coercion configuration:
- `/duress-pin`, `/stealth-wallets`, `/panic-wipe`
- `/wallet-access` — PIN reset / recovery

Signing and money movement:
- `/send` (see above), `/crypto-signing`
- `/walletconnect`, `/connect` — pairing, session approval, signing

Authentication posture:
- `/biometric-auth`, `/hardware-wallet`

Dev-only:
- `/dev/*` — covers `/dev/prf-spike`

Denylist wins on any conflict. Missing route = DENIED (I4).

## UI flow

1. **Settings → "Report a problem"** button. Hidden entirely when the composed
   gate returns false.
2. **Explainer sheet** (before any capture starts): "This will record your
   screen for up to 30 seconds. The recording stays on your device until you
   review it and choose to send. It is encrypted so only support can view it.
   Sensitive screens (seed, PIN, signing) will pause recording automatically."
   Buttons: "Continue" / "Cancel".
3. **Consent + start**: 3-2-1 countdown so the user isn't caught mid-thought.
   "Start Recording" button. Also required by Apple 5.1.1(i) — consent BEFORE
   capture starts.
4. **During recording**: persistent floating REC pill with elapsed timer and
   prominent "STOP" button. On iOS the system-level ReplayKit red status bar
   also shows. On Android we render an in-app overlay (no OS-level equivalent).
5. **Playback + confirm**: plays back the clip. Buttons: "Send", "Delete and
   try again", "Cancel". The user MUST watch or scrub before "Send" enables.
6. **Sent**: ticket ID shown for the user to reference in email to support.

## Kill switches (recording aborts + buffer wiped, no upload)

- `visibilitychange` → document hidden
- App-lock event
- Panic-wipe event
- Route change into a denied route
- Route change out of the allowlist
- 30-second hard cap
- User taps STOP

## Encryption model (zero-knowledge)

**Model:** asymmetric, sealed-box-equivalent. Implemented via the crypto
stack Veyrnox already ships (`@noble/curves` x25519 + `@noble/hashes`
HKDF-SHA256 + WebCrypto AES-256-GCM) rather than libsodium — same security
properties, no new dependency to audit. See
[`src/lib/bugReport/encrypt.js`](../src/lib/bugReport/encrypt.js) for the
wire format and the placeholder-key refuse.

The construction: fresh ephemeral x25519 keypair per encrypt(), ECDH
against the support public key baked into the app binary, HKDF-SHA256 to
an AES-256-GCM key (info string binds the derivation to the specific
ephemeral pk so envelopes cannot cross-decrypt), authenticated encryption
with a random 12-byte IV per envelope. The corresponding recipient
PRIVATE key is held on an offline signing device — never on any
internet-connected support laptop.

The design doc previously named libsodium `crypto_box_seal`. That is a
mechanism, not a security property — the property we want is "sender
anonymous, recipient key offline, authenticated encryption". The @noble
construction delivers that with zero new deps. Kept the "sealed box"
naming in prose because it is the recognisable name for the pattern.

**Client per-report ephemeral:** generated fresh for every report, discarded
immediately after encryption. Nothing persistent, nothing correlatable to a
device.

**What support sees without decrypting:** ciphertext blob, size, upload
timestamp, ticket ID, app version, platform, optional user-typed description.
**Nothing else** — no device ID join, no wallet address, no IP correlation with
telemetry.

**Decrypt flow (offline):** analyst downloads ciphertext, transfers to the
offline device (SD card / USB), decrypts there, watches on that device. Video
never enters the online network in plaintext.

**Trade-off honestly stated:** analyst UX is worse than "click video, watch in
browser". That is the point — the cost is on us, not on the user's privacy.

## Metadata sent with the report

**Included:**

- App version, build number, platform (`ios`/`android`)
- Fresh random UUID `report_id` — NOT the telemetry device ID
- Upload timestamp (server-side clock)
- User's optional free-text description (client-encrypted with the video, NOT
  stored plaintext server-side)

**Excluded:**

- `veyrnox-device-id` (would join reports to funnel telemetry — no)
- Wallet address, count, balance
- Any seed / key / PIN material (route gate should already prevent this class
  of data reaching the buffer)
- IP: stripped at Cloudflare Pages edge; NOT logged server-side (any log line
  correlating an IP with a `report_id` re-opens I2)

## Storage & rate limits

- Supabase Storage bucket: `bug-reports`
- RLS: only `service_role` reads/writes; the anon key never touches this bucket
- Client uploads via signed URL from SECURITY DEFINER RPC
  `create_bug_report_upload(p_size_bytes bigint, p_report_id uuid, p_client_meta jsonb)`
- Rate limit: 3 reports per device per 24h (per fresh random device ID that
  the RPC caller supplies — a client could rotate to bypass, but the total
  bucket cap below limits blast radius)
- Total bucket cap: 500 MB rolling; oldest reports auto-purge above the cap
- TTL: 30 days after upload, or 7 days after ticket close (whichever first) —
  Supabase cron job

## Store disclosures (must be amended BEFORE the flag flips)

**Play Data Safety:**

- Add "App activity → App interactions" as **user-triggered**, optional,
  encrypted in transit, encrypted at rest, deletable on request
- Prominent-disclosure copy in the in-app explainer sheet quotes the sensitive-
  permissions form language directly

**Apple App Privacy:**

- Add "Diagnostics → Crash Data" and "Diagnostics → Performance Data" as
  **linked to identity: no**, **used for tracking: no**
- App Privacy Details section additionally explains "user-initiated screen
  recording for bug reports; recordings are encrypted end-to-end so Apple is
  not a data-collection party"

**Neither is session-replay:** both stores treat user-initiated bug reporting
differently from continuous session capture. The disclosure surface is smaller
than a PostHog integration would be — but it is NOT zero. The flag stays OFF
until both amendments are LIVE on the store listing pages.

## Regression tests (mutation-checked)

Every test below must be re-verified by reintroducing the defect and confirming
the test goes red. Coverage that stays green under its own mutation is worse
than no coverage — see CLAUDE.md "Mutation-check every new test pin".

- **`recordableRoutes.test.js`** — behaviour of the gate
  - Denylist wins on any conflict, exercised through `_internals.evaluate` with
    synthetic overlapping lists (the real lists deliberately do not overlap, so
    this ordering is otherwise untestable — and the original suite "covered" it
    with `/settings/wipe`, a path that is not a route)
  - Missing route defaults to false (I4)
  - Allow-matching is EXACT: `/settings` allowed, `/settings/privacy` NOT
    allowed, `/settingsomething` NOT allowed
  - Deny-matching is by PREFIX: `/onboarding/restore-shares` and `/dev/prf-spike`
    denied via `/onboarding` and `/dev`
  - `/` does not swallow the app
  - Every denied route returns false, asserted on the REAL paths

- **`routesMatchRouter.test.js`** — correspondence with the router, and the pin
  that would have caught the original defect
  - Every allowlist and denylist entry names a route declared in `src/App.jsx`
  - The seed / coercion / signing routes are each explicitly on the denylist
  - No allowlist entry is a prefix that swallows a denied route
  - Parses a plausible route table first, so a broken parse fails loudly
    instead of passing vacuously against an empty list

- **`bugReportEnabled.test.js`**
  - `VITE_BUG_REPORT_ENABLED` missing / '0' / any non-'1' → gate off
  - Flag on + deniability active → gate off
  - Flag on + demo active → gate off
  - Flag on + web platform → capabilityAvailable false
  - Flag on + native platform + no deniability → gate on

- **Cross-slice tests (added in Slice 1b, listed here so they're not
  forgotten):**
  - Settings button not in the DOM when gate is off
  - Native bridge `startRecording` throws when gate is off, even if called
    directly (belt-and-braces)
  - `create_bug_report_upload` RPC rejects when called from anon without a
    valid signed request

## Slice plan

| Slice | Contents | Runtime effect | Ship-safe under 1.0.1 hold? |
|---|---|---|---|
| **1a (this PR)** | Design doc, Feature-Status entry, route allowlist, enable gate, tests | None — no imports from application code | Yes |
| **1b** | React screens, mock capture (dev), Supabase RPC + Storage bucket, encryption helper | Behind flag OFF | Yes |
| **2** | iOS ReplayKit plugin + Android MediaProjection plugin, real-device verification | Behind flag OFF | Yes |
| **3** | Flag ON, store disclosures amended, versionCode bump, submit | Feature live | No — flag flip requires store amendment landed first |

## Open questions (deferred, not blocking Slice 1a)

- Support ticket system: is it just email + Supabase table, or is there
  something to pipe into? (Slice 1b decision)
- Offline decrypt device: existing signing device or dedicated new one?
  (Slice 1b decision)
- Ticket ID display: raw UUID, or short human-friendly code? (Slice 1b — UX call)

## What this design does NOT commit to

- Which support keypair goes into the binary — that's a Slice 1b commit and
  the corresponding private key generation happens on an offline device
- Which Supabase project (staging vs prod) hosts the bucket — Slice 1b
- Whether the ReplayKit indicator ever fires on iOS Simulator (unlikely; will
  be verified on device in Slice 2)
