// wallet-core/keystore/web-base64url.js
//
// Bespoke base64url encode/decode for WebAuthn credential-ID handling on web.
// Extracted verbatim from web.js (L-6 #742) so the byte<->string transforms are
// unit-testable in isolation without a WebAuthn/browser mock. The LOGIC is
// unchanged — web.js imports these same functions.
//
// bufferToB64u: encodes a credential rawId to a URL-safe, unpadded base64 string
//   for persistence (localStorage) and the createPrfCredential() return value.
// b64uToBuffer: restores that credential id back to bytes for the WebAuthn
//   allowCredentials `id` filter on get(). A bug in either corrupts the filter
//   and yields opaque "no matching credential" failures.

/**
 * Encode a Uint8Array (or ArrayBuffer view) to base64url (no padding).
 * Used for the WebAuthn allowCredentials filter and credential-id persistence.
 * Returns URL-safe base64 with no '+', '/', or '=' padding.
 * @param {Uint8Array|ArrayBuffer} buf
 * @returns {string}
 */
export function bufferToB64u(buf) {
  const b = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Decode a base64url string to a Uint8Array.
 * Used to restore credentialId from localStorage for get(). The return type is
 * left to inference (Uint8Array<ArrayBuffer>) so the result stays assignable to
 * the WebAuthn BufferSource `allowCredentials[].id` slot — matching the original
 * inline definition. Do NOT annotate `@returns {Uint8Array}`: that widens to
 * Uint8Array<ArrayBufferLike> and breaks the web.js call site.
 * @param {string} s base64url string (padding optional)
 */
export function b64uToBuffer(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const str = atob(b64 + pad);
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i);
  return out;
}
