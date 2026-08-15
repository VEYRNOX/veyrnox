import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { extractWcUri, setPendingWcUri, takePendingWcUri, clearPendingWcUri } from '@/lib/deepLinkPairing';

describe('extractWcUri', () => {
  const WC = 'wc:8a5b1c2d@2?relay-protocol=irn&symKey=deadbeef';

  it('passes a raw wc: URI through unchanged', () => {
    expect(extractWcUri(WC)).toBe(WC);
  });

  it('extracts the wc: URI from a veyrnox:// custom-scheme link', () => {
    const link = `veyrnox://wc?uri=${encodeURIComponent(WC)}`;
    expect(extractWcUri(link)).toBe(WC);
  });

  it('extracts the wc: URI from an https://veyrnox.com universal link', () => {
    const link = `https://veyrnox.com/wc?uri=${encodeURIComponent(WC)}`;
    expect(extractWcUri(link)).toBe(WC);
  });

  it('tolerates a double-encoded uri param', () => {
    const link = `veyrnox://wc?uri=${encodeURIComponent(encodeURIComponent(WC))}`;
    expect(extractWcUri(link)).toBe(WC);
  });

  it('returns null for a non-pairing link (no wc: URI)', () => {
    expect(extractWcUri('https://veyrnox.com/wc')).toBeNull();
    expect(extractWcUri('veyrnox://settings')).toBeNull();
    expect(extractWcUri('https://veyrnox.com/wc?uri=not-a-wc-uri')).toBeNull();
  });

  // Codex P2 2026-08-15: reject a wc: URI smuggled through a URL that is NOT
  // one of the two documented pairing entry points. Previously any URL with a
  // uri=wc:… param was accepted, letting another app drive Veyrnox to
  // /walletconnect via arbitrary custom-scheme or https URLs.
  it('rejects wc: URI smuggled through a non-pairing custom-scheme URL', () => {
    const link = `veyrnox://anything?uri=${encodeURIComponent(WC)}`;
    expect(extractWcUri(link)).toBeNull();
  });

  it('rejects wc: URI smuggled through a non-pairing veyrnox.com path', () => {
    const link = `https://veyrnox.com/whatever?uri=${encodeURIComponent(WC)}`;
    expect(extractWcUri(link)).toBeNull();
  });

  it('rejects wc: URI smuggled through an unrelated https host', () => {
    const link = `https://evil.example/wc?uri=${encodeURIComponent(WC)}`;
    expect(extractWcUri(link)).toBeNull();
  });

  it('returns null for empty / non-string / malformed input (never throws)', () => {
    expect(extractWcUri('')).toBeNull();
    expect(extractWcUri(null)).toBeNull();
    expect(extractWcUri(undefined)).toBeNull();
    expect(extractWcUri('::::not a url')).toBeNull();
  });
});

describe('pending URI hand-off', () => {
  beforeEach(() => { takePendingWcUri(); }); // clear

  it('is one-shot: take returns then clears', () => {
    setPendingWcUri('wc:abc@2');
    expect(takePendingWcUri()).toBe('wc:abc@2');
    expect(takePendingWcUri()).toBeNull(); // consumed
  });

  it('starts empty', () => {
    expect(takePendingWcUri()).toBeNull();
  });

  // Codex P2 2026-08-15: pending URIs expire so a link delivered pre-unlock
  // cannot surprise the user on a much later unlock. clearPendingWcUri is
  // called from WalletProvider.lock() as belt-and-suspenders.
  describe('TTL + clear-on-lock (Codex P2 2026-08-15)', () => {
    afterEach(() => { vi.useRealTimers(); });

    it('expires a pending URI after 5 minutes', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-15T12:00:00Z'));
      setPendingWcUri('wc:stale@2');
      vi.setSystemTime(new Date('2026-08-15T12:05:01Z')); // 5m 1s later
      expect(takePendingWcUri()).toBeNull();
    });

    it('still returns a fresh URI within the TTL window', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-15T12:00:00Z'));
      setPendingWcUri('wc:fresh@2');
      vi.setSystemTime(new Date('2026-08-15T12:04:59Z')); // just under 5m
      expect(takePendingWcUri()).toBe('wc:fresh@2');
    });

    it('clearPendingWcUri drops the URI so a later take returns null', () => {
      setPendingWcUri('wc:tobecleared@2');
      clearPendingWcUri();
      expect(takePendingWcUri()).toBeNull();
    });
  });
});
