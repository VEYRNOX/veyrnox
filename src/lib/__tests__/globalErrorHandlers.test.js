// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const toastError = vi.fn();
vi.mock("@/lib/toast", () => ({
  toast: { error: (...args) => toastError(...args) },
}));

let installGlobalErrorHandlers;
let uninstall;

beforeEach(async () => {
  vi.resetModules();
  toastError.mockReset();
  ({ installGlobalErrorHandlers } = await import("@/lib/globalErrorHandlers"));
  vi.spyOn(console, "error").mockImplementation(() => {});
  uninstall = installGlobalErrorHandlers();
});

afterEach(() => {
  uninstall && uninstall();
  vi.restoreAllMocks();
});

function dispatchRejection(reason) {
  const event = new Event("unhandledrejection");
  event.reason = reason;
  window.dispatchEvent(event);
}

describe("globalErrorHandlers", () => {
  it("shows a generic toast on unhandled rejection", () => {
    dispatchRejection(new Error("boom"));
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastError.mock.calls[0][0]).toMatch(/Something went wrong/i);
  });

  it("shows a reload-hint toast on chunk-load errors", () => {
    const err = new Error("Failed to fetch dynamically imported module: /assets/x.js");
    dispatchRejection(err);
    expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/reload/i));
  });

  it("dedupes within the throttle window", () => {
    dispatchRejection(new Error("a"));
    dispatchRejection(new Error("b"));
    dispatchRejection(new Error("c"));
    expect(toastError).toHaveBeenCalledTimes(1);
  });

  it("is idempotent — install twice, listener runs once", () => {
    installGlobalErrorHandlers();
    dispatchRejection(new Error("boom"));
    expect(toastError).toHaveBeenCalledTimes(1);
  });
});
