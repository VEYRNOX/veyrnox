// wallet-core/__tests__/kek.m20.test.js
//
// M20 — combineKek must wipe the raw `bits` ArrayBuffer returned by deriveBits.
//
// `new Uint8Array(bits)` and `kek` share the underlying ArrayBuffer, so returning
// it directly leaves derived key material resident in a buffer the GC may not clear
// promptly. The fix copies the key out, then zeroes the deriveBits source buffer.
//
// We assert this STRUCTURALLY (the internal `bits` buffer is not observable from a
// caller) by inspecting the source: a zero() call must follow the deriveBits call,
// and the function must NOT return the raw deriveBits view uncleared.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(__dirname, '..', 'keystore', 'kek.js'), 'utf8');

describe('M20 — combineKek wipes the deriveBits ArrayBuffer', () => {
  it('zeroes the bits buffer after deriveBits', () => {
    const idxDerive = SRC.indexOf('deriveBits(');
    expect(idxDerive).toBeGreaterThan(-1);
    const after = SRC.slice(idxDerive);
    // a zero() of a Uint8Array view over `bits` must appear after deriveBits
    expect(after).toMatch(/zero\(\s*new Uint8Array\(\s*bits\s*\)\s*\)/);
  });

  it('does not return the raw uncleared deriveBits view', () => {
    expect(SRC).not.toMatch(/return\s+new Uint8Array\(\s*bits\s*\)\s*;/);
  });
});
