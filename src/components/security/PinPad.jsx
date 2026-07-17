// components/security/PinPad.jsx — the unified PIN/password entry surface.
//
// Modes:
//   - Numeric PIN (native, `numericOnly=true`): 0-9 buttons, 8-digit max, numeric-only keyboard.
//   - Password (web, `numericOnly=false`): Text input accepting ≥12 chars (any characters).
//
// Numeric mode:
// Structurally identical regardless of which credential slots exist (spec §5):
// it only collects eight digits and hands them up. The "Re-enter" (clear) control is
// ALWAYS present and set-existence-independent — it leaks nothing about whether a
// real / duress / hidden set is configured. No security logic lives here.
//
// Input boundaries (numeric-only, the display/buffer cap, and EXPLICIT submit) live
// in the PURE reducer src/lib/pinPadReducer.js so the on-screen buttons and the
// physical-keyboard path share one source of truth (report T-INFRA-3). The pad is
// a focusable container (role="group", tabIndex=0) with an onKeyDown handler so a
// keyboard-only user can type their PIN directly (report A11Y-PIN-1) — scoped to
// when the pad is mounted/focused, not a global window listener. Digits are never
// rendered: keyboard entry stays as shoulder-surf-safe as the buttons.
//
// Password mode:
// Text input field for alphanumeric credentials (web ≥12-char password). Accepts
// any characters via keyboard input.
//
// FIX A — completion is EXPLICIT (deniability-critical, KEK spec §7 / §9 line-item 5).
// `length` controls ONLY the dot count and the buffer cap; it does NOT decide when to
// submit. The Submit control is ALWAYS present and is enabled whenever the pad is
// enabled — it is deliberately NOT enabled/disabled by a specific digit count, because
// a "enable at N digits" rule would re-introduce the exact length oracle Fix A removes
// (the surface must be byte-for-byte identical for a 6- or 8-digit user). A short or
// empty submit is not blocked here; it completes and fails closed through the normal
// unlock path (Option-A decoy / strength check), so the button leaks no length tell.
// Enter also submits. This also removes the old auto-submit-at-8 tell, a real
// deniability improvement we must not reintroduce.

import { Delete } from "lucide-react";
import { pinPadReduce, keyToPinAction } from "@/lib/pinPadReducer";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"];

export default function PinPad({ value = "", onChange, onComplete, disabled = false, length = 8, submitLabel = "Continue", "aria-label": ariaLabel = "PIN entry", numericOnly = true }) {
  // Single dispatch for both button presses and physical keys: the reducer is the
  // only place the cap / numeric-only / explicit-submit rules live.
  const dispatch = (action) => {
    if (disabled) return;
    const r = pinPadReduce(value, action, length);
    if (r.changed) onChange(r.value);
    // complete is independent of changed: 'submit' completes without mutating value.
    if (r.complete) onComplete?.(r.value);
  };

  const press = (k) => dispatch(k);

  const onKeyDown = (e) => {
    if (disabled) return;
    const action = keyToPinAction(e.key);
    if (action == null) return; // leave Tab / arrows / etc. to the browser
    // Consume only keys the pad acts on so Backspace doesn't navigate back, etc.
    e.preventDefault();
    dispatch(action);
  };

  // Password mode: text input for ≥12-char web password
  if (!numericOnly) {
    return (
      <div className="space-y-3">
        <input
          type="password"
          placeholder="Enter your vault password"
          value={value}
          onChange={e => { onChange(e.target.value); }}
          onKeyDown={e => { if (e.key === 'Enter' && value.length >= length) onComplete?.(value); }}
          disabled={disabled}
          aria-label={ariaLabel}
          maxLength={length > 8 ? undefined : length}
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => onComplete?.(value)}
          disabled={disabled || value.length < length}
          aria-label={submitLabel}
          className="w-full px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitLabel}
        </button>
      </div>
    );
  }

  // Numeric PIN mode: traditional PIN pad with buttons
  return (
    <div
      className="space-y-5 outline-none"
      role="group"
      aria-label={ariaLabel}
      aria-describedby="pin-hint"
      tabIndex={disabled ? -1 : 0}
      onKeyDown={onKeyDown}
    >
      {/* Visually-hidden keyboard hint for screen-reader / keyboard-only users.
          The pad is intentionally focused as a container (tabIndex={0}) and the
          digit buttons intentionally have tabIndex={-1} so physical keyboard
          input flows to the single onKeyDown handler — this hint tells AT users
          how to interact without exposing that design detail visually. */}
      <p id="pin-hint" className="sr-only">Use your keyboard to type your PIN, then press Enter or Submit.</p>
      {/* Six position dots — no value echoed, identical in every configuration. */}
      <div className="flex justify-center gap-3" role="status" aria-label={`${value.length} of ${length} digits entered`}>
        {Array.from({ length }, (_, i) => (
          <span
            key={i}
            className={`h-3.5 w-3.5 rounded-full border ${i < value.length ? "bg-primary border-primary" : "border-border"}`}
          />
        ))}
      </div>

      {/* Larger keys (h-16) + pressed-state feedback. Mobile touch does NOT fire
          :hover reliably, so relying on hover-only gave a keypress ZERO visible
          feedback on-device. Added:
            - active:bg-primary/20 — a clear teal flash on tap (design-system token,
              not a raw hex; light + dark themes both read cleanly)
            - active:scale-[0.96] — tactile press micro-motion (skill §7 scale-feedback)
            - transition-transform duration-75 — snappy, not floaty
            - touch-manipulation — kills the 300ms mobile tap delay
          Hover state still fires on desktop for keyboard/pointer input. Reduced-
          motion users get the color flash without the scale (a11y). */}
      <div className="grid grid-cols-3 gap-3">
        {KEYS.map((k) => {
          if (k === "clear") {
            return (
              <button
                key={k}
                type="button"
                tabIndex={-1}
                aria-label="Clear — re-enter PIN"
                disabled={disabled || value.length === 0}
                onClick={() => press(k)}
                className="h-16 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground active:bg-secondary/60 active:scale-[0.96] motion-reduce:active:scale-100 transition-transform duration-75 touch-manipulation disabled:opacity-40 disabled:active:scale-100"
              >
                Re-enter
              </button>
            );
          }
          if (k === "back") {
            return (
              <button
                key={k}
                type="button"
                tabIndex={-1}
                aria-label="Delete last digit"
                disabled={disabled || value.length === 0}
                onClick={() => press(k)}
                className="h-16 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground active:bg-secondary/60 active:scale-[0.96] motion-reduce:active:scale-100 transition-transform duration-75 touch-manipulation disabled:opacity-40 disabled:active:scale-100"
              >
                <Delete className="h-5 w-5" />
              </button>
            );
          }
          return (
            <button
              key={k}
              type="button"
              tabIndex={-1}
              disabled={disabled}
              onClick={() => press(k)}
              className="h-16 rounded-xl bg-secondary/40 hover:bg-secondary active:bg-primary/20 active:scale-[0.96] motion-reduce:active:scale-100 transition-transform duration-75 touch-manipulation text-2xl font-semibold mono-value disabled:opacity-40 disabled:active:scale-100"
            >
              {k}
            </button>
          );
        })}
      </div>

      {/* Explicit submit (Fix A). ALWAYS present, enabled whenever the pad is enabled
          — never gated on a digit count, so it carries no length oracle (§9 line-item
          5). A short/empty submit is not blocked here; it fails closed through the
          unlock path. Enter also triggers this via the container onKeyDown. */}
      <button
        type="button"
        tabIndex={-1}
        aria-label="Submit PIN"
        disabled={disabled}
        onClick={() => press("submit")}
        className="h-12 w-full rounded-xl bg-primary text-primary-foreground text-base font-semibold hover:bg-primary/90 active:bg-primary/80 active:scale-[0.98] transition-all duration-100 disabled:opacity-40"
      >
        {submitLabel}
      </button>
    </div>
  );
}
