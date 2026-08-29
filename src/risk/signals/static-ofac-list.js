// @ts-nocheck
// Static OFAC-sanctioned recipient fallback for the S9 signal.
//
// Belt-and-braces defence for the failure mode #1664 filed: Send Preview's
// TIP call returns without `sanctions: true` for a Tornado Cash router,
// while the Advisor path (different `actionType`) blocks correctly. Rather
// than trust that every TIP verdict path always sets `sanctions_hit`, we
// hard-code the well-known OFAC-listed mixer set here. If the recipient
// matches, s9 forces RISK regardless of what the backend TIP said (I5:
// backend untrusted).
//
// SCOPE. This is NOT the sanctions list. It is a small, curated fallback
// for the specific class the linked audit hit: Tornado Cash contracts sanctioned
// by OFAC (Executive Order 13694, added 2022-08-08, ongoing SDN entries). If
// a broader set is needed, that belongs in the signed IOC manifest, not here —
// this file is intended to stay small (dozens of entries, not thousands) so
// the check is O(1) per send and there's no versioning burden.
//
// SOURCE. https://ofac.treasury.gov/sanctions-list (SDN — "Tornado Cash")
// Last curated: 2026-08-17 (matches the addresses in the OFAC recap).
//
// FAILURE MODE. If the OFAC list expands, this file goes stale. The real
// screening path is TIP (backend-updated); this fallback exists to catch
// paths where TIP's verdict-shape drift silently drops `sanctions_hit`.
// A stale local list still catches the class it's for; a missing entry
// degrades to whatever the network path says.
//
// Format: lowercase 0x-prefixed EVM address strings. Compared case-insensitively
// via `has(addr.toLowerCase())` in the s9 check.

export const STATIC_OFAC_SANCTIONED_EVM = new Set([
  // Tornado Cash — ETH deposit routers (mixer pool contracts)
  '0x8589427373d6d84e98730d7795d8f6f8731fda16', // 0.1 ETH — issue #1664 repro
  '0x722122df12d4e14e13ac3b6895a86e84145b6967', // Tornado Cash router
  '0xdd4c48c0b24039969fc16d1cdf626eab821d3384', // 10 ETH
  '0x910cbd523d972eb0a6f4cae4618ad62622b39dbf', // 10 ETH v2
  '0xa160cdab225685da1d56aa342ad8841c3b53f291', // 100 ETH
  '0xd4b88df4d29f5cedd6857912842cff3b20c8cfa3', // 100 DAI
  '0xfd8610d20aa15b7b2e3be39b396a1bc3516c7144', // 100k DAI
  '0x07687e702b410fa43f4cb4af7fa097918ffd2730', // 100 WBTC
  '0x23773e65ed146a459791799d01336db287f25334', // 5000 DAI
  '0x03893a7c7463ae47d46bc7f091665f1893656003', // cDAI
  '0xca0840578f57fe71599d29375e16783424023357', // 1000 DAI
  '0xdf231d99ff8b6c6cbf4e9b9a945cbacef9339178', // 5000 USDT
  '0xaf4c0b70b2ea9fb7487c7cbb37ada259579fe040', // 5000 USDT
  '0xa5c2254e4253490c54cef0a4347fddb8f75a4998', // 100 USDT
  // Tornado Cash — additional SDN entries (2022-08-08 + 2022-11-08 updates)
  '0x67d40ee1a85bf4a4bb7ffae16de985e8427b6b45', // 1000 USDT
  '0x6bf694a291df3fec1f7e69701e3ab6c592435ae7', // 5000 USDT
  '0x3aac1cc67c2ec5db4ea850957b967ba153ad6279', // 10000 USDT
  '0x723b78e67497e85279cb204544566f4dc5d2aca0', // 100000 USDT
  '0x0d5550d52428e7e3175bfc9550207e4ad3859b17', // ETH v3
  '0xf67721a2d8f736e75a49fdd7fad2e31d8676542a', // 10000 DAI
  '0x9ad122c22b14202b4490edaf288fdb3c7cb3ff5e', // 100000 DAI
  '0x910cbd523d972eb0a6f4cae4618ad62622b39dbf', // 10 ETH (again per SDN)
  '0x330bdfade01ee9bf63c209ee33102dd334618e0a', // TORN router
  '0xd47438c816c9e7f2e2888e060936a499af9582b3', // 10 ETH
  '0xd90e2f925da726b50c4ed8d0fb90ad053324f31b', // 10 ETH
  '0x2717c5e28cf931547b621a5dddb772ab6a35b701', // 100 ETH
  '0x94a1b5cdb22c43faab4abeb5c74999895464ddaf', // 10000 DAI
]);

/**
 * Test if an EVM recipient is on the static OFAC fallback list.
 * Accepts any-case 0x-prefixed hex; comparison is done lowercased.
 * @param {unknown} address
 * @returns {boolean}
 */
export function isStaticSanctionedEvm(address) {
  if (typeof address !== 'string') return false;
  return STATIC_OFAC_SANCTIONED_EVM.has(address.toLowerCase());
}
