// @ts-nocheck
import * as React from "react";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";

/** @type {React.ForwardRefExoticComponent<React.InputHTMLAttributes<HTMLInputElement> & React.RefAttributes<HTMLInputElement>>} */
const PasswordInput = React.forwardRef(({ className, ...props }, ref) => {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        ref={ref}
        type={show ? "text" : "password"}
        className={`pr-10 ${className || ""}`}
        {...props}
      />
      <button
        type="button"
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Hide password" : "Show password"}
        tabIndex={-1}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
});
PasswordInput.displayName = "PasswordInput";

export { PasswordInput };
