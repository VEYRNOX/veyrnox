import { describe, it, expect } from 'vitest';
import {
  isSafeNewsThumbUrl,
  safeNewsThumbUrl,
  PLACEHOLDER_NEWS_THUMB,
} from '../newsThumbUrl.js';

describe('isSafeNewsThumbUrl — scheme handling', () => {
  it('rejects http://', () => {
    expect(isSafeNewsThumbUrl('http://images.cointelegraph.com/x.png')).toBe(false);
  });
  it('rejects javascript: URLs', () => {
    expect(isSafeNewsThumbUrl('javascript:alert(1)')).toBe(false);
  });
  it('rejects file:// URLs', () => {
    expect(isSafeNewsThumbUrl('file:///etc/passwd')).toBe(false);
  });
  it('rejects protocol-relative //host/path', () => {
    expect(isSafeNewsThumbUrl('//attacker.example/x.png')).toBe(false);
  });
  it('rejects empty / non-string', () => {
    expect(isSafeNewsThumbUrl('')).toBe(false);
    expect(isSafeNewsThumbUrl(null)).toBe(false);
    expect(isSafeNewsThumbUrl(undefined)).toBe(false);
    expect(isSafeNewsThumbUrl(42)).toBe(false);
  });
  it('rejects malformed URLs', () => {
    expect(isSafeNewsThumbUrl('not a url')).toBe(false);
    expect(isSafeNewsThumbUrl('https://')).toBe(false);
  });
});

describe('isSafeNewsThumbUrl — allowlisted publisher CDNs', () => {
  it('accepts images.cointelegraph.com', () => {
    expect(isSafeNewsThumbUrl('https://images.cointelegraph.com/a.jpg')).toBe(true);
  });
  it('accepts s3.cointelegraph.com', () => {
    expect(isSafeNewsThumbUrl('https://s3.cointelegraph.com/a.jpg')).toBe(true);
  });
  it('accepts cdn.decrypt.co', () => {
    expect(isSafeNewsThumbUrl('https://cdn.decrypt.co/a.jpg')).toBe(true);
  });
  it('accepts img.decrypt.co', () => {
    expect(isSafeNewsThumbUrl('https://img.decrypt.co/a.jpg')).toBe(true);
  });
  it('is case-insensitive on host', () => {
    expect(isSafeNewsThumbUrl('https://Images.CoinTelegraph.com/a.jpg')).toBe(true);
  });
});

describe('isSafeNewsThumbUrl — unknown / attacker hosts', () => {
  it('rejects arbitrary https hosts (M-10 threat)', () => {
    expect(isSafeNewsThumbUrl('https://attacker.example/tracker.png')).toBe(false);
  });
  it('rejects a lookalike subdomain', () => {
    expect(isSafeNewsThumbUrl('https://cointelegraph.com.attacker.example/x')).toBe(false);
  });
  it('rejects a suffix-match trick', () => {
    expect(isSafeNewsThumbUrl('https://evilcointelegraph.com/x.png')).toBe(false);
  });
  it('rejects userinfo trickery', () => {
    expect(isSafeNewsThumbUrl('https://images.cointelegraph.com@attacker.example/x.png')).toBe(false);
  });
  it('rejects bare cointelegraph.com (only media subdomains are allowlisted)', () => {
    expect(isSafeNewsThumbUrl('https://cointelegraph.com/x.png')).toBe(false);
  });
});

describe('isSafeNewsThumbUrl — data: URIs', () => {
  it('accepts a small image/png data URI', () => {
    expect(isSafeNewsThumbUrl('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
  });
  it('accepts image/svg+xml data URI', () => {
    expect(isSafeNewsThumbUrl('data:image/svg+xml;utf8,<svg/>')).toBe(true);
  });
  it('rejects data URIs that are not images', () => {
    expect(isSafeNewsThumbUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isSafeNewsThumbUrl('data:application/javascript,alert(1)')).toBe(false);
  });
  it('rejects oversize data URIs', () => {
    const huge = 'data:image/png;base64,' + 'A'.repeat(65 * 1024);
    expect(isSafeNewsThumbUrl(huge)).toBe(false);
  });
});

describe('safeNewsThumbUrl', () => {
  it('returns the URL when safe', () => {
    const u = 'https://images.cointelegraph.com/a.jpg';
    expect(safeNewsThumbUrl(u)).toBe(u);
  });
  it('returns the neutral placeholder when unsafe', () => {
    expect(safeNewsThumbUrl('https://attacker.example/x.png')).toBe(PLACEHOLDER_NEWS_THUMB);
    expect(safeNewsThumbUrl(undefined)).toBe(PLACEHOLDER_NEWS_THUMB);
  });
  it('placeholder itself is a data: URI (no network fetch)', () => {
    expect(PLACEHOLDER_NEWS_THUMB.startsWith('data:image/svg+xml')).toBe(true);
  });
});
