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

  it("suppresses the toast for Capacitor plugin `.then()` rejections", () => {
    // Real error we observed on Android from @aparajita/capacitor-secure-storage:
    // Capacitor's plugin proxy routes an accidental `.then` access as a native
    // method call and native rejects "not implemented". Nothing awaits the
    // plugin as a value; the rejection is inert. Suppress the user-facing
    // toast for THIS shape only — console.error still fires for debugging.
    dispatchRejection(new Error('"SecureStorage.then()" is not implemented on android'));
    expect(toastError).not.toHaveBeenCalled();
  });

  it("suppresses the toast for the same shape on ios / web too", () => {
    dispatchRejection(new Error('"BiometricAuth.then()" is not implemented on ios'));
    dispatchRejection(new Error('"Foo.then()" is not implemented on web'));
    expect(toastError).not.toHaveBeenCalled();
  });

  it("still toasts an unrelated error whose message happens to contain 'then'", () => {
    // Guard against the regex being too broad — a real error mentioning "then"
    // in prose must still surface the generic toast.
    dispatchRejection(new Error('Something happened, then we crashed'));
    expect(toastError).toHaveBeenCalledTimes(1);
  });
});
