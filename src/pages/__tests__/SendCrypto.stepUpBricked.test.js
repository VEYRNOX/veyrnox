// src/pages/__tests__/SendCrypto.stepUpBricked.test.js
//
// Audit 2026-09-07 H-2 — the send 2FA gate must distinguish "your PIN is wrong"
// from "this session has no verifier to check it against".
//
// `unlockBiometricOnly` (the default-ON fast path, #2055) mounts a session
// WITHOUT calling captureVerifierSafe, so `verifierRef` stays null. With a null
// verifier `verifyCredential` returns a plain `false` for EVERY input
// (credentialVerifier.js), which TwoFactorGate could not tell from a wrong PIN:
// it captioned it "Incorrect PIN or Action Password" and burned an attempt, so
// five honest attempts locked the wallet. No credential the user could type
// would ever have worked.
//
// `submitReauth` in this same file already used the DETAILED variant and handled
// `bricked` correctly ~1,000 lines above; only the TwoFactorGate callback used
// the bare one. This pins that they now agree.
//
// WHY A SOURCE SCAN: the callback is an inline prop inside SendCrypto's render
// tree, reachable only after driving the whole send wizard to the confirm step
// with 2FA configured. The fix is a two-line branch, and the realistic
// regression is someone reverting the call itself — which is exactly what a
// scoped source assertion catches.
//
// COMMENTS ARE STRIPPED FIRST, as defence in depth. Stated precisely, because
// overclaiming here would be the same sin this PR fixes: stripping is NOT
// currently load-bearing. The fix's comment block names the retired
// `verifyActiveCredential` to explain why it is gone, but writes it without a
// trailing `(`, so the assertion below — which requires the open paren — would
// pass on a correct file either way.
//
// It is kept because that is one edit away from being false: loosen the pattern
// to a bare name, or let someone write `verifyActiveCredential(pin)` inside the
// explanation, and the check starts firing on its own documentation. That is a
// documented failure mode in this repo (CLAUDE.md: "an absence check must be
// scoped to CODE, because the fix usually documents the thing it removed") and
// it fired three times on 2026-09-03 alone. Strip, then assert.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const raw = readFileSync(resolve(here, '../SendCrypto.jsx'), 'utf8');

// Drop only WHOLE-LINE `//` comments. Trailing comments are left alone so a URL
// or a `//` inside a string literal cannot silently truncate a line of real code.
const code = raw
  .split('\n')
  .filter((line) => !/^\s*\/\//.test(line))
  .join('\n');

describe('SendCrypto — step-up 2FA distinguishes a bricked verifier from a wrong PIN (audit H-2)', () => {
  it('strips comments without eating the code under test', () => {
    // Guards the guard: if the stripper ever removed real lines, every absence
    // assertion below would pass vacuously.
    expect(code).toMatch(/verifyActiveCredentialDetailed/);
    expect(raw.split('\n').length - code.split('\n').length).toBeGreaterThan(0);
  });

  it('the TwoFactorGate PIN leg calls the DETAILED verifier', () => {
    expect(code).toMatch(/verifyActiveCredentialDetailed\(\s*pin\s*\)/);
  });

  it('never calls the bare verifyActiveCredential on a credential value', () => {
    // The bare variant collapses "absent verifier" into the same `false` as
    // "wrong PIN". `verifyActiveCredentialDetailed(...)` does not match this
    // pattern — the open paren after the bare name is what distinguishes them.
    expect(code).not.toMatch(/\bverifyActiveCredential\(/);
  });

  it('returns a non-attempt verdict when the verifier is bricked', () => {
    // `oom: true` is TwoFactorGate's existing flag for "blocked, but this was
    // never a guess" — it must NOT burn an attempt toward the 5-strike lock.
    // Pinned structurally rather than by copy so a wording change cannot pass
    // for the wrong reason.
    expect(code).toMatch(/bricked[\s\S]{0,200}oom:\s*true/);
  });

  it('still surfaces a message with that verdict, rather than failing silently', () => {
    expect(code).toMatch(/bricked[\s\S]{0,300}message:/);
  });
});
