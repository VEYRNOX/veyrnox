# Configurable re-lock grace window

Branch: `claude/unlock-grace-window`.

## Problem

Real Pixel 10 trace: screen off → screen on → 7 s to dashboard. `lock()` fires
immediately on screen-off, wiping in-memory unlock state; every screen-on is a
full cold-unlock even when the user was gone for 2 seconds to glance at a
notification.

## Scope

- New setting **Delayed re-lock**: `Immediate` (default) / 10 s / 30 s / 1 min /
  5 min. Off by default; existing users see no behaviour change.
- Grace applies to `reason='screen-off'` **only**. Duress PIN, panic wipe,
  deniability/decoy activation, RASP WARN escalation, explicit user lock, and
  app-backgrounded-to-another-app all bypass grace via `forceLockNow`.
- I3: decoy/demo sessions ALWAYS lock immediately. `getRelockGraceMs()`
  reads 0 in decoy regardless of stored value; `setRelockGraceMs` is a no-op;
  the settings component renders `null` (its presence would leak that a real
  session exists).
- I4: any error in the scheduling path (`setTimeout` throws, missing platform
  API) locks immediately rather than silently deferring.
- Panic-wipe: `veyrnox-relock-grace-ms` + `veyrnox-relock-grace-disclosed`
  listed in `METADATA_RESIDUE_KEYS` so `ALL_RESIDUE_KEYS` drives both the
  erase and `inspectKeyMaterial().clean`.

## Threat model

Grace presumes the OS device-lock is trustworthy for its duration. If an
attacker takes the device WHILE the screen is off and unlocks the phone
(bypasses OS biometric or knows the device PIN), they get direct wallet
access without an app-level prompt.

This is already the model when the user's phone lock is disabled. Grace does
**not** create a new threat class — it extends a window the OS-lock threat
model already covers. The setting description states this plainly:

> If your phone lock is disabled, anyone who picks up the device during this
> window has direct wallet access — the OS lock is the only thing protecting
> your keys while grace is running.

## Semantics summary (from `lib/relockGrace.js`)

| Caller / trigger | Function | Behaviour |
|---|---|---|
| Native `pause` / `appStateChange` (screen-off) | `scheduleLock('screen-off', lock)` | Defers by `getRelockGraceMs()`; cancelled on next screen-on. |
| Web `visibilitychange → hidden` (non-'Never') | `scheduleLock('screen-off', lock)` | Same. |
| Duress PIN, panic wipe, deniability activation, RASP WARN, explicit user lock | `lock()` directly | `lock()` cancels any pending grace on entry (defence in depth). |
| Cold start | n/a | Grace does not apply — cold start always requires full unlock. |

## Known follow-up

Capacitor's `appStateChange` does not distinguish screen-off from
"user switched to another app" on Android — both currently route through the
grace path. Shipped this way with the short recommended default (owner
ruling); the app-switch case is a minor deferred lock, not a security hole,
but the disambiguation should be added via a native screen-off broadcast
plugin. Tracked as a follow-up finding.
