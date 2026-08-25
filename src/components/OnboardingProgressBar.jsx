import React from "react";

function clampProgress(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export default function OnboardingProgressBar({ value, label = "Onboarding progress" }) {
  const progress = clampProgress(value);

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      <div className="mx-auto w-full max-w-sm space-y-2">
        <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground">{label}</span>
          <span aria-hidden>{progress}%</span>
        </div>
        <div
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          aria-valuetext={`${progress}% complete`}
          className="h-2 overflow-hidden rounded-full bg-secondary"
        >
          <div
            aria-hidden="true"
            className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
