import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle } from "lucide-react";

export default function SafeInput({
  id,
  label,
  error,
  description,
  required = false,
  className = "",
  ...props
}) {
  const describedBy = error ? `${id}-error` : description ? `${id}-desc` : undefined;

  return (
    <div className="space-y-1.5">
      {label && (
        <Label htmlFor={id} className="flex items-center gap-1">
          {label}
          {required && <span className="text-destructive" aria-hidden="true">*</span>}
        </Label>
      )}
      <Input
        id={id}
        aria-invalid={!!error}
        aria-describedby={describedBy}
        aria-required={required}
        className={error ? "border-destructive focus-visible:ring-destructive" : className}
        {...props}
      />
      {description && !error && (
        <p id={`${id}-desc`} className="text-xs text-muted-foreground">
          {description}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs text-destructive flex items-center gap-1" role="alert">
          <AlertCircle className="h-3 w-3" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}