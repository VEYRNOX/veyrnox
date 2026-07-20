import { describe, it, expect, beforeEach } from 'vitest';
import { extractWcUri, setPendingWcUri, takePendingWcUri } from '@/lib/deepLinkPairing';

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
});
