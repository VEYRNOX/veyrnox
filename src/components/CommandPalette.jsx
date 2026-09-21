// @ts-nocheck — consumes the vendored shadcn Dialog primitives in
// components/ui/dialog.jsx, which are themselves @ts-nocheck'd (their own
// className/props are stripped). Matches the existing repo pattern (see
// HelpMenu.jsx's header comment for the same rationale).
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Dialog, DialogPortal, DialogOverlay, DialogTitle, DialogDescription } from "@/components/ui/dialog";
// Single source of truth shared with the sidebar nav (components/Layout.jsx), so
// search always covers the full current feature set instead of a stale hand-kept
// subset. See lib/navigation.js.
import { searchableRoutes as ALL_ROUTES } from "@/lib/navigation";

export default function CommandPalette({ open, onClose }) {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const inputRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  // Whatever had focus right before the palette opened (a search button, or
  // nothing in particular if opened via ⌘K) -- restored in onCloseAutoFocus.
  const triggerRef = useRef(/** @type {HTMLElement | null} */ (null));
  const [selected, setSelected] = useState(0);

  const results = query.trim()
    ? ALL_ROUTES.filter(r =>
        r.label.toLowerCase().includes(query.toLowerCase()) ||
        r.group.toLowerCase().includes(query.toLowerCase()) ||
        (r.keywords && r.keywords.toLowerCase().includes(query.toLowerCase()))
      )
    : ALL_ROUTES.slice(0, 8);

  useEffect(() => {
    setSelected(0);
  }, [query]);

  function handleKeyDown(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelected(s => Math.min(s + 1, results.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
    if (e.key === "Enter" && results[selected]) { navigate(results[selected].path); onClose(); }
  }

  return (
    // Radix Dialog gives us role="dialog", an Escape handler that fires
    // regardless of which descendant has focus, and a focus trap while open --
    // all for free, instead of hand-rolling each one. There is no
    // DialogTrigger here (the palette is opened from several different
    // buttons plus the global ⌘K shortcut), so aria-modal and focus-return to
    // whichever element opened it are wired explicitly below rather than
    // relying on Radix's trigger-bound defaults.
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogPortal>
        <DialogOverlay className="bg-black/60 backdrop-blur-sm" />
        <DialogPrimitive.Content
          aria-modal="true"
          className="fixed start-4 end-4 z-50 mx-auto max-w-lg bg-card border border-border rounded-2xl shadow-2xl overflow-hidden outline-none"
          style={{ top: "calc(2rem + env(safe-area-inset-top))" }}
          onOpenAutoFocus={e => {
            e.preventDefault();
            triggerRef.current = document.activeElement;
            setQuery("");
            setSelected(0);
            inputRef.current?.focus();
          }}
          onCloseAutoFocus={e => {
            e.preventDefault();
            triggerRef.current?.focus?.();
          }}
        >
          <DialogTitle className="sr-only">Search</DialogTitle>
          <DialogDescription className="sr-only">Search features and pages</DialogDescription>

          {/* Search Input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            <svg className="h-4 w-4 text-muted-foreground shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search features, pages..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <kbd className="text-xs text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">ESC</kbd>
          </div>

          {/* Results */}
          <div className="max-h-80 overflow-y-auto py-2">
            {results.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">No results</p>
            ) : (
              results.map((r, i) => {
                const Icon = r.icon;
                return (
                  <button
                    key={r.path}
                    onClick={() => { navigate(r.path); onClose(); }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-start transition-colors ${
                      i === selected ? "bg-primary/10 text-primary" : "hover:bg-secondary text-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="text-sm flex-1">{r.label}</span>
                    <span className="text-xs text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">{r.group}</span>
                  </button>
                );
              })
            )}
          </div>

          <div className="px-4 py-2 border-t border-border flex items-center gap-3 text-xs text-muted-foreground">
            <span>↑↓ navigate</span>
            <span>↵ select</span>
            <span>ESC close</span>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}