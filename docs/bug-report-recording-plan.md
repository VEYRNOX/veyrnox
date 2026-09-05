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

The allowlist is a hardcoded set of route path prefixes in
`src/lib/bugReport/recordableRoutes.js`. Adding a route requires an explicit
line change. New routes default to DENIED — a route not in the allowlist cannot
be recorded.

**Allowlist (recording MAY happen if user has consented on these routes):**

- `/dashboard`
- `/send/form` (the amount + address form, BEFORE the confirm+sign step)
- `/receive` (address display page)
- `/settings` (top level and all subroutes)
- `/plans`
- `/help`
- `/documentation`

**Denylist (recording is ALWAYS aborted on these routes, even if allowlisted by
prefix — belt-and-braces):**

- `/onboarding/*`
- `/seed/*`, `/verify-seed/*`, `/backup/*`, `/recovery/*`
- `/pin/*`, `/lock/*`, `/unlock/*`
- `/wallet-entry`
- `/send/confirm`, `/send/sign` (the signing chokepoints)
- `/wc/*` (WalletConnect approval + signing flows)
- Any route beginning with `/decoy/`, `/duress/`, `/stealth/`, `/panic/`

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

**Model:** asymmetric. libsodium `crypto_box_seal` (sealed box) against a
support ed25519/x25519 public key baked into the app binary. The corresponding
PRIVATE key is held on an offline signing device — never on any
internet-connected support laptop.

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

- **`recordableRoutes.test.js`**
  - Denylist wins on any conflict (add a route to BOTH; expect false)
  - Missing route defaults to false (I4)
  - Prefix match works but does not leak: `/settings/privacy` allowed;
    `/settingsomething` NOT allowed
  - Every route in the denylist returns false regardless of parents

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
