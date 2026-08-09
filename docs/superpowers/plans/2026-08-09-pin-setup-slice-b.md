# Plan: PinSetup component + KekEnrollmentGate `mode="onboarding"` (Slice B)

**Date:** 2026-08-09
**Owner:** Al (via Claude Code orch-add-feature)
**Status on landing:** BUILT (code + unit tests green + build clean). NOT verified — no on-chain receive via extracted PIN/KEK path, no real-device verification.
**Branch:** `claude/pin-setup-slice-b`, worktree `/var/folders/l3/4f36t9jn439c8fk_1zqgx8pc0000gn/T/veyrnox-pin-setup/`

## Intent

Two independent extractions in one slice:

1. **`PinSetup` component** — extract the two-step PIN entry (new PIN → confirm PIN) from `WalletEntry.jsx`. Today the same 15-line pattern is duplicated in the `pin-create` view (`~L1640-1673`) and the `pin-recover` view (`~L1709-1725`). `PinSetup` owns `pinStep`/`realPin`/`realPinConfirm` internally, calls `checkPinStrength` + constant-time `pinsEqual`, and fires a single `onDone(pin)` callback on success.

2. **`KekEnrollmentGate mode="onboarding"` prop** — new axis (not a rename of `origin`, which is copy-only). Onboarding mode enforces the FR-7 contract from `/sc:design`: single screen, skip allowed, warning shown ONCE per session (not per unlock loop). Existing `origin='fresh'|'restored'` copy behavior unchanged.

## Non-goals

- Route-based PIN/KEK screens — still blocked by `WalletGate` architecture (same as Slice A).
- Change PIN policy — `MIN_PIN_LENGTH = 8` stays; `checkPinStrength` stays; constant-time `pinsEqual` stays.
- Change KEK enroll or auto-enroll logic — only add the `mode` axis to the gate wrapper.
- Touch `pin-recover`'s leading `seed` step — recovery-specific, not part of "PIN entry."
- Touch duress-PIN setup (Settings-only per requirements doc).
- **Fix the kek-gate test failures** — DROPPED FROM SCOPE. Verified GREEN 7/7 on origin/main today. The "3 failures" Slice A saw were an artifact of the primary checkout being 20+ commits behind.
- Extract or change `PinPad` itself. `PinSetup` uses PinPad exactly as WalletEntry does today.

## Files touched

| File | Change | New? |
|---|---|---|
| `src/components/PinSetup.jsx` | New component: owns two-step state, uses two `PinPad`s, fires `onDone(pin)`/`onCancel`. | NEW |
| `src/components/__tests__/PinSetup.test.jsx` | Unit tests (TDD RED first). | NEW |
| `src/components/KekEnrollmentGate.jsx` | Add `mode='auto'|'onboarding'` prop. `onboarding` mode: single manual screen, no re-nag on skip. `origin` copy behavior untouched. Default `mode='auto'` = current behavior. | EDIT |
| `src/components/__tests__/KekEnrollmentGate.mode.test.jsx` | Unit tests for the new `mode` prop (RED first). | NEW |
| `src/components/WalletEntry.jsx` | Replace inline PIN blocks in `pin-create` (~L1640-1673) AND `pin-recover` (~L1709-1725) with `<PinSetup>`. Reset-on-entry contract preserved. Pass `mode="onboarding"` where KEK is rendered from an onboarding path (not from re-entry). | EDIT |

**Not touched:** `PinPad.jsx`, `useKekEnrollmentGate.js`, `pinStrength.js`, `WalletProvider.jsx`, `WalletGate.jsx`, `App.jsx`, any wallet-core file.

## Security invariants involved

| Invariant | How this change respects it |
|---|---|
| I1 keys on device | No key material touched. PIN is not key material — it unlocks the vault via `keyStore` (unchanged). |
| I2 no silent egress | No new network calls. |
| I3 decoy-safe | Pre-vault path; no decoy session exists yet at `pin-create`. If `PinSetup` is ever reused post-vault (duress-PIN, out of scope), that caller must add its own `isDeniabilityOrDemoActive()` gate — the component must NOT bake in a "no gate needed" assumption. Documented in the component header. |
| I4 fail honest / fail closed | `checkPinStrength` failure → `setError(reason)`, no advance. `pinsEqual` mismatch → error, reset confirm field, no advance. KEK enroll failure in `mode="onboarding"` → honest error, Skip enabled, wallet still usable without KEK (matches Slice A/design FR-7.3). |
| I5 backend untrusted | N/A. |
| I6 KEK hardware binding | Untouched — `useKekEnrollmentGate` hook is not edited. |

## PIN memory hygiene (recon flag)

- `PinSetup` owns `realPin`/`realPinConfirm` state as plain strings — same discipline as inline blocks today.
- Reset to `""` on: cancel, mismatch, success handoff, unmount.
- After success, PIN is passed to `onDone(pin)` and the caller (WalletEntry) writes it to `autoEnrollPinRef.current` for the subsequent KEK auto-enroll (existing behavior — not changed). WalletEntry's existing reset points for that ref (`:663, :670, :1092, :1208, :1647` per recon) stay intact.

## KekEnrollmentGate `mode` semantics

| mode | Auto-enroll on mount if `autoEnrollPin`? | Skip behavior | Warning after skip |
|---|---|---|---|
| `auto` (default, current) | Yes | Calls `onSkip`, gate can re-fire on subsequent unlock cycles | Not applicable in component; caller controls re-fire |
| `onboarding` (new) | Yes (same) | Calls `onSkip`, one-time in-session `sessionStorage` flag prevents re-nag until next full session | Warning banner shown ONCE on skip, then component defers to caller |

Session-scope key: `veyrnox-kek-onboarding-skip-warned` (sessionStorage). Added to `SESSION_RESIDUE_KEYS` in `wallet-core/panic.js` (reviewer P2, Slice B). PRESENCE-tell class — same as `veyrnox-recent-pages`: existence asserts a fresh-onboarding session occurred here AND hardware-KEK was skipped, so panic-wipe must sweep it. Writes gated at source via `isDeniabilityOrDemoActive()` (two-chokepoint pattern, matches `lib/consent.js`); reads ungated.

## TDD RED tests

### `src/components/__tests__/PinSetup.test.jsx` (6 tests)

1. **Two-step render.** Mounts on step 1 ("Set a PIN"). After `onComplete` fires on PinPad with a valid PIN, mounts step 2 ("Confirm PIN").
2. **`onDone` fires only after both steps pass.** Weak PIN on step 1 → error, no advance. Mismatch on step 2 → error, BOTH pins reset, back to step 1, no `onDone`. (Reviewer P2 fix: matches original WalletEntry semantics so a shoulder-surfed step-1 PIN can't get unlimited retry on step 2.)
3. **`onDone(pin)` receives exactly the confirmed PIN.**
4. **`onCancel` at any step invokes callback + no `onDone`.**
5. **State reset on unmount.** Mount → fill step 1 → unmount → mount again → step 1 is blank (state not persisted).
6. **No localStorage writes.** Spy `setItem`, exercise full flow, assert zero calls.

### `src/components/__tests__/KekEnrollmentGate.mode.test.jsx` (4 tests)

1. **`mode='auto'` (default) unchanged.** Existing gate behavior — matches current fixture pattern from `KekEnrollmentGate.auto-enroll.test.jsx`.
2. **`mode='onboarding'` skip sets session flag.** Click Skip → `sessionStorage.getItem('veyrnox-kek-onboarding-skip-warned') === '1'`.
3. **`mode='onboarding'` re-mount after skip does NOT show warning again in-session.** Warning renders on first skip, hidden on re-mount while session flag is set.
4. **`mode='onboarding'` clears session flag on `onEnroll` success.** Prevents warning re-render if user later enrolls.

## Acceptance criteria

- All 10 new tests green (6 PinSetup + 4 KEK mode).
- All existing tests still green:
  - `WalletEntry.kek-gate.test.jsx` (7/7 — must stay green)
  - `WalletEntry.pin-cohort-biometric.test.jsx`
  - `WalletEntry.web-authmodel.test.jsx`
  - `WalletEntry.restore-file.test.jsx`
  - `WalletEntry.kek-invalidated.test.jsx`
  - `wallet-entry-pin-wipe.test.jsx`
  - `KekEnrollmentGate.auto-enroll.test.jsx`
- Lint clean.
- Build clean.
- Preview-render check: navigate to fresh-create flow, see PIN entry render + step-through works; navigate to import flow, same.
- **NOT verified.** No on-chain receive via extracted path this slice.

## Rollback

Single-commit revert: delete `PinSetup.jsx` + its test + `KekEnrollmentGate.mode.test.jsx`, revert the WalletEntry PIN block swaps, revert the KEK `mode` prop addition. `sessionStorage` key becomes dead if any writer remained (there won't be — the key only lives inside the extended KEK component).

## Deliberate simplifications

- No visual live strength meter (none exists today — `checkPinStrength` is submit-time only).
- No `PinPad` change.
- No unification of `pin-recover`'s leading `seed` step into `PinSetup` (recovery-specific).
- Session-storage flag for one-time skip warning instead of a full in-memory + persisted state machine — sessionStorage is per-tab and cleared on close, which matches the intent ("don't re-nag THIS session").

## Follow-ups (deliberately left)

- Extract duress-PIN setup (Settings) onto `PinSetup` — needs I3 gating on that caller.
- Live strength indicator (visual meter, not just error text) — deferred, no existing component.
- Route-based PIN/KEK screens — blocked on WalletGate architecture change.
