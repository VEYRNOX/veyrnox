// kek.parseVaultBlob.test.js — type-guard for parseVaultBlob (KEK_ERR.MALFORMED_VAULT).
//
// COVERAGE GAP THIS CLOSES: `parseVaultBlob` is the single entry point every native
// vault read goes through (17 call sites in keystore/native.js — unlock, KEK upgrade,
// re-persist, peek, restore) and it had ZERO direct tests. Its whole reason to exist is
// to convert a corrupt stored blob into the STABLE machine code KEK_ERR.MALFORMED_VAULT
// instead of leaking a raw SyntaxError/TypeError to the caller — I4 (fail honest, fail
// closed) plus the deniability requirement that the failure carries no per-set
// information (it fires identically for a real or decoy vault).
//
// JSON.parse succeeds on 'null', '123', '[]', '"str"', 'true' — all are valid JSON but
// none are plain objects. Without the post-parse type check, callers that dereference
// the result (e.g. blob.kekWrap) would throw a raw TypeError instead of the stable
// KEK_ERR.MALFORMED_VAULT code. These cases must be rejected at the parse boundary.
//
// These tests assert the CODE (KEK_ERR.MALFORMED_VAULT), never prose: the string is the
// contract that native.js's catch sites and the UI error mapping key off.
//
// Mutation-check (reasoned, not run): deleting the `typeof raw !== 'string'` guard turns
// the 123/null/undefined cases into a raw `JSON.parse` TypeError-or-coercion, and
// deleting the try/catch turns the 'not json' / '' cases into a raw SyntaxError — either
// way `.toThrow(KEK_ERR.MALFORMED_VAULT)` fails, because toThrow(string) matches on the
// message substring. The post-parse type check handles the valid-JSON-non-object cases.
// The happy-path cases fail if the guards over-reject.

import { describe, it, expect } from 'vitest';
import { parseVaultBlob, KEK_ERR } from '../kek.js';

describe('parseVaultBlob — non-object JSON (valid JSON, non-object result)', () => {
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

describe('parseVaultBlob — corrupt input fails closed with KEK_ERR.MALFORMED_VAULT', () => {
  it('rejects a non-JSON string → MALFORMED_VAULT (not a raw SyntaxError)', () => {
    expect(() => parseVaultBlob('not json')).toThrow(KEK_ERR.MALFORMED_VAULT);
  });

  it('rejects an empty string → MALFORMED_VAULT', () => {
    // JSON.parse('') throws SyntaxError; the wrapper must normalise it.
    expect(() => parseVaultBlob('')).toThrow(KEK_ERR.MALFORMED_VAULT);
  });

  it('rejects a truncated / malformed JSON object → MALFORMED_VAULT', () => {
    expect(() => parseVaultBlob('{"v":2')).toThrow(KEK_ERR.MALFORMED_VAULT);
  });

  it('rejects a number → MALFORMED_VAULT (type guard, before JSON.parse)', () => {
    expect(() => parseVaultBlob(123)).toThrow(KEK_ERR.MALFORMED_VAULT);
  });

  it('rejects null → MALFORMED_VAULT', () => {
    expect(() => parseVaultBlob(null)).toThrow(KEK_ERR.MALFORMED_VAULT);
  });

  it('rejects undefined → MALFORMED_VAULT', () => {
    expect(() => parseVaultBlob(undefined)).toThrow(KEK_ERR.MALFORMED_VAULT);
  });

  it('rejects a boolean → MALFORMED_VAULT', () => {
    expect(() => parseVaultBlob(false)).toThrow(KEK_ERR.MALFORMED_VAULT);
  });

  it('throws the stable code and never leaks the underlying parser error text', () => {
    // Deniability/response-hygiene: the message is exactly the machine code, so a
    // corrupt-vault failure cannot disclose parser internals or blob contents.
    let err;
    try {
      parseVaultBlob('{ this is not json }');
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe(KEK_ERR.MALFORMED_VAULT);
    expect(err.name).toBe('Error'); // not 'SyntaxError'
  });
});

describe('parseVaultBlob — valid input (sanity: the guards do not over-reject)', () => {
  it('parses a valid JSON vault blob string', () => {
    expect(parseVaultBlob('{"v":2}')).toEqual({ v: 2 });
  });

  it('parses a KEK-enrolled blob shape and preserves its fields', () => {
    const raw = '{"v":2,"kekWrap":"abc","kekSalt":"def"}';
    expect(parseVaultBlob(raw)).toEqual({ v: 2, kekWrap: 'abc', kekSalt: 'def' });
  });

  it('returns an already-parsed object unchanged (same reference)', () => {
    // Some stores hand back an object rather than a string; documented passthrough.
    const obj = { v: 2, kekWrap: 'abc' };
    expect(parseVaultBlob(obj)).toBe(obj);
  });
});
