import { useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";

// Consistent in-page back affordance. The desktop layout has no back control of
// its own (only the mobile top bar does, and not on root tabs like /settings),
// so pages reached from e.g. the Security Dashboard would otherwise strand the
// user. Defaults to history-back (returns to wherever you came from — the
// Security Dashboard when you opened the setting from there); pass `to` for an
// explicit destination.
export default function BackButton({ to, label = "Back", className = "" }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => (to ? navigate(to) : navigate(-1))}
      className={`flex items-center gap-1 -ml-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors ${className}`}
    >
      <ChevronLeft className="h-4 w-4" />
      <span>{label}</span>
    </button>
  );
}
