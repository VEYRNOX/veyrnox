// src/wallet-core/keystore/__tests__/hardwareKek.android.h-zeroization.test.js
//
// Structural regression pin for C-3 — the raw hardware factor H left in the Java
// heap by HardwareKekPlugin.getHardwareFactor().
//
// C-3 was reported unchanged by four consecutive weekly audits (2026-07-14,
// 07-20, 08-03, 08-17). It is native Kotlin, so vitest cannot execute it; this
// pins the SOURCE, which is the same mechanism the repo already uses for native
// controls (see src/rasp/__tests__/anti-debug-tracer-pid.test.js).
//
// Deliberately stronger than a bare `toContain('Arrays.fill')`. The 2026-08-16
// scan recorded that the RASP pinning test asserts only
// `toContain('RASP_BLOCK')`, and therefore could not detect the argument-order
// swap it was nominally guarding — a pin that matches a substring anywhere in a
// 22 KB file pins almost nothing. These cases assert POSITION and SHAPE:
// the scrub must sit in a finally, in the same block as doFinal, and the salt
// must NOT be scrubbed.

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../../../../');
const kt = readFileSync(
  resolve(root, 'android/app/src/main/java/com/veyrnox/app/HardwareKekPlugin.kt'),
  'utf8',
);

// The onAuthenticationSucceeded body — the only place raw H exists.
function succeededBlock() {
  const start = kt.indexOf('override fun onAuthenticationSucceeded');
  expect(start, 'onAuthenticationSucceeded not found — did the file move?').toBeGreaterThan(-1);
  const end = kt.indexOf('override fun onAuthenticationError', start);
  expect(end, 'onAuthenticationError not found after onAuthenticationSucceeded').toBeGreaterThan(start);
  return kt.slice(start, end);
}

describe('C-3 — raw H is zeroed after the HMAC (Android)', () => {
  it('scrubs hmacResult, in the same block that produces it', () => {
    const block = succeededBlock();
    expect(block).toMatch(/authenticatedMac\.doFinal\(macInput\)/);
    expect(block).toMatch(/Arrays\.fill\(\s*hmacResult\s*,\s*0\.toByte\(\)\s*\)/);
  });

  it('scrubs it in a finally, so a throw between doFinal and resolve cannot skip it', () => {
    const block = succeededBlock();
    // The fill must be preceded by a `finally {` that opens AFTER doFinal —
    // i.e. the scrub is on the unconditional path, not a happy-path afterthought.
    const doFinalAt = block.indexOf('authenticatedMac.doFinal');
    const fillAt = block.search(/Arrays\.fill\(\s*hmacResult/);
    const finallyAt = block.indexOf('finally', doFinalAt);
    expect(doFinalAt).toBeGreaterThan(-1);
    expect(fillAt).toBeGreaterThan(doFinalAt);
    expect(finallyAt).toBeGreaterThan(doFinalAt);
    expect(fillAt).toBeGreaterThan(finallyAt);
  });

  it('does NOT scrub macInput — on the v1 path it is the shared PRF_EVAL_SALT', () => {
    // Zeroing macInput would corrupt PRF_EVAL_SALT for every later call in the
    // process and silently change H. This case exists so a future attempt to
    // "finish" C-3 by scrubbing the other buffer fails loudly here first.
    // If macInput is ever scrubbed, it must be guarded on the v2 branch — and
    // this assertion should be replaced by one pinning that guard, not deleted.
    expect(kt).not.toMatch(/Arrays\.fill\(\s*macInput/);
    expect(kt).not.toMatch(/Arrays\.fill\(\s*PRF_EVAL_SALT/);
  });

  it('discloses the unzeroable String copy rather than implying C-3 is closed', () => {
    // b64 is H in a java.lang.String and cannot be scrubbed. The header must keep
    // saying so — an honest partial beats a claim of completion (I4).
    expect(kt).toMatch(/C-3[\s\S]{0,2000}immutable/);
    expect(kt).toMatch(/do not record C-3 as fully closed/i);
  });
});
