// @ts-nocheck
import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all active:scale-[0.97] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow hover:bg-primary/90 active:bg-primary/80",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 active:bg-destructive/80",
        outline:
          "border border-input bg-transparent shadow-sm hover:bg-accent hover:text-accent-foreground hover:border-primary/40 active:bg-accent/80",
        // Secondary (e.g. the Dashboard Send/Receive/Schedule/Add tiles): the
        // stock `hover:bg-secondary/80` just darkens toward the near-black bg, so
        // it reads as "no highlight". Give it a clear teal-tint + ring on hover
        // and a stronger press tint — visible in both themes, obvious to a finger.
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:bg-primary/10 hover:ring-1 hover:ring-inset hover:ring-primary/40 active:bg-primary/20",
        ghost: "hover:bg-accent hover:text-accent-foreground active:bg-accent/80",
        link: "text-primary underline-offset-4 hover:underline",
      },
      // Every size is >= 44px tall. That is the touch-target floor (Apple HIG
      // 44pt / WCAG 2.5.5), not a style preference — this is a mobile wallet and
      // the default button is the one that signs and sends money.
      //
      // `sm` and `default` are deliberately the SAME HEIGHT. They differ in
      // padding and text size, not in target area. Do NOT "fix" that apparent
      // duplication by shrinking `default` back to h-9: that is exactly the state
      // this replaced, where ~208 of 311 call sites rendered a 36px target and
      // `lg` (h-10/40px) was SMALLER than `sm` (h-11/44px).
      //
      // twMerge means a `className="h-7"` at a call site still wins over these.
      // Those overrides are per-site decisions and are not governed here.
      size: {
        default: "h-11 px-4 py-2",
        sm: "h-11 rounded-md px-3 text-xs",
        lg: "h-12 rounded-md px-8",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"
  return (
    (<Comp
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props} />)
  );
})
Button.displayName = "Button"

export { Button, buttonVariants }
