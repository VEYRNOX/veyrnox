// src/wallet-core/keystore/__tests__/web.base64url-helpers.test.js
//
// L-6 (#742): the web keystore's bespoke base64url encode/decode helpers
// (bufferToB64u / b64uToBuffer) had zero test coverage. They handle WebAuthn
// credential IDs: bufferToB64u encodes rawId for persistence + the passkey
// credId return; b64uToBuffer restores credId into the allowCredentials filter.
// A bug in either silently corrupts the allowCredentials `id` bytes, producing
// opaque WebAuthn "no matching credential" failures on unlock.
//
// These are pure byte<->string transforms, so they are extracted to their own
// tiny module (web-base64url.js) and tested directly — no browser/WebAuthn mock
// needed. The extraction changed NO logic: web.js imports the same functions.
//
// This is real coverage of a real control, not a mocked control made to look
// real: the assertions pin exact byte identity and the URL-safe alphabet.

import { describe, it, expect } from 'vitest';
import { bufferToB64u, b64uToBuffer } from '../web-base64url.js';

/** Compare two byte sequences for exact equality (length + every byte). */
function bytesEqual(a, b) {
  const ua = a instanceof Uint8Array ? a : new Uint8Array(a);
  const ub = b instanceof Uint8Array ? b : new Uint8Array(b);
  if (ua.length !== ub.length) return false;
  for (let i = 0; i < ua.length; i++) {
    if (ua[i] !== ub[i]) return false;
  }
  return true;
}

describe('web base64url helpers (L-6 #742)', () => {
  describe('round-trip: b64uToBuffer(bufferToB64u(x)) === x', () => {
    it('preserves 16 all-zero bytes', () => {
      const input = new Uint8Array(16); // all zero
      const out = b64uToBuffer(bufferToB64u(input));
      expect(out).toBeInstanceOf(Uint8Array);
      expect(bytesEqual(out, input)).toBe(true);
    });

    it('preserves high bytes > 127', () => {
      const input = new Uint8Array([128, 191, 255]);
      const out = b64uToBuffer(bufferToB64u(input));
      expect(bytesEqual(out, input)).toBe(true);
    });

    it('preserves a random-ish low/high mix', () => {
      const input = new Uint8Array([0, 1, 127, 128, 254, 255]);
      const out = b64uToBuffer(bufferToB64u(input));
      expect(bytesEqual(out, input)).toBe(true);
    });

    it('preserves every single byte value 0..255 in one buffer', () => {
      const input = new Uint8Array(256);
      for (let i = 0; i < 256; i++) input[i] = i;
      const out = b64uToBuffer(bufferToB64u(input));
      expect(bytesEqual(out, input)).toBe(true);
    });

    it('round-trips buffers of every length 0..8 (padding-boundary sweep)', () => {
      for (let n = 0; n <= 8; n++) {
        const input = new Uint8Array(n);
        for (let i = 0; i < n; i++) input[i] = (i * 37 + 13) & 0xff;
        const out = b64uToBuffer(bufferToB64u(input));
        expect(bytesEqual(out, input)).toBe(true);
      }
    });
  });

  describe('bufferToB64u output is URL-safe base64 (no +, /, or = padding)', () => {
    it('never emits +, /, or = for a byte pattern that yields all three in standard base64', () => {
      // 0xFF,0xFF,0xFF -> standard base64 "////"; 0xFB,0xFF,0xBF -> "+/+/"-ish.
      // A single 0xFF byte -> "/w==" in standard base64 (both '/' and padding).
      const inputs = [
        new Uint8Array([0xff, 0xff, 0xff]), // -> "////" standard
        new Uint8Array([0xfb, 0xff, 0xbf]), // contains '+' and '/' standard
        new Uint8Array([0xff]), // -> "/w==" standard (slash + padding)
      ];
      for (const input of inputs) {
        const encoded = bufferToB64u(input);
        expect(encoded).not.toMatch(/[+/=]/);
      }
    });

    it('maps standard "/" to "_" and "+" to "-"', () => {
      // 0xFF,0xFF,0xFF => btoa => "////" => url-safe => "____"
      expect(bufferToB64u(new Uint8Array([0xff, 0xff, 0xff]))).toBe('____');
      // 0xFB,0xFF,0xBF => btoa => "+/+/"? verify exact url-safe form has - and _
      const enc = bufferToB64u(new Uint8Array([0xfb, 0xff, 0xbf]));
      expect(enc).toContain('-');
      expect(enc).toContain('_');
      expect(enc).not.toMatch(/[+/]/);
    });

    it('strips trailing padding (no "=" for lengths that would pad)', () => {
      // 1 byte and 2 bytes both produce padding in standard base64.
      expect(bufferToB64u(new Uint8Array([0x00]))).not.toContain('=');
      expect(bufferToB64u(new Uint8Array([0x00, 0x00]))).not.toContain('=');
    });
  });

  describe('b64uToBuffer input handling', () => {
    it('decodes standard base64url (unpadded) to the correct bytes', () => {
      // "____" is the url-safe form of "////" == [0xFF,0xFF,0xFF]
      expect(bytesEqual(b64uToBuffer('____'), new Uint8Array([0xff, 0xff, 0xff]))).toBe(true);
    });

    it('tolerates input that already carries "=" padding (documented behaviour)', () => {
      // Some callers/persisted values may include padding. b64uToBuffer computes
      // pad off the CURRENT length; a string that is already a multiple of 4
      // (because it includes '=') gets no extra pad, and atob accepts the '='.
      // Documenting the ACTUAL behaviour: padded input decodes to the same bytes.
      const padded = 'AA=='; // standard/url-safe base64 for a single 0x00 byte
      const out = b64uToBuffer(padded);
      expect(bytesEqual(out, new Uint8Array([0x00]))).toBe(true);
    });

    it('decodes a mixed high/low value from its url-safe string', () => {
      const input = new Uint8Array([0, 1, 127, 128, 254, 255]);
      const encoded = bufferToB64u(input);
      expect(bytesEqual(b64uToBuffer(encoded), input)).toBe(true);
    });
  });

  describe('identity for a known credential-like 16-byte value', () => {
    it('encodes then decodes a fixed 16-byte credential id to the exact same bytes', () => {
      // Deterministic 16-byte "credential id" spanning padding and high bytes.
      const credId = new Uint8Array([
        0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb,
        0xcc, 0xdd, 0xee, 0xff,
      ]);
      const encoded = bufferToB64u(credId);
      expect(encoded).not.toMatch(/[+/=]/); // stays url-safe / unpadded
      const decoded = b64uToBuffer(encoded);
      expect(decoded).toBeInstanceOf(Uint8Array);
      expect(decoded.length).toBe(16);
      expect(bytesEqual(decoded, credId)).toBe(true);
    });
  });
});
