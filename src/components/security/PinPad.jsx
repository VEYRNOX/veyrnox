// components/security/PinPad.jsx — the v1 6-digit PIN entry surface.
//
// Structurally identical regardless of which credential slots exist (spec §5):
// it only collects six digits and hands them up. The "Re-enter" (clear) control is
// ALWAYS present and set-existence-independent — it leaks nothing about whether a
// real / duress / hidden set is configured. No security logic lives here.
//
// Input boundaries (numeric-only, the 6-digit cap, auto-submit at length) live in
// the PURE reducer src/lib/pinPadReducer.js so the on-screen buttons and the
// physical-keyboard path share one source of truth (report T-INFRA-3). The pad is
// a focusable container (role="group", tabIndex=0) with an onKeyDown handler so a
// keyboard-only user can type their PIN directly (report A11Y-PIN-1) — scoped to
// when the pad is mounted/focused, not a global window listener. Digits are never
// rendered: keyboard entry stays as shoulder-surf-safe as the buttons.

import { Delete } from "lucide-react";
import { pinPadReduce, keyToPinAction } from "@/lib/pinPadReducer";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"];

export default function PinPad({ value = "", onChange, onComplete, disabled = false, length = 6 }) {
  // Single dispatch for both button presses and physical keys: the reducer is the
  // only place the cap / numeric-only / auto-submit rules live.
  const dispatch = (action) => {
    if (disabled) return;
    const r = pinPadReduce(value, action, length);
    if (!r.changed) return;
    onChange(r.value);
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
    </div>
  );
}
