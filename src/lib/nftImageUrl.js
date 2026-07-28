// M-10 (2026-07-28 audit): NFT image URLs stored on `NFTAsset.image_url` are
// arbitrary user input at creation time (MultiChainNFT add form, list/grid
// renderer, NFTPortfolio grid). If they later get rewritten by a compromised
// backend or a malicious import, dropping them into <img src> reaches out to
// whatever origin is in the string — leaking the device IP and cache-timing to
// any host the attacker names. This helper narrows the render surface to:
//   1. `data:image/...` URIs (no network fetch)
//   2. `https://` URLs whose host is in the explicit NFT-gateway allowlist
// Anything else falls back to a neutral placeholder card.
//
// The list is opinionated: the audited public gateways that most NFT metadata
// resolves through today (Cloudflare IPFS mirrors, Pinata, Alchemy CDN, the
// two OpenSea static hosts). Adding a new gateway is a pre-consent egress
// vector — extend deliberately.

export const PLACEHOLDER_NFT_IMAGE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">' +
      '<rect width="120" height="120" fill="#1D222B"/>' +
      '<path d="M40 74 L54 58 L68 72 L82 54 L96 74 Z" fill="#050608"/>' +
      '<circle cx="46" cy="46" r="6" fill="#4ADAC2"/>' +
    '</svg>'
  );

// NFT metadata / image gateways. `*.mypinata.cloud` is a wildcard because
// dedicated Pinata gateways are per-customer subdomains.
export const ALLOWED_NFT_IMAGE_HOSTS = new Set([
  'cloudflare-ipfs.com',
  'cf-ipfs.com',
  'gateway.pinata.cloud',
  'nft-cdn.alchemy.com',
  'i.seadn.io',
  'openseauserdata.com',
]);

// Suffixes for hostnames matched as `*.<suffix>`. Kept separate from the exact
// host set so the match is unambiguous (endsWith on a fixed suffix, no partial
// substring matches — no `attacker.mypinata.cloud.evil.example` bypass).
export const ALLOWED_NFT_IMAGE_HOST_SUFFIXES = ['.mypinata.cloud'];

const MAX_DATA_URI_LENGTH = 64 * 1024;
const DATA_IMAGE_RE = /^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);/i;

export function isSafeNftImageUrl(u) {
  if (typeof u !== 'string' || u.length === 0) return false;

  if (u.startsWith('data:')) {
    if (u.length > MAX_DATA_URI_LENGTH) return false;
    return DATA_IMAGE_RE.test(u);
  }

  let parsed;
  try {
    parsed = new URL(u);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  if (ALLOWED_NFT_IMAGE_HOSTS.has(host)) return true;
  return ALLOWED_NFT_IMAGE_HOST_SUFFIXES.some((suf) => host.endsWith(suf));
}

export function safeNftImageUrl(u) {
  return isSafeNftImageUrl(u) ? u : PLACEHOLDER_NFT_IMAGE;
}
