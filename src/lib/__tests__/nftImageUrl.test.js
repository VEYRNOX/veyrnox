import { describe, it, expect } from 'vitest';
import {
  isSafeNftImageUrl,
  safeNftImageUrl,
  PLACEHOLDER_NFT_IMAGE,
} from '../nftImageUrl.js';

describe('isSafeNftImageUrl — scheme handling', () => {
  it('rejects http://', () => {
    expect(isSafeNftImageUrl('http://cloudflare-ipfs.com/ipfs/QmX')).toBe(false);
  });
  it('rejects javascript: URLs', () => {
    expect(isSafeNftImageUrl('javascript:alert(1)')).toBe(false);
  });
  it('rejects file:// URLs', () => {
    expect(isSafeNftImageUrl('file:///etc/passwd')).toBe(false);
  });
  it('rejects protocol-relative //host/path', () => {
    expect(isSafeNftImageUrl('//attacker.example/x.png')).toBe(false);
  });
  it('rejects empty / non-string', () => {
    expect(isSafeNftImageUrl('')).toBe(false);
    expect(isSafeNftImageUrl(null)).toBe(false);
    expect(isSafeNftImageUrl(undefined)).toBe(false);
    expect(isSafeNftImageUrl(42)).toBe(false);
  });
  it('rejects malformed URLs', () => {
    expect(isSafeNftImageUrl('not a url')).toBe(false);
    expect(isSafeNftImageUrl('https://')).toBe(false);
  });
});

describe('isSafeNftImageUrl — allowlisted gateways', () => {
  it('accepts cloudflare-ipfs.com', () => {
    expect(isSafeNftImageUrl('https://cloudflare-ipfs.com/ipfs/Qm123/image.png')).toBe(true);
  });
  it('accepts cf-ipfs.com', () => {
    expect(isSafeNftImageUrl('https://cf-ipfs.com/ipfs/Qm123')).toBe(true);
  });
  it('accepts gateway.pinata.cloud', () => {
    expect(isSafeNftImageUrl('https://gateway.pinata.cloud/ipfs/Qm123')).toBe(true);
  });
  it('accepts a dedicated *.mypinata.cloud subdomain', () => {
    expect(isSafeNftImageUrl('https://acme-nft.mypinata.cloud/ipfs/Qm123')).toBe(true);
  });
  it('accepts nft-cdn.alchemy.com', () => {
    expect(isSafeNftImageUrl('https://nft-cdn.alchemy.com/eth-mainnet/0xabc')).toBe(true);
  });
  it('accepts i.seadn.io', () => {
    expect(isSafeNftImageUrl('https://i.seadn.io/gcs/files/x.png')).toBe(true);
  });
  it('accepts openseauserdata.com', () => {
    expect(isSafeNftImageUrl('https://openseauserdata.com/files/x.png')).toBe(true);
  });
  it('is case-insensitive on host', () => {
    expect(isSafeNftImageUrl('https://Cloudflare-IPFS.com/ipfs/Qm123')).toBe(true);
  });
});

describe('isSafeNftImageUrl — unknown / attacker hosts', () => {
  it('rejects arbitrary https hosts (M-10 threat)', () => {
    expect(isSafeNftImageUrl('https://attacker.example/tracker.png')).toBe(false);
  });
  it('rejects a lookalike subdomain', () => {
    expect(isSafeNftImageUrl('https://gateway.pinata.cloud.attacker.example/x')).toBe(false);
  });
  it('rejects a suffix-match trick against the exact list', () => {
    expect(isSafeNftImageUrl('https://evilcloudflare-ipfs.com/x.png')).toBe(false);
  });
  it('rejects a suffix-match trick against the wildcard list', () => {
    // hostname is "attacker.mypinata.cloud.evil.example", NOT a .mypinata.cloud subdomain
    expect(isSafeNftImageUrl('https://attacker.mypinata.cloud.evil.example/x')).toBe(false);
  });
  it('rejects the bare wildcard suffix (mypinata.cloud) with no subdomain', () => {
    // suffix rule only fires on `*.mypinata.cloud`, not on `mypinata.cloud` itself
    expect(isSafeNftImageUrl('https://mypinata.cloud/x')).toBe(false);
  });
  it('rejects userinfo trickery', () => {
    expect(isSafeNftImageUrl('https://cloudflare-ipfs.com@attacker.example/x.png')).toBe(false);
  });
});

describe('isSafeNftImageUrl — data: URIs', () => {
  it('accepts a small image/png data URI', () => {
    expect(isSafeNftImageUrl('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
  });
  it('accepts image/svg+xml data URI', () => {
    expect(isSafeNftImageUrl('data:image/svg+xml;utf8,<svg/>')).toBe(true);
  });
  it('rejects data URIs that are not images', () => {
    expect(isSafeNftImageUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isSafeNftImageUrl('data:application/javascript,alert(1)')).toBe(false);
  });
  it('rejects oversize data URIs', () => {
    const huge = 'data:image/png;base64,' + 'A'.repeat(65 * 1024);
    expect(isSafeNftImageUrl(huge)).toBe(false);
  });
});

describe('safeNftImageUrl', () => {
  it('returns the URL when safe', () => {
    const u = 'https://cloudflare-ipfs.com/ipfs/Qm123';
    expect(safeNftImageUrl(u)).toBe(u);
  });
  it('returns the neutral placeholder when unsafe', () => {
    expect(safeNftImageUrl('https://attacker.example/x.png')).toBe(PLACEHOLDER_NFT_IMAGE);
    expect(safeNftImageUrl(undefined)).toBe(PLACEHOLDER_NFT_IMAGE);
  });
  it('placeholder itself is a data: URI (no network fetch)', () => {
    expect(PLACEHOLDER_NFT_IMAGE.startsWith('data:image/svg+xml')).toBe(true);
  });
});
