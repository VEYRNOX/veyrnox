// src/wallet-core/keystore/__tests__/web.zeroing.test.js
//
// H-NEW-4 — sensitive-buffer zeroing in keystore/web.js (defense in depth).
//
// combineKek (kek.js) zeroes its OWN ikm and, as of M20, the caller's H/C in place.
// This suite pins a stricter, caller-side contract so the guarantee survives any
// future refactor of combineKek: every web.js call site that holds H, C, or a
// recovered DEK must wipe those buffers in its own function body once they are no
// longer needed (I4 — fail honest, fail closed; no plaintext key material left to
// linger in the JS heap until GC, readable in a heap dump / via Frida).
//
// These are SOURCE-SCAN structural guards (the crypto is exercised elsewhere). We
// scan per-function bodies so a .fill(0) in one function can't satisfy another.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, '../web.js'), 'utf8');
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const code = stripComments(src);

// Extract the body text of an async method `name(...) { ... }` by brace matching.
function methodBody(source, name) {
  const start = source.indexOf(`async ${name}(`);
  if (start === -1) throw new Error(`method ${name} not found`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  throw new Error(`unbalanced braces in ${name}`);
}

const zeroed = (body, v) =>
  new RegExp(`(?:${v}\\.fill\\(\\s*0\\s*\\)|zero\\(\\s*${v}\\s*\\))`).test(body);

const calls = (body, fn) =>
  (body.match(new RegExp(`${fn}\\(`, 'g')) || []).length;

describe('web.js sensitive-buffer zeroing — H-NEW-4', () => {
  describe('unlock()', () => {
    const body = methodBody(code, 'unlock');

    it('calls combineKek (sanity)', () => {
      expect(calls(body, 'combineKek')).toBeGreaterThan(0);
    });
    it('zeroes H after use', () => expect(zeroed(body, 'H')).toBe(true));
    it('zeroes C after use', () => expect(zeroed(body, 'C')).toBe(true));
    it('zeroes the recovered dek after use', () =>
      expect(zeroed(body, 'dek')).toBe(true));
  });

  describe('enrollKek()', () => {
    const body = methodBody(code, 'enrollKek');

    it('calls combineKek (sanity)', () => {
      expect(calls(body, 'combineKek')).toBeGreaterThan(0);
    });
    it('zeroes H after use', () => expect(zeroed(body, 'H')).toBe(true));
    it('zeroes C after use', () => expect(zeroed(body, 'C')).toBe(true));
    it('zeroes the dek after use', () => expect(zeroed(body, 'dek')).toBe(true));
  });

  describe('changePassword()', () => {
    const body = methodBody(code, 'changePassword');

    it('calls combineKek twice (old + new KEK)', () => {
      expect(calls(body, 'combineKek')).toBe(2);
    });
    it('zeroes H after the first combineKek', () =>
      expect(zeroed(body, 'H')).toBe(true));
    it('zeroes oldC after use', () => expect(zeroed(body, 'oldC')).toBe(true));
    it('zeroes the H2 copy after the second combineKek', () =>
      expect(zeroed(body, 'H2')).toBe(true));
    it('zeroes newC after use', () => expect(zeroed(body, 'newC')).toBe(true));
    it('zeroes the recovered dek after re-wrap', () =>
      expect(zeroed(body, 'dek')).toBe(true));
  });
});
