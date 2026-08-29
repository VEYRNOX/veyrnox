import { useLocation, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { ChevronLeft } from "lucide-react";
import { getStoredBackTarget, hasBrowserBackHistory } from "@/lib/backNavigation";

// Consistent in-page back affordance. Prefer real browser history when it
// exists, but fall back to the tracked prior in-app route (important for
// replace-style tab switches) and finally to the parent-route map for direct
// deep-links. Pass `to` for an explicit destination.
export default function BackButton({ to = undefined, label = undefined, className = "" }) {
  const { t } = useTranslation('wallet');
  const navigate = useNavigate();
  const location = useLocation();
  const resolvedLabel = label ?? t('back.default_label');
  const fallbackTarget = to ?? getStoredBackTarget(location);

  const handleBack = () => {
    if (to) {
      navigate(to);
      return;
    }
    if (hasBrowserBackHistory()) {
      navigate(-1);
      return;
    }
    if (fallbackTarget) {
      navigate(fallbackTarget, { replace: true });
    }
  };

  return (
    <button
      type="button"
      onClick={handleBack}
      className={`flex items-center gap-1 -ms-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors ${className}`}
    >
      {/* Icon mirrors under dir="rtl" so the chevron always points "backwards
          in reading direction" — right-facing for RTL locales. */}
      <ChevronLeft className="h-4 w-4 rtl:-scale-x-100" />
      <span>{resolvedLabel}</span>
    </button>
  );
}
