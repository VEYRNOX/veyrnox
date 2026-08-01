// kek.parseVaultBlob.test.js — type-guard for parseVaultBlob (KEK_ERR.MALFORMED_VAULT).
//
// JSON.parse succeeds on 'null', '123', '[]', '"str"', 'true' — all are valid JSON but
// none are plain objects. Without the post-parse type check, callers that dereference
// the result (e.g. blob.kekWrap) would throw a raw TypeError instead of the stable
// KEK_ERR.MALFORMED_VAULT code. These cases must be rejected at the parse boundary.

import { describe, it, expect } from 'vitest';
import { parseVaultBlob, KEK_ERR } from '../kek.js';

describe('parseVaultBlob — non-object JSON', () => {
  it.each([
    ['null JSON',   'null'],
    ['number JSON', '123'],
    ['array JSON',  '[]'],
    ['string JSON', '"hello"'],
    ['bool JSON',   'true'],
  ])('%s throws MALFORMED_VAULT', (_label, input) => {
    expect(() => parseVaultBlob(input)).toThrow(KEK_ERR.MALFORMED_VAULT);
  });
});

describe('parseVaultBlob — valid inputs still pass', () => {
  it('parses a plain-object JSON string', () => {
    const result = parseVaultBlob('{"v":2,"kekWrap":"abc"}');
    expect(result).toEqual({ v: 2, kekWrap: 'abc' });
  });

  it('returns a pre-parsed object unchanged', () => {
    const obj = { v: 2, kekWrap: 'abc' };
    expect(parseVaultBlob(obj)).toBe(obj);
  });

  it('throws MALFORMED_VAULT on invalid JSON string', () => {
    expect(() => parseVaultBlob('{bad}')).toThrow(KEK_ERR.MALFORMED_VAULT);
  });

  it('throws MALFORMED_VAULT on non-string non-object', () => {
    expect(() => parseVaultBlob(42)).toThrow(KEK_ERR.MALFORMED_VAULT);
  });
});
