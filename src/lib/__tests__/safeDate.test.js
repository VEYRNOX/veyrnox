import { describe, it, expect } from "vitest";
import { safeDate, safeFormat } from "../safeDate.js";
import { format, differenceInDays, formatDistanceToNow } from "date-fns";

// ---------------------------------------------------------------------------
// safeDate
// ---------------------------------------------------------------------------
describe("safeDate", () => {
  it("returns a valid Date for a valid ISO string", () => {
    const result = safeDate("2024-01-15T12:00:00Z");
    expect(result).toBeInstanceOf(Date);
    expect(Number.isNaN(result.getTime())).toBe(false);
  });

  it("returns null for null", () => {
    expect(safeDate(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(safeDate(undefined)).toBeNull();
  });

  it("returns null for 'not-a-date'", () => {
    expect(safeDate("not-a-date")).toBeNull();
  });

  it("returns a valid Date for a numeric timestamp", () => {
    const ts = 1_700_000_000_000; // 2023-11-14 something
    const result = safeDate(ts);
    expect(result).toBeInstanceOf(Date);
    expect(result.getTime()).toBe(ts);
  });
});

// ---------------------------------------------------------------------------
// safeFormat
// ---------------------------------------------------------------------------
describe("safeFormat", () => {
  const ISO = "2024-06-01T10:00:00Z";

  it("formats a valid date with a format string — no throw", () => {
    expect(() => safeFormat(ISO, "yyyy-MM-dd")).not.toThrow();
    // Must contain the year
    expect(String(safeFormat(ISO, "yyyy-MM-dd"))).toMatch(/2024/);
  });

  it("returns fallback for null — no throw", () => {
    expect(() => safeFormat(null, "yyyy-MM-dd")).not.toThrow();
    expect(safeFormat(null, "yyyy-MM-dd")).toBe("—");
  });

  it("returns fallback for undefined — no throw", () => {
    expect(() => safeFormat(undefined, "yyyy-MM-dd")).not.toThrow();
    expect(safeFormat(undefined, "yyyy-MM-dd")).toBe("—");
  });

  it("returns fallback for 'not-a-date' — no throw", () => {
    expect(() => safeFormat("not-a-date", "yyyy-MM-dd")).not.toThrow();
    expect(safeFormat("not-a-date", "yyyy-MM-dd")).toBe("—");
  });

  it("formats a numeric timestamp correctly — no throw", () => {
    const ts = new Date("2023-11-14").getTime();
    const result = safeFormat(ts, "yyyy-MM-dd");
    expect(String(result)).toMatch(/2023-11-14/);
  });

  it("accepts a custom fallback string", () => {
    expect(safeFormat(null, "yyyy-MM-dd", "N/A")).toBe("N/A");
  });

  it("calls a function wrapper (e.g. differenceInDays) for a valid date — no throw", () => {
    const now = new Date();
    const future = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString();
    expect(() => safeFormat(future, d => differenceInDays(d, now))).not.toThrow();
    const days = safeFormat(future, d => differenceInDays(d, now));
    expect(typeof days).toBe("number");
  });

  it("returns fallback when a function wrapper is passed but date is invalid — no throw", () => {
    expect(() => safeFormat("bad", d => differenceInDays(d, new Date()))).not.toThrow();
    expect(safeFormat("bad", d => differenceInDays(d, new Date()))).toBe("—");
  });

  it("calls a formatDistanceToNow wrapper for a valid date — no throw", () => {
    expect(() => safeFormat(ISO, d => formatDistanceToNow(d, { addSuffix: true }))).not.toThrow();
    const result = safeFormat(ISO, d => formatDistanceToNow(d, { addSuffix: true }));
    expect(typeof result).toBe("string");
    expect(String(result).length).toBeGreaterThan(0);
  });
});
