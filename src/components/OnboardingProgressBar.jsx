import React from "react";

function clampProgress(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export default function OnboardingProgressBar({
  value,
  label = "Onboarding progress",
  indeterminate = false,
  // Fixed page-footer positioning is the default (existing behaviour).
  // Callers that need the bar inline within their own layout (e.g. under
  // an illustration, inside a centered flex column) pass inline.
  inline = false,
}) {
  const progress = clampProgress(value);
  const wrapperClass = inline
    ? "w-full max-w-sm space-y-2"
    : "fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]";
  const innerClass = inline ? undefined : "mx-auto w-full max-w-sm space-y-2";

  const bar = (
    <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
      <span className="font-medium text-foreground">{label}</span>
      {!indeterminate && <span aria-hidden>{progress}%</span>}
    </div>
  );

  return (
    <div className={wrapperClass}>
      <div className={innerClass}>
        {bar}
        <div
          role="progressbar"
          aria-label={label}
          // WCAG-correct indeterminate shape: omit aria-valuenow (and min/max)
          // rather than lying with a fake percentage.
          {...(indeterminate
            ? {}
            : { 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': progress, 'aria-valuetext': `${progress}% complete` })}
          className="h-2 overflow-hidden rounded-full bg-secondary"
        >
          {indeterminate ? (
            <div
              aria-hidden="true"
              className="h-full w-1/3 rounded-full bg-primary motion-safe:animate-onboarding-indeterminate motion-reduce:animate-none motion-reduce:w-full"
            />
          ) : (
            <div
              aria-hidden="true"
              className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
