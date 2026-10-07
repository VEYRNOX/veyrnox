// Round icon action used for the Home quick-action row (Send / Receive / Buy / Add).
// Visual only: callers keep their own handlers, gating and labels. One tile per row
// should be `primary` so a new user can see where to start.
export default function ActionTile({ icon: Icon, label, onClick, primary = false, disabled = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group flex flex-col items-center gap-2 rounded-2xl py-1 outline-none disabled:opacity-40 disabled:pointer-events-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span
        className={
          "flex h-14 w-14 items-center justify-center rounded-full border transition-all duration-150 motion-safe:group-active:scale-95 " +
          (primary
            ? "bg-primary text-primary-foreground border-primary/60 shadow-[0_8px_24px_-8px_hsl(var(--primary)/0.55)] group-hover:brightness-110"
            : "bg-secondary/70 text-foreground border-border/40 group-hover:bg-secondary group-hover:border-primary/40")
        }
      >
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>
      <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">{label}</span>
    </button>
  );
}
