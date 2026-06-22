// components/security/PinPad.jsx — the v1 8-digit PIN entry surface.
//
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

export default function PinPad({ value = "", onChange, onComplete, disabled = false, length = 8, submitLabel = "Continue" }) {
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

  return (
    <div
      className="space-y-5 outline-none"
      role="group"
      aria-label="PIN entry"
      tabIndex={disabled ? -1 : 0}
      onKeyDown={onKeyDown}
    >
      {/* Six position dots — no value echoed, identical in every configuration. */}
      <div className="flex justify-center gap-3" role="status" aria-label={`${value.length} of ${length} digits entered`}>
        {Array.from({ length }, (_, i) => (
          <span
            key={i}
            className={`h-3.5 w-3.5 rounded-full border ${i < value.length ? "bg-primary border-primary" : "border-border"}`}
          />
        ))}
      </div>

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
                className="h-14 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-40"
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
                className="h-14 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40"
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
              className="h-14 rounded-xl bg-secondary/40 hover:bg-secondary text-xl font-semibold mono-value disabled:opacity-40"
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
        className="h-12 w-full rounded-xl bg-primary text-primary-foreground text-base font-semibold hover:bg-primary/90 disabled:opacity-40"
      >
        {submitLabel}
      </button>
    </div>
  );
}
