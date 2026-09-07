// src/__tests__/androidBiometricCache.kekPrecondition.test.js
//
// Audit 2026-09-07 M-6 — static invariants over the unauth-alias guard in
// android/app/src/main/java/com/veyrnox/app/AndroidBiometricCachePlugin.kt.
//
// WHY THE UNAUTH ALIAS NEEDS A GUARD AT ALL. It is deliberately built WITHOUT
// setUserAuthenticationRequired, so reading it fires no biometric prompt. The
// only thing that makes that acceptable is the KEK invariant: on a KEK-wrapped
// vault the cached PIN is the C-factor of DEK = HKDF(H ‖ C), and H is producible
// only inside a StrongBox/TEE-gated op, so C alone opens nothing. Take the KEK
// away and the same cached PIN IS the vault password, released with no prompt.
//
// That state is reachable, not hypothetical: clearHardwareCredential() deletes
// the KEK key (wallet-core/keystore/hardware.js) and does NOT purge this cache,
// and an OS biometric-enrollment change wipes the key too.
//
// WHY NOT THE FIX THE AUDIT SUGGESTED. The audit proposed requiring the caller to
// pass `kekEnrolled: true`. That would be decoration: the threat model here is
// injected in-page JS on a compromised runtime calling the plugin directly, and
// such a caller controls every argument it passes. biometricUnlock.js already
// says exactly this — "a caller-attested isEnrolled flag would not be
// trustworthy here" — so the guard is a Keystore fact instead, which the caller
// cannot forge.
//
// WHY A SOURCE SCAN. The guard is native and depends on AndroidKeyStore, so it
// cannot be exercised from vitest; a real behavioural test needs an instrumented
// device run. This pins the two things that would silently break it, in the same
// style as android-manifest.test.js (which also reads Android sources directly):
//   1. the alias literal drifting from HardwareKekPlugin.KEY_ALIAS, and
//   2. either guard being dropped.
// Comments are stripped before asserting, because the guard's own comment quotes
// the constant and the rejected-alternative by name.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const android = resolve(here, '../../android/app/src/main/java/com/veyrnox/app');

const rawCache = readFileSync(resolve(android, 'AndroidBiometricCachePlugin.kt'), 'utf8');
const rawKek = readFileSync(resolve(android, 'HardwareKekPlugin.kt'), 'utf8');

// Drop whole-line `//` comments only, so a `//` inside a string literal cannot
// truncate a line of real code.
const stripComments = (src) => src
  .split('\n')
  .filter((line) => !/^\s*\/\//.test(line))
  .join('\n');

const cache = stripComments(rawCache);

// Slice ONE method body, bounded by the next @PluginMethod. A fixed-size window
// is not safe here: putSecretUnauth is immediately followed by getSecretUnauth,
// so a generous window around the former still matches the LATTER's guard —
// verified by removing the write guard and watching the test stay green. That is
// the false-pin failure this file exists to avoid, so the bound is structural.
function methodBody(src, name) {
  const start = src.indexOf(`fun ${name}(call: PluginCall)`);
  if (start < 0) return '';
  const next = src.indexOf('@PluginMethod', start);
  return src.slice(start, next < 0 ? src.length : next);
}
const kek = stripComments(rawKek);

describe('AndroidBiometricCachePlugin — unauth alias requires a hardware KEK (audit M-6)', () => {
  it('strips comments without eating the code under test', () => {
    // Guards the guard: if the stripper removed real lines, the assertions below
    // would pass or fail for reasons unrelated to the code.
    expect(cache).toMatch(/hardwareKekPresent/);
    expect(rawCache.split('\n').length - cache.split('\n').length).toBeGreaterThan(0);
  });

  it('probes the SAME Keystore alias HardwareKekPlugin enrols', () => {
    // The drift risk called out in hardwareKekPresent()'s own comment. KEY_ALIAS
    // is private in HardwareKekPlugin, so the constant is duplicated rather than
    // shared; if either side is renamed the guard silently probes an alias that
    // never exists, `hardwareKekPresent()` returns false forever, and the unauth
    // fast path is dead — a availability failure, not a security one, but a
    // silent one either way.
    const kekAlias = kek.match(/KEY_ALIAS\s*=\s*"([^"]+)"/)?.[1];
    const cacheAlias = cache.match(/HARDWARE_KEK_ALIAS\s*=\s*"([^"]+)"/)?.[1];
    expect(kekAlias).toBeTruthy();
    expect(cacheAlias).toBe(kekAlias);
  });

  it('gates the unauth READ on the KEK being present', () => {
    const body = methodBody(cache, 'getSecretUnauth');
    expect(body).toMatch(/if\s*\(!hardwareKekPresent\(\)\)/);
  });

  it('gates the unauth WRITE too, so a null read cannot re-create the entry', () => {
    // Read-side only would be undone immediately: on a null read the JS
    // migration fallback calls putSecretUnauth(legacy) right back
    // (biometricUnlock.js nativeReadSecretUnauth).
    const body = methodBody(cache, 'putSecretUnauth');
    expect(body).toMatch(/if\s*\(!hardwareKekPresent\(\)\)/);
  });

  it('purges the stale entry on the read path rather than leaving it', () => {
    const body = methodBody(cache, 'getSecretUnauth');
    expect(body).toMatch(/remove\(dataUnauthKey\)/);
    expect(body).toMatch(/deleteAliasIfPresent\(storageUnauthAlias\)/);
  });

  it('fails CLOSED when the Keystore cannot be queried', () => {
    // A Keystore we cannot read is not evidence of a KEK. The catch must yield
    // false, not true — inverting this turns the guard into a rubber stamp on
    // exactly the devices where something is already wrong.
    const helper = cache.match(/private fun hardwareKekPresent\(\)[\s\S]{0,320}/)?.[0] ?? '';
    expect(helper).toMatch(/catch[\s\S]{0,80}false/);
  });

  it('does NOT take a caller-supplied kekEnrolled flag', () => {
    // The rejected alternative. If someone later "restores" it, the gate becomes
    // an argument the attacker passes — see this file's header.
    expect(cache).not.toMatch(/getString\(\s*"kekEnrolled"/);
    expect(cache).not.toMatch(/getBoolean\(\s*"kekEnrolled"/);
  });
});
