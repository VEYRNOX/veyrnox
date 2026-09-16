import { describe, it, expect } from 'vitest';
import { isSafeNewsLinkUrl, safeNewsLinkUrl } from '@/lib/newsLinkUrl';

describe('isSafeNewsLinkUrl', () => {
  it('accepts publisher article URLs', () => {
    expect(isSafeNewsLinkUrl('https://cointelegraph.com/news/some-story')).toBe(true);
    expect(isSafeNewsLinkUrl('https://decrypt.co/12345/some-story')).toBe(true);
  });

  it('accepts publisher subdomains', () => {
    expect(isSafeNewsLinkUrl('https://www.cointelegraph.com/news/x')).toBe(true);
    expect(isSafeNewsLinkUrl('https://es.cointelegraph.com/news/x')).toBe(true);
  });

  it('rejects a lookalike registrable domain', () => {
    // `evildecrypt.co` ends with `decrypt.co`. A bare endsWith would pass it.
    expect(isSafeNewsLinkUrl('https://evildecrypt.co/x')).toBe(false);
    expect(isSafeNewsLinkUrl('https://decrypt.co.attacker.com/x')).toBe(false);
  });

  it('rejects non-https schemes', () => {
    // CSP script-src blocks javascript: from executing; the rest of the scheme
    // space is what this adds, and on native those reach the OS.
    expect(isSafeNewsLinkUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeNewsLinkUrl('http://cointelegraph.com/news/x')).toBe(false);
    expect(isSafeNewsLinkUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isSafeNewsLinkUrl('intent://evil#Intent;scheme=http;end')).toBe(false);
  });

  it('rejects unparseable, empty and non-string input', () => {
    expect(isSafeNewsLinkUrl('not a url')).toBe(false);
    expect(isSafeNewsLinkUrl('')).toBe(false);
    expect(isSafeNewsLinkUrl(null)).toBe(false);
    expect(isSafeNewsLinkUrl(undefined)).toBe(false);
  });
});

describe('safeNewsLinkUrl', () => {
  it('returns null rather than a fallback destination', () => {
    // Fails CLOSED to "no link". A placeholder href would send a tap somewhere
    // the user did not ask to go.
    expect(safeNewsLinkUrl('javascript:alert(1)')).toBeNull();
    expect(safeNewsLinkUrl('https://cointelegraph.com/news/x'))
      .toBe('https://cointelegraph.com/news/x');
  });
});
