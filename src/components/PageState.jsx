// @ts-nocheck
// components/PageState.jsx
//
// Shared loading / error / empty triad for full-page states. Pages across the
// app hand-rolled inconsistent spinners, empty prompts, and error toasts. This
// primitive gives one visual + accessibility contract for the three states so
// screen-reader announcement, motion-safe spinners, and the visual language are
// consistent.
//
// Usage:
//   const { data, isLoading, error } = useQuery(...);
//   return (
//     <PageState loading={isLoading} error={error} empty={!data?.length}>
//       {children}
//     </PageState>
//   );
//
// F-P2-8 (ecc-multi-lens-2026-07-18.md). This primitive is intentionally minimal;
// per-page customisation is via the optional labels / renderEmpty / renderError props.

import { AlertTriangle, Inbox } from "lucide-react";
import Spinner from "./Spinner";

function DefaultLoading({ label }) {
  return <Spinner size="lg" className="py-16" label={label} />;
}

function DefaultError({ error, label }) {
  const message = (error && (error.message || String(error))) || label;
  return (
    <div role="alert" className="mx-auto max-w-md rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive flex items-start gap-3">
      <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0 mt-0.5" />
      <div className="space-y-1">
        <p className="font-medium">Something went wrong</p>
        <p className="text-destructive/80">{message}</p>
      </div>
    </div>
  );
}

function DefaultEmpty({ label }) {
  return (
    <div className="mx-auto max-w-md rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground space-y-2">
      <Inbox aria-hidden="true" className="h-6 w-6 text-muted-foreground/60 mx-auto" />
      <p>{label}</p>
    </div>
  );
}

export default function PageState({
  loading = false,
  error = null,
  empty = false,
  loadingLabel = "Loading…",
  errorLabel = "Something went wrong.",
  emptyLabel = "Nothing to show yet.",
  renderLoading,
  renderError,
  renderEmpty,
  children,
}) {
  if (loading) {
    return renderLoading ? renderLoading() : <DefaultLoading label={loadingLabel} />;
  }
  if (error) {
    return renderError ? renderError(error) : <DefaultError error={error} label={errorLabel} />;
  }
  if (empty) {
    return renderEmpty ? renderEmpty() : <DefaultEmpty label={emptyLabel} />;
  }
  return children ?? null;
}
