// Unit tests for the PURE helpers of the PRF-in-WebView spike (dev/prfSpike.js).
//
// The WebAuthn calls (create/get + prf eval) need a real platform authenticator
// and are exercised by hand on the AVD emulator + a physical Android device
// (docs/prf-webview-spike-brief.md §3). What IS unit-testable — and load-bearing —
// is the hex encoding, the non-empty equality used for the stability comparison,
// and classifyOutcome() which maps measured facts to the spec's A/B/C verdict.

import { describe, it, expect } from 'vitest';
import { bytesToHex, hexEqual, classifyOutcome, FIXED_SALT } from '../prfSpike.js';

describe('bytesToHex', () => {
  it('hex-encodes a Uint8Array, zero-padded lowercase', () => {
    expect(bytesToHex(new Uint8Array([0x00, 0x0f, 0xff, 0xa0]))).toBe('000fffa0');
  });

  it('accepts a raw ArrayBuffer', () => {
    const u = new Uint8Array([1, 2, 254]);
    expect(bytesToHex(u.buffer)).toBe('0102fe');
  });

  it('returns empty string for null/undefined', () => {
    expect(bytesToHex(null)).toBe('');
    expect(bytesToHex(undefined)).toBe('');
  });
});

describe('hexEqual — non-empty stable equality', () => {
  it('true only for two identical non-empty strings', () => {
    expect(hexEqual('abcd', 'abcd')).toBe(true);
  });

  it('false for differing values', () => {
    expect(hexEqual('abcd', 'abce')).toBe(false);
  });

  it('false when either side is empty/absent (two "no outputs" are NOT a match)', () => {
    expect(hexEqual('', '')).toBe(false);
    expect(hexEqual('abcd', '')).toBe(false);
    expect(hexEqual(null, null)).toBe(false);
    expect(hexEqual(undefined, 'abcd')).toBe(false);
  });
});

describe('FIXED_SALT — determinism is the whole point', () => {
  it('is a fixed 32-byte salt (constant, not random)', () => {
    expect(FIXED_SALT).toBeInstanceOf(Uint8Array);
    expect(FIXED_SALT.length).toBe(32);
    // first 8 bytes spell "Veyrnox-" — pins the constant so a refactor can't
    // silently randomise it (which would break reproducibility of H).
    expect(bytesToHex(FIXED_SALT.slice(0, 8))).toBe('566579726e6f782d');
  });
});

describe('classifyOutcome — facts → spec A/B/C verdict', () => {
  it('A: prf reachable, stable intra AND across restart', () => {
    const o = classifyOutcome({ webauthn: true, prfEnabled: true, evalOk: true, intraStable: true, crossRestart: 'match' });
    expect(o.code).toBe('A');
  });

  it('A_PENDING: stable this session but no prior value to compare yet', () => {
    const o = classifyOutcome({ webauthn: true, prfEnabled: true, evalOk: true, intraStable: true, crossRestart: 'none' });
    expect(o.code).toBe('A_PENDING');
  });

  it('C: prf reachable but output changes per call', () => {
    const o = classifyOutcome({ webauthn: true, prfEnabled: true, evalOk: true, intraStable: false, crossRestart: 'none' });
    expect(o.code).toBe('C');
  });

  it('C: stable within a session but different after restart', () => {
    const o = classifyOutcome({ webauthn: true, prfEnabled: true, evalOk: true, intraStable: true, crossRestart: 'mismatch' });
    expect(o.code).toBe('C');
  });

  it('WEBVIEW_FAIL (→ native-bridge probe) when WebAuthn is absent', () => {
    const o = classifyOutcome({ webauthn: false, prfEnabled: false, evalOk: false, intraStable: null, crossRestart: 'none' });
    expect(o.code).toBe('WEBVIEW_FAIL');
    expect(o.next).toMatch(/native-bridge/i);
  });

  it('WEBVIEW_FAIL when prf is unsupported / yields no bytes', () => {
    expect(classifyOutcome({ webauthn: true, prfEnabled: false, evalOk: false, intraStable: null, crossRestart: 'none' }).code).toBe('WEBVIEW_FAIL');
    expect(classifyOutcome({ webauthn: true, prfEnabled: true, evalOk: false, intraStable: null, crossRestart: 'none' }).code).toBe('WEBVIEW_FAIL');
  });

  it('every verdict carries a title, detail and a next action', () => {
    for (const facts of [
      { webauthn: true, prfEnabled: true, evalOk: true, intraStable: true, crossRestart: 'match' },
      { webauthn: true, prfEnabled: true, evalOk: true, intraStable: false, crossRestart: 'none' },
      { webauthn: false, prfEnabled: false, evalOk: false, intraStable: null, crossRestart: 'none' },
    ]) {
      const o = classifyOutcome(facts);
      expect(typeof o.title).toBe('string');
      expect(o.title.length).toBeGreaterThan(0);
      expect(typeof o.detail).toBe('string');
      expect(typeof o.next).toBe('string');
      expect(o.next.length).toBeGreaterThan(0);
    }
  });
});
