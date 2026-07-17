"use client";
import { useTheme } from "next-themes"
import { Toaster as Sonner } from "sonner"

// Toast host, tuned to the Veyrnox design system: near-black raised surface
// (`--card`), 1px subtle border (`--border`), rounded-2xl, and per-tier accents
// that match the app's semantic tokens — teal (`--primary`) for success, red
// (`--destructive`) for error, amber (`--caution`) for warning. Explicitly
// declared here so we never fall back to sonner's default (light-tinted) palette
// that would fight the app's near-black surfaces.
const Toaster = ({
  ...props
}) => {
  const { theme = "system" } = useTheme()

  return (
    (<Sonner
      theme={theme}
      className="toaster group"
      position="bottom-center"
      offset={16}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border group-[.toaster]:border-border group-[.toaster]:rounded-2xl group-[.toaster]:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.55)]",
          title: "group-[.toast]:text-sm group-[.toast]:font-semibold",
          description: "group-[.toast]:text-muted-foreground group-[.toast]:text-xs",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:rounded-lg",
          cancelButton:
            "group-[.toast]:bg-secondary group-[.toast]:text-muted-foreground group-[.toast]:rounded-lg",
          success:
            "group-[.toaster]:border-primary/30 group-[.toast]:!text-primary",
          error:
            "group-[.toaster]:border-destructive/40 group-[.toast]:!text-destructive",
          warning:
            "group-[.toaster]:border-caution/40 group-[.toast]:!text-caution",
          info:
            "group-[.toaster]:border-border",
        },
      }}
      {...props} />)
  );
}

export { Toaster }
