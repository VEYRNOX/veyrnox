// components/Spinner.jsx
//
// Shared loading-spinner primitive. Full-page/section loading indicators were
// hand-rolled inconsistently across the app (a `TabSpinner` in Layout.jsx, ad-hoc
// `border-2` divs in Settings.jsx and others, standalone `Loader2` icons
// elsewhere). This is the single visual + accessibility contract for all of
// them — one teal-accent spinner, motion-safe, with a screen-reader label.
//
// Usage:
//   <Spinner label="Loading settings…" />
//   <Spinner size="sm" className="py-8" label="Reading history…" />
//
// Not for button-internal submit indicators (those stay as inline `Loader2`
// next to button text) — this is for full-page/section loading states.
//
// `decorative`: use when embedding inside a container that already owns its own
// `role="status"` region and visible text (e.g. a status <p> with copy next to
// it, or a <p> ancestor — which cannot validly contain this component's <div>).
// Without it, a second nested `role="status"` creates a duplicate/ambiguous
// live region for assistive tech and `findByRole('status')` queries.

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Spinner({ className, label = "Loading…", size = "md", decorative = false }) {
  const sizes = { sm: "h-4 w-4", md: "h-5 w-5", lg: "h-6 w-6" };
  const icon = (
    <Loader2 aria-hidden="true" className={cn(sizes[size] || sizes.md, "text-primary motion-safe:animate-spin")} />
  );
  if (decorative) {
    return <span className={cn("inline-flex items-center", className)}>{icon}</span>;
  }
  return (
    <div role="status" aria-label={label} className={cn("flex items-center justify-center", className)}>
      {icon}
      <span className="sr-only">{label}</span>
    </div>
  );
}
