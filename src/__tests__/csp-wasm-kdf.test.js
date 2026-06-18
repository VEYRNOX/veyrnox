// src/__tests__/csp-wasm-kdf.test.js
//
// Regression guard for the CSP-vs-WASM outage (PR #234).
//
// The at-rest vault KDF is Argon2id from `hash-wasm` — a WebAssembly module
// instantiated at runtime (wallet-core/vault.js et al). Modern browsers
// (Chrome) require the `'wasm-unsafe-eval'` source in the CSP `script-src`
// directive to instantiate WebAssembly. A security pass once tightened the
// index.html meta CSP to `script-src 'self'` WITHOUT that token, which silently
// broke EVERY wallet create / import / unlock with:
//   "WebAssembly.compile(): … violates … script-src 'self'"
// — while the whole unit suite stayed green, because jsdom doesn't enforce CSP.
//
// This static guard fails the build if the shipped CSP can no longer run the
// WASM KDF. It is deliberately blunt: the app depends on WebAssembly, so the
// token is mandatory, not optional.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const indexHtml = readFileSync(resolve(here, '../../index.html'), 'utf8');

// Pull the CSP content out of the meta tag (multi-line attribute).
function cspMeta() {
  const m = indexHtml.match(/http-equiv=["']Content-Security-Policy["']\s+content=["']([\s\S]*?)["']\s*\/?>/i);
  return m ? m[1].replace(/\s+/g, ' ').trim() : null;
}

function directive(csp, name) {
  const m = csp.match(new RegExp(`(?:^|;)\\s*${name}\\s+([^;]*)`, 'i'));
  return m ? m[1].trim() : null;
}

describe('CSP can run the WebAssembly KDF (guards PR #234)', () => {
  it('index.html ships a Content-Security-Policy meta tag', () => {
    expect(cspMeta(), 'no CSP meta tag found in index.html').toBeTruthy();
  });

  it("script-src includes 'wasm-unsafe-eval' so Argon2id WASM can instantiate", () => {
    const csp = cspMeta();
    const scriptSrc = directive(csp, 'script-src') ?? directive(csp, 'default-src');
    expect(scriptSrc, 'no script-src/default-src directive').toBeTruthy();
    expect(
      /'wasm-unsafe-eval'/.test(scriptSrc),
      `script-src must allow WebAssembly for the vault KDF. Got: "${scriptSrc}"`,
    ).toBe(true);
  });

  it('the app actually depends on a WASM KDF (so the token is load-bearing, not cosmetic)', () => {
    // If this ever stops being true, revisit whether the token is still needed.
    const vault = readFileSync(resolve(here, '../wallet-core/vault.js'), 'utf8');
    expect(/from ['"]hash-wasm['"]/.test(vault)).toBe(true);
  });
});
