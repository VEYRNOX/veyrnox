import { describe, it, expect } from 'vitest';
import { isSafeIconUrl, safeIconUrl, PLACEHOLDER_ICON } from '../wcIconUrl.js';

describe('isSafeIconUrl — scheme handling', () => {
  it('rejects http://', () => {
    expect(isSafeIconUrl('http://explorer-api.walletconnect.com/icon.png')).toBe(false);
  });
  it('rejects javascript: URLs', () => {
    expect(isSafeIconUrl('javascript:alert(1)')).toBe(false);
  });
  it('rejects file:// URLs', () => {
    expect(isSafeIconUrl('file:///etc/passwd')).toBe(false);
  });
  it('rejects protocol-relative //host/path', () => {
    expect(isSafeIconUrl('//attacker.example/x.png')).toBe(false);
  });
  it('rejects empty / non-string', () => {
    expect(isSafeIconUrl('')).toBe(false);
    expect(isSafeIconUrl(null)).toBe(false);
    expect(isSafeIconUrl(undefined)).toBe(false);
    expect(isSafeIconUrl(42)).toBe(false);
  });
  it('rejects malformed URLs', () => {
    expect(isSafeIconUrl('not a url')).toBe(false);
    expect(isSafeIconUrl('https://')).toBe(false);
  });
});

describe('isSafeIconUrl — allowlisted https hosts', () => {
  it('accepts explorer-api.walletconnect.com', () => {
    expect(isSafeIconUrl('https://explorer-api.walletconnect.com/w3m/v1/getWalletImage/x')).toBe(true);
  });
  it('accepts registry.walletconnect.com', () => {
    expect(isSafeIconUrl('https://registry.walletconnect.com/logo.png')).toBe(true);
  });
  it('accepts the .org mirrors', () => {
    expect(isSafeIconUrl('https://explorer-api.walletconnect.org/x.png')).toBe(true);
    expect(isSafeIconUrl('https://registry.walletconnect.org/x.png')).toBe(true);
  });
  it('is case-insensitive on host', () => {
    expect(isSafeIconUrl('https://Explorer-API.WalletConnect.com/x')).toBe(true);
  });
});

describe('isSafeIconUrl — unknown / attacker hosts', () => {
  it('rejects arbitrary https hosts (M-4 threat)', () => {
    expect(isSafeIconUrl('https://attacker.example/tracker.png')).toBe(false);
  });
  it('rejects a lookalike subdomain', () => {
    expect(isSafeIconUrl('https://walletconnect.com.attacker.example/x')).toBe(false);
  });
  it('rejects a suffix-match trick', () => {
    // hostname is "evilwalletconnect.com", not walletconnect.com
    expect(isSafeIconUrl('https://evilwalletconnect.com/x.png')).toBe(false);
  });
  it('rejects userinfo trickery', () => {
    // URL parses hostname as attacker.example, not walletconnect.com
    expect(isSafeIconUrl('https://explorer-api.walletconnect.com@attacker.example/x.png')).toBe(false);
  });
});

describe('isSafeIconUrl — data: URIs', () => {
  it('accepts a small image/png data URI', () => {
    expect(isSafeIconUrl('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
  });
  it('accepts image/svg+xml data URI', () => {
    expect(isSafeIconUrl('data:image/svg+xml;utf8,<svg/>')).toBe(true);
  });
  it('rejects data URIs that are not images', () => {
    expect(isSafeIconUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isSafeIconUrl('data:application/javascript,alert(1)')).toBe(false);
  });
  it('rejects oversize data URIs', () => {
    const huge = 'data:image/png;base64,' + 'A'.repeat(65 * 1024);
    expect(isSafeIconUrl(huge)).toBe(false);
  });
});

describe('safeIconUrl', () => {
  it('returns the URL when safe', () => {
    const u = 'https://explorer-api.walletconnect.com/x.png';
    expect(safeIconUrl(u)).toBe(u);
  });
  it('returns the neutral placeholder when unsafe', () => {
    expect(safeIconUrl('https://attacker.example/x.png')).toBe(PLACEHOLDER_ICON);
    expect(safeIconUrl(undefined)).toBe(PLACEHOLDER_ICON);
  });
  it('placeholder itself is a data: URI (no network fetch)', () => {
    expect(PLACEHOLDER_ICON.startsWith('data:image/svg+xml')).toBe(true);
  });
});
