// Per-chain "empty from-address" for TIP screening — TIP requires
// from_address as a non-empty string but the sanctions lookup only checks
// to_address in practice. Use each chain's canonical burn/zero literal.
//
// Extracted from SecurityAdvisor.jsx (2026-08-15 Codex P1) so SendCrypto
// can share the same values without leaking the wallet's own address into
// every screen request. Kept as a constant map, not a function, so a caller
// that dereferences an unknown chain gets undefined at build-review time
// rather than a fabricated placeholder.

export const ZERO_FROM_ADDRESS = Object.freeze({
  ethereum: '0x0000000000000000000000000000000000000000',
  bitcoin:  '1111111111111111111114oLvT2',                    // 1x1…111 collapsed to a P2PKH-shaped literal
  solana:   '11111111111111111111111111111111',                // Solana System Program pubkey (canonical zero)
});
