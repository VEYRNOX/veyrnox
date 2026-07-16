// H2 regression: the /live-balances diagnostic page must NOT surface the raw
// I3 deniability guard string ("I3: no egress in deniability session") in its
// error box. In a decoy/hidden session that verbatim string is a plain-English
// deniability tell. sanitizeBalanceError() must rewrap it into the same generic
// RPC-failure message any user sees on a real network failure, so a decoy
// session is indistinguishable from an ordinary RPC error.
import { describe, it, expect } from "vitest";
import { sanitizeBalanceError, GENERIC_RPC_ERROR } from "../LiveBalances.jsx";

describe("LiveBalances — I3 deniability tell (H2)", () => {
  it("rewraps the I3 guard error into the generic RPC message (no tell)", () => {
    const i3 = new Error("I3: no egress in deniability session");
    const shown = sanitizeBalanceError(i3);
    expect(shown).toBe(GENERIC_RPC_ERROR);
    // The verbatim guard string must never reach the UI.
    expect(shown).not.toMatch(/I3/);
    expect(shown).not.toMatch(/deniability/i);
    expect(shown).not.toMatch(/egress/i);
  });

  it("preserves a genuine RPC error message for debuggability", () => {
    const rpc = new Error("could not detect network (SERVER_ERROR)");
    expect(sanitizeBalanceError(rpc)).toBe("could not detect network (SERVER_ERROR)");
  });

  it("falls back to the generic message when there is no message", () => {
    expect(sanitizeBalanceError(undefined)).toBe(GENERIC_RPC_ERROR);
    expect(sanitizeBalanceError({})).toBe(GENERIC_RPC_ERROR);
    expect(sanitizeBalanceError(new Error(""))).toBe(GENERIC_RPC_ERROR);
  });

  it("does not treat a message merely CONTAINING 'I3' mid-string as a guard error", () => {
    // Only a leading "I3:" is the guard sentinel; a coincidental substring stays.
    const other = new Error("token API3 feed unavailable");
    expect(sanitizeBalanceError(other)).toBe("token API3 feed unavailable");
  });
});
