// Pins the deep-link audit HOOK: every extractWcUri decision must fire a
// veyrnox:deeplink CustomEvent, and the event must NEVER carry the wc: pairing
// URI itself — only its origin + length (the URI contains sym-key material).
//
// The listener below is this test's own. NOTHING in production subscribes to
// this event yet, so it records nothing in a shipped build; see the status note
// on emitDeepLinkAudit. The security control is the origin allowlist in
// isVeyrnoxPairingUrl(), which these cases exercise through extractWcUri and
// which does not depend on the event at all.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { extractWcUri } from '@/lib/deepLinkPairing';

let events = [];
function onDeepLink(e) { events.push(e.detail); }

beforeEach(() => {
  events = [];
  window.addEventListener('veyrnox:deeplink', onDeepLink);
});
afterEach(() => {
  window.removeEventListener('veyrnox:deeplink', onDeepLink);
});

describe('deep-link audit', () => {
  it('emits accept for an allowlisted origin', () => {
    extractWcUri('veyrnox://wc?uri=' + encodeURIComponent('wc:abc@2?relay-protocol=irn'));
    expect(events).toHaveLength(1);
    expect(events[0].decision).toBe('accept');
    expect(events[0].origin).toBe('veyrnox://wc');
  });

  it('emits reject for an unlisted origin', () => {
    extractWcUri('https://evil.example.com/wc?uri=' + encodeURIComponent('wc:abc@2'));
    expect(events).toHaveLength(1);
    expect(events[0].decision).toBe('reject');
    expect(events[0].origin).toBe('https://evil.example.com');
  });

  it('emits reject and never leaks the wc: URI when the payload is oversized', () => {
    const huge = 'wc:' + 'a'.repeat(5000);
    extractWcUri(huge);
    expect(events).toHaveLength(1);
    expect(events[0].decision).toBe('reject');
    // Length is reported; the URI itself never appears in the event.
    expect(events[0].length).toBeGreaterThan(4096);
    for (const v of Object.values(events[0])) {
      expect(String(v).startsWith('wc:')).toBe(false);
    }
  });

  it('accepts a raw wc: URI and reports origin as wc-raw', () => {
    extractWcUri('wc:abcdef@2?relay-protocol=irn&symKey=deadbeef');
    expect(events).toHaveLength(1);
    expect(events[0].decision).toBe('accept');
    expect(events[0].origin).toBe('wc-raw');
  });
});
