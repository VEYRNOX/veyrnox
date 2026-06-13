"use client"

import * as React from "react"
import * as SelectPrimitive from "@radix-ui/react-select"
import { Check, ChevronDown, ChevronUp, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerClose } from "@/components/ui/drawer"

// ── Detect mobile viewport ──────────────────────────────────────────
function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(
    () => typeof window !== "undefined" ? window.innerWidth < 768 : false
  );
  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isMobile;
}

// ── Mobile Select Context ───────────────────────────────────────────
const MobileSelectCtx = React.createContext(null);

// ── Smart Select root ───────────────────────────────────────────────
// `disabled` is pulled out explicitly so BOTH paths honour it. On desktop Radix's
// Root consumes it (via the spread). On mobile the Root is replaced by a context +
// a plain <button> trigger, and the prop was previously swallowed by `...props` and
// never forwarded — so a disabled Select still opened its bottom-sheet. We now thread
// it through the context to the mobile trigger.
function Select({ children, value, onValueChange, defaultValue, open, onOpenChange, disabled, ...props }) {
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [internalValue, setInternalValue] = React.useState(defaultValue ?? "");
  const [selectedLabel, setSelectedLabel] = React.useState("");
  const currentValue = value !== undefined ? value : internalValue;

  if (!isMobile) {
    return (
      <SelectPrimitive.Root
        value={value}
        onValueChange={onValueChange}
        defaultValue={defaultValue}
        open={open}
        onOpenChange={onOpenChange}
        disabled={disabled}
        {...props}
      >
        {children}
      </SelectPrimitive.Root>
    );
  }

  return (
    <MobileSelectCtx.Provider value={{
      value: currentValue,
      selectedLabel,
      disabled,
      onValueChange: (v, label) => {
        if (value === undefined) setInternalValue(v);
        if (label) setSelectedLabel(label);
        onValueChange?.(v);
        setMobileOpen(false);
      },
      mobileOpen,
      setMobileOpen,
    }}>
      {children}
    </MobileSelectCtx.Provider>
  );
}

// ── SelectGroup ─────────────────────────────────────────────────────
const SelectGroup = React.forwardRef(({ children, ...props }, ref) => {
  const ctx = React.useContext(MobileSelectCtx);
  if (ctx) return <div ref={ref} {...props}>{children}</div>;
  return <SelectPrimitive.Group ref={ref} {...props}>{children}</SelectPrimitive.Group>;
});
SelectGroup.displayName = "SelectGroup";

// ── SelectValue ─────────────────────────────────────────────────────
const SelectValue = React.forwardRef(({ placeholder, children, ...props }, ref) => {
  const ctx = React.useContext(MobileSelectCtx);
  if (ctx) {
    const hasChildren = children != null && children !== false;
    if (hasChildren) return <>{children}</>;
    if (ctx.value) return <span>{ctx.selectedLabel || ctx.value}</span>;
    return <span className="text-muted-foreground">{placeholder}</span>;
  }
  return (
    <SelectPrimitive.Value ref={ref} placeholder={placeholder} {...props}>
      {children}
    </SelectPrimitive.Value>
  );
});
SelectValue.displayName = "SelectValue";

// ── SelectTrigger ───────────────────────────────────────────────────
const SelectTrigger = React.forwardRef(({ className, children, ...props }, ref) => {
  const ctx = React.useContext(MobileSelectCtx);
  if (ctx) {
    return (
      <button
        ref={ref}
        type="button"
        disabled={ctx.disabled}
        onClick={() => { if (!ctx.disabled) ctx.setMobileOpen(true); }}
        className={cn(
          "flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
          className
        )}
        {...props}
      >
        {children}
        <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
      </button>
    );
  }
  return (
    <SelectPrimitive.Trigger
      ref={ref}
      className={cn(
        "flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background data-[placeholder]:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="h-4 w-4 opacity-50" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
});
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

// ── SelectScrollUpButton / SelectScrollDownButton ───────────────────
const SelectScrollUpButton = React.forwardRef(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn("flex cursor-default items-center justify-center py-1", className)}
    {...props}
  >
    <ChevronUp className="h-4 w-4" />
  </SelectPrimitive.ScrollUpButton>
));
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName;

const SelectScrollDownButton = React.forwardRef(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn("flex cursor-default items-center justify-center py-1", className)}
    {...props}
  >
    <ChevronDown className="h-4 w-4" />
  </SelectPrimitive.ScrollDownButton>
));
SelectScrollDownButton.displayName = SelectPrimitive.ScrollDownButton.displayName;

// ── SelectContent ───────────────────────────────────────────────────
const SelectContent = React.forwardRef(({ className, children, position = "popper", ...props }, ref) => {
  const ctx = React.useContext(MobileSelectCtx);
  if (ctx) {
    return (
      <Drawer open={ctx.mobileOpen} onOpenChange={ctx.setMobileOpen}>
        <DrawerContent className="max-h-[75vh] flex flex-col">
          <DrawerHeader className="flex items-center justify-between border-b border-border px-4 py-3 shrink-0">
            <DrawerTitle className="text-base font-semibold">Select an option</DrawerTitle>
            <DrawerClose asChild>
              <button className="rounded-md p-1 opacity-70 hover:opacity-100">
                <X className="h-4 w-4" />
              </button>
            </DrawerClose>
          </DrawerHeader>
          <div className="overflow-y-auto px-2 py-2 flex-1" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
            {children}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        ref={ref}
        className={cn(
          "relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          position === "popper" &&
            "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
          className
        )}
        position={position}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport
          className={cn("p-1", position === "popper" &&
            "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]")}
        >
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
});
SelectContent.displayName = SelectPrimitive.Content.displayName;

// ── SelectLabel ─────────────────────────────────────────────────────
const SelectLabel = React.forwardRef(({ className, ...props }, ref) => {
  const ctx = React.useContext(MobileSelectCtx);
  if (ctx) {
    return (
      <p ref={ref} className={cn("px-3 py-1.5 text-xs font-semibold text-muted-foreground", className)} {...props} />
    );
  }
  return (
    <SelectPrimitive.Label
      ref={ref}
      className={cn("px-2 py-1.5 text-sm font-semibold", className)}
      {...props}
    />
  );
});
SelectLabel.displayName = SelectPrimitive.Label.displayName;

// ── SelectItem ──────────────────────────────────────────────────────
const SelectItem = React.forwardRef(({ className, children, value, ...props }, ref) => {
  const ctx = React.useContext(MobileSelectCtx);
  if (ctx) {
    const isSelected = ctx.value === value;
    const textLabel = typeof children === "string" ? children : undefined;
    return (
      <button
        ref={ref}
        type="button"
        onClick={() => ctx.onValueChange(value, textLabel)}
        className={cn(
          "w-full flex items-center justify-between gap-3 px-3 py-3 text-sm rounded-xl transition-colors active:bg-secondary/80 min-h-[44px]",
          isSelected
            ? "bg-primary/10 text-primary font-semibold"
            : "text-foreground hover:bg-secondary",
          className
        )}
        {...props}
      >
        <span className="flex-1 text-left line-clamp-2">{children}</span>
        {isSelected && <Check className="h-4 w-4 shrink-0" />}
      </button>
    );
  }
  return (
    <SelectPrimitive.Item
      ref={ref}
      className={cn(
        "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className
      )}
      value={value}
      {...props}
    >
      <span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="h-4 w-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
});
SelectItem.displayName = SelectPrimitive.Item.displayName;

// ── SelectSeparator ─────────────────────────────────────────────────
const SelectSeparator = React.forwardRef(({ className, ...props }, ref) => {
  const ctx = React.useContext(MobileSelectCtx);
  if (ctx) {
    return <div ref={ref} className={cn("-mx-1 my-1 h-px bg-muted", className)} {...props} />;
  }
  return (
    <SelectPrimitive.Separator
      ref={ref}
      className={cn("-mx-1 my-1 h-px bg-muted", className)}
      {...props}
    />
  );
});
SelectSeparator.displayName = SelectPrimitive.Separator.displayName;

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
}