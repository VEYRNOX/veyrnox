import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { ChevronLeft } from "lucide-react";

// Consistent in-page back affordance. The desktop layout has no back control of
// its own (only the mobile top bar does, and not on root tabs like /settings),
// so pages reached from e.g. the Security Dashboard would otherwise strand the
// user. Defaults to history-back (returns to wherever you came from — the
// Security Dashboard when you opened the setting from there); pass `to` for an
// explicit destination.
export default function BackButton({ to = undefined, label = undefined, className = "" }) {
  const { t } = useTranslation('wallet');
  const navigate = useNavigate();
  const resolvedLabel = label ?? t('back.default_label');
  return (
    <button
      type="button"
      onClick={() => (to ? navigate(to) : navigate(-1))}
      className={`flex items-center gap-1 -ms-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors ${className}`}
    >
      {/* Icon mirrors under dir="rtl" so the chevron always points "backwards
          in reading direction" — right-facing for RTL locales. */}
      <ChevronLeft className="h-4 w-4 rtl:-scale-x-100" />
      <span>{resolvedLabel}</span>
    </button>
  );
}
