import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export default function SafeButton({
  children,
  onClick,
  loading = false,
  disabled = false,
  variant = "default",
  size = "default",
  className = "",
  type = "button",
  ariaLabel,
  ...props
}) {
  const isDisabled = disabled || loading;

  return (
    <Button
      type={type}
      variant={variant}
      size={size}
      className={className}
      onClick={onClick}
      disabled={isDisabled}
      aria-label={ariaLabel}
      aria-busy={loading}
      aria-disabled={isDisabled}
      {...props}
    >
      {loading && (
        <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
      )}
      {children}
    </Button>
  );
}