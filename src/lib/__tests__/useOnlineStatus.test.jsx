// @ts-nocheck
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useOnlineStatus } from "@/lib/useOnlineStatus";

describe("useOnlineStatus", () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(navigator) || navigator,
    "onLine",
  );

  function setOnline(value) {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      get: () => value,
    });
  }

  beforeEach(() => setOnline(true));
  afterEach(() => {
    if (originalDescriptor) {
      Object.defineProperty(
        Object.getPrototypeOf(navigator) || navigator,
        "onLine",
        originalDescriptor,
      );
    }
  });

  it("returns the initial navigator.onLine value", () => {
    setOnline(false);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(false);
  });

  it("flips to false on the offline event and back on online", () => {
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);
    act(() => window.dispatchEvent(new Event("offline")));
    expect(result.current).toBe(false);
    act(() => window.dispatchEvent(new Event("online")));
    expect(result.current).toBe(true);
  });
});
