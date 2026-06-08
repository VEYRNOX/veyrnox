// components/security/PinPad.jsx — the v1 6-digit PIN entry surface.
//
// Structurally identical regardless of which credential slots exist (spec §5):
// it only collects six digits and hands them up. The "Re-enter" (clear) control is
// ALWAYS present and set-existence-independent — it leaks nothing about whether a
// real / duress / hidden set is configured. No security logic lives here.

import { Delete } from "lucide-react";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"];

export default function PinPad({ value, onChange, onComplete, disabled = false, length = 6 }) {
  const press = (k) => {
    if (disabled) return;
    if (k === "back") { onChange(value.slice(0, -1)); return; }
    if (k === "clear") { onChange(""); return; }
    if (value.length >= length) return;
    const next = value + k;
    onChange(next);
    if (next.length === length) onComplete?.(next);
  };

  return (
    <div className="space-y-5">
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
