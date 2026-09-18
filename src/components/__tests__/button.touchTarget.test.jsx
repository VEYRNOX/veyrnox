// Pins the 44px touch-target floor on the shared Button.
//
// This is a mobile wallet: the default Button is the one that signs and sends
// money, and it rendered at h-9 (36px) for the whole life of the component
// while `lg` (h-10/40px) was smaller than `sm` (h-11/44px) — an inverted scale,
// so a developer reaching for a larger button got a smaller target.
//
// The assertion is on the Tailwind height CLASS, not a computed pixel value:
// jsdom does not load the Tailwind stylesheet, so `getBoundingClientRect()`
// here returns 0 for every variant and would pass against any class at all.
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Button } from "@/components/ui/button";

// Tailwind h-N === N * 4px. Anything below 44px (h-11) fails WCAG 2.5.5 /
// Apple HIG 44pt. Raise a variant rather than lowering this number.
const MIN_TOUCH_PX = 44;
const SIZES = ["default", "sm", "lg", "icon"];

function heightPxOf(el) {
  const cls = [...el.classList].find((c) => /^h-\d+$/.test(c));
  expect(cls, `no h-N class on rendered button (classes: ${el.className})`).toBeTruthy();
  return Number(cls.slice(2)) * 4;
}

describe("Button touch targets", () => {
  it.each(SIZES)("size=%s renders at or above the 44px floor", (size) => {
    render(<Button size={size}>Send</Button>);
    expect(heightPxOf(screen.getByRole("button"))).toBeGreaterThanOrEqual(MIN_TOUCH_PX);
  });

  it("never lets a larger named size be shorter than a smaller one", () => {
    const h = {};
    for (const size of ["sm", "default", "lg"]) {
      const { unmount } = render(<Button size={size}>Send</Button>);
      h[size] = heightPxOf(screen.getByRole("button"));
      unmount();
    }
    // sm and default are deliberately equal (they differ in padding and text
    // size, not target area); lg must not be shorter than either.
    expect(h.default).toBeGreaterThanOrEqual(h.sm);
    expect(h.lg).toBeGreaterThanOrEqual(h.default);
  });
});
