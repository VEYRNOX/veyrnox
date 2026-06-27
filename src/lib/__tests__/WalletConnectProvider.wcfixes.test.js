// src/lib/__tests__/WalletConnectProvider.wcfixes.test.js
//
// Behavioural unit tests for two WC signing controls, against the exported pure
// helpers that back them (the React component delegators are thin callers):
//
//   H-NEW-2: a signing request whose topic is NOT a live session must be refused
//            BEFORE any key access. The provider resolves the session by topic and
//            runs checkSessionExpiry(); a missing session yields SESSION_NOT_FOUND
//            (and an expired one SESSION_EXPIRED) — both fail closed (I4).
//   M-NEW-4: the 1M gas cap is applied UNCONDITIONALLY. resolveGasLimit clamps to
//            WC_GAS_CAP whether the cap is hit by a dApp-supplied `gas` OR by our
//            own estimate when `gas` is omitted — closing the auto-estimate bypass.
//
// We also keep a structural guard that assertSessionLive runs before the key in each
// delegator (the binding cannot regress to "sign then check").

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { resolveGasLimit, WC_GAS_CAP, checkSessionExpiry } from '../WalletConnectProvider.jsx';

// ---- M-NEW-4: unconditional 1M gas cap --------------------------------------

describe('M-NEW-4 — 1M gas cap is unconditional', () => {
  it('clamps a dApp-supplied gas above the cap down to WC_GAS_CAP', () => {
    expect(resolveGasLimit('0x1312D00' /* 20,000,000 */, 0n)).toBe(WC_GAS_CAP);
    expect(resolveGasLimit(5_000_000n, 0n)).toBe(WC_GAS_CAP);
  });

  it('passes a dApp-supplied gas below the cap through unchanged', () => {
    expect(resolveGasLimit(21_000n, 0n)).toBe(21_000n);
  });

  it('clamps our OWN estimate when the dApp omits gas (the bypass M-NEW-4 closes)', () => {
    // gas omitted (undefined) → use the estimate, then still clamp it to the cap.
    expect(resolveGasLimit(undefined, 9_000_000n)).toBe(WC_GAS_CAP);
    expect(resolveGasLimit(undefined, 100_000n)).toBe(100_000n);
  });

  it('caps at exactly 1,000,000', () => {
    expect(WC_GAS_CAP).toBe(1_000_000n);
  });
});

// ---- H-NEW-2: topic must be a live session before signing -------------------

describe('H-NEW-2 — topic must resolve to a live session before signing', () => {
  it('returns SESSION_NOT_FOUND for a missing/unknown session (fail closed)', () => {
    const r = checkSessionExpiry(undefined);
    expect(r.ok).toBe(false);
    expect(r.code).toBe('SESSION_NOT_FOUND');
  });

  it('returns SESSION_EXPIRED for a session with no usable expiry', () => {
    const r = checkSessionExpiry({ topic: 't' });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('SESSION_EXPIRED');
  });

  it('returns SESSION_EXPIRED for a session already past expiry', () => {
    const nowMs = 2_000_000_000_000;
    const r = checkSessionExpiry({ expiry: 1_000 /* seconds, far in the past */ }, nowMs);
    expect(r.ok).toBe(false);
    expect(r.code).toBe('SESSION_EXPIRED');
  });

  it('accepts a session whose expiry is in the future', () => {
    const nowMs = 1_000_000;
    const r = checkSessionExpiry({ expiry: 2_000 /* 2,000s = 2,000,000ms > now */ }, nowMs);
    expect(r.ok).toBe(true);
  });
});

// ---- Structural: the binding runs BEFORE the key in every delegator ---------

describe('H-NEW-2 — assertSessionLive gates each delegator before key access', () => {
  const raw = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '../WalletConnectProvider.jsx'),
    'utf8',
  );
  const src = raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  function delegatorBody(name) {
    const start = src.indexOf(`const ${name} = useCallback(`);
    expect(start, `${name} not found`).toBeGreaterThan(-1);
    const after = src.indexOf('const handle', start + 1);
    return src.slice(start, after === -1 ? undefined : after);
  }

  for (const name of ['handlePersonalSign', 'handleSignTypedData', 'handleSendTransaction']) {
    it(`${name} calls assertSessionLive before the _handle* key path`, () => {
      const body = delegatorBody(name);
      const guardIdx = body.indexOf('assertSessionLive');
      const keyIdx = body.indexOf('_handle');
      expect(guardIdx).toBeGreaterThan(-1);
      expect(keyIdx).toBeGreaterThan(-1);
      expect(guardIdx).toBeLessThan(keyIdx);
    });
  }
});
