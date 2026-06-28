// M-J: deriveKekC must ZERO the raw Argon2id output buffer after copying it into the
// returned Uint8Array — matching deriveKey()'s explicit zero(raw). Inconsistent
// zeroing leaves the raw KEK-C factor lingering in a GC'd buffer (best-effort secret
// hygiene, vault.js header). We mock hash-wasm so we can hold the SAME buffer
// deriveKekC fills and assert it is wiped after the call.

import { describe, it, expect, vi } from 'vitest';

// Capture the raw buffer handed back by argon2id so we can inspect it post-call.
const captured = { raw: null };

vi.mock('hash-wasm', () => ({
  argon2id: vi.fn(async () => {
    // Non-zero 32-byte "raw key material" — the thing that must be wiped.
    const raw = new Uint8Array(32).fill(0xAB);
    captured.raw = raw;
    return raw;
  }),
}));

describe('deriveKekC — raw Argon2id output zeroing (M-J)', () => {
  it('zeroes the raw output buffer after copying it into the returned factor', async () => {
    const { deriveKekC } = await import('../vault.js');
    const salt = new Uint8Array(32).fill(7);

    const result = await deriveKekC('password-12chars', salt);

    // The returned 32-byte factor is a COPY of the raw bytes (their original value).
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBe(32);
    expect(Array.from(result)).toEqual(Array(32).fill(0xAB));

    // The raw source buffer must now be wiped (parity with deriveKey's zero(raw)).
    expect(captured.raw).not.toBeNull();
    expect(Array.from(captured.raw)).toEqual(Array(32).fill(0));

    // And the returned copy is independent of the wipe (still holds the real value).
    expect(Array.from(result)).toEqual(Array(32).fill(0xAB));
  });
});
