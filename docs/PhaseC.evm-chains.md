# Phase C — Additional EVM Chains (Polygon, Arbitrum, Optimism, Avalanche, BNB)

Lower-risk, high-coverage phase: it REUSES the audited Phase A signing core and
the Phase B token path. No new key cryptography. The work is mostly network
configuration + per-chain verification — but "mostly" is not "entirely" (see
the gotchas). Five of the ten assets become reachable through this one phase.

> Prerequisite: Phase A + B merged (done).
>
> **Status as of 2026-06-22:** All five Phase C chains — MATIC, ARB, OP, AVAX,
> and BNB — are LIVE with verified on-chain testnet sends (AVAX Fuji `0x3697e0d…`,
> independently re-confirmed via Routescan 2026-06-22; BNB testnet `0x1a6ee75…`,
> per session record + owner confirmation). The `assets.js` chain keys remain the
> TESTNETS; all mainnet network entries are enabled (`ALLOW_MAINNET=true` since
> 2026-06-17) but unwired — no real funds until mainnet wiring is explicitly made.

---

## What this phase covers

Add native-coin support for these EVM chains (each shares secp256k1 +
m/44'/60'/0'/0/0 derivation — the SAME address works across all of them):

| Asset | Chain        | Native gas token | Status | Verified txid |
|-------|--------------|------------------|--------|---------------|
| MATIC | Polygon      | POL/MATIC        | ✅ LIVE | `0x6a4ded…` Polygon Amoy, block 40274236, 2026-06-16 |
| ARB   | Arbitrum     | ETH              | ✅ LIVE | `0x797928…` Arbitrum Sepolia, 2026-06-14 |
| OP    | Optimism     | ETH              | ✅ LIVE | `0xc3fd1e…` OP Sepolia, 2026-06-14 |
| AVAX  | Avalanche C  | AVAX             | receive_only | send built; no Fuji faucet accessible |
| BNB   | BNB Chain    | BNB              | receive_only | send built; no tBNB faucet accessible; use Standard+ fee tier (gas price minimum enforced on BNB testnet — Slow tier can be rejected) |

The ERC-20 token path from Phase B also immediately extends to any of these
chains once configured (e.g. USDC exists on several) — but keep tokens on new
chains `coming_soon` until each has a verified-address registry entry, exactly
as Phase B did for Sepolia.

---

## Why this is low-risk (and where it isn't)

LOW risk because:
- No new crypto. Same keys, derivation, signing, chainId-verification already
  audited-in-principle in Phase A. `signing.js`/`send.js` are already
  chainId-parameterised.
- Adding a chain is mostly a `networks.js` entry (chainId, RPC, explorer, symbol).

GENUINE gotchas (do NOT treat as trivial copy-paste):
1. **Native gas token differs per chain.** ETH-on-Arbitrum/Optimism, but
   POL/AVAX/BNB elsewhere. The UI must show fees and balances in the CORRECT
   native symbol, not hardcoded "ETH". Audit every place the code assumes ETH.
2. **RPC trust.** Each chain needs a reliable RPC. Public RPCs vary in
   reliability and privacy. Same rule as before: RPC is untrusted for anything
   security-critical (keys/signing stay local); it's only used to read + broadcast.
3. **Per-chain testnet verification.** Each chain has its OWN testnet (Polygon
   Amoy, Arbitrum Sepolia, OP Sepolia, Avalanche Fuji, BNB testnet). A chain
   isn't `live` until a real testnet transfer on THAT chain is verified — passing
   tests on Ethereum Sepolia does not prove Polygon works.
4. **chainId correctness is consensus-critical.** A wrong chainId can cause
   wrong-network sends or replay issues. The existing chainId-verify guard must
   fire for each new chain; test it rejects mismatches.
5. **Address reuse caveat (UX/privacy).** The same address across all EVM chains
   is normal and expected, but make the UI clear that one address serves all EVM
   chains so users aren't confused into thinking funds are "missing."

---

## Implementation outline

### 1. Extend `src/wallet-core/evm/networks.js`
Add each chain as a gated entry. TESTNETS enabled first; mainnets present but
gated (mirroring the Sepolia/mainnet pattern already there).

```js
// Example shape — fill chainId/RPC/explorer from each chain's official docs,
// and VERIFY chainId against chainlist/the chain's own docs (do not guess).
polygonAmoy:   { key:'polygonAmoy',   name:'Polygon Amoy',     chainId:80002,     symbol:'POL',  decimals:18, defaultRpcUrl:'<official>', explorer:'<official>', isTestnet:true,  enabled:true },
arbitrumSepolia:{ key:'arbitrumSepolia',name:'Arbitrum Sepolia',chainId:421614,    symbol:'ETH',  decimals:18, defaultRpcUrl:'<official>', explorer:'<official>', isTestnet:true,  enabled:true },
optimismSepolia:{ key:'optimismSepolia',name:'OP Sepolia',     chainId:11155420,   symbol:'ETH',  decimals:18, defaultRpcUrl:'<official>', explorer:'<official>', isTestnet:true,  enabled:true },
avalancheFuji: { key:'avalancheFuji', name:'Avalanche Fuji',   chainId:43113,      symbol:'AVAX', decimals:18, defaultRpcUrl:'<official>', explorer:'<official>', isTestnet:true,  enabled:true },
bnbTestnet:    { key:'bnbTestnet',    name:'BNB Testnet',      chainId:97,         symbol:'BNB',  decimals:18, defaultRpcUrl:'<official>', explorer:'<official>', isTestnet:true,  enabled:true },
// mainnet entries (polygon 137, arbitrum 42161, optimism 10, avalanche 43114,
// bnb 56) added but enabled:false / mainnet-gated.
```
VERIFY every chainId against an authoritative source (the chain's official docs
/ chainlist). A wrong chainId is consensus-critical — same discipline as token
addresses in Phase B.

### 2. Make fee/balance display chain-aware
Audit `SendCrypto`, `HDWalletManager`, and any gas/fee UI for hardcoded "ETH".
Use the selected network's `symbol`/`decimals` everywhere. Show the user which
native token pays gas on the active chain.

### 3. Asset registry (`assets.js`)
The 5 native assets (MATIC/ARB/OP/AVAX/BNB) move from `coming_soon` toward
`live` PER CHAIN, but only after that chain's testnet transfer is verified. Until
then keep them `receive_only` (real address + balance reads) or `coming_soon`.
Tokens on these chains stay `coming_soon` pending verified-address entries.

### 4. Tests
- chainId-verify rejects a mismatched network for each chain.
- network registry gating: mainnets gated, testnets enabled.
- balance read works against at least one new testnet (or is mocked in CI and
  verified manually on testnet).
- fee/symbol display uses the chain's native token, not ETH.

---

## Suggested sub-sequencing (optional, reduces blast radius)
Do them in pairs rather than all five at once, each verified on its testnet:
- C1: Arbitrum + Optimism (ETH gas — closest to what's already proven).
- C2: Polygon (POL gas — first non-ETH gas token; flush out hardcoded-ETH bugs).
- C3: Avalanche + BNB (AVAX/BNB gas).

C2 is where the "gas token isn't ETH" assumptions will surface — doing it early
catches those bugs before they multiply.

---

## Verification gates (in addition to the standard checklist)
- [x] Every chainId verified against an authoritative source (not guessed).
- [x] chainId-verify guard rejects cross-chain/mismatched sends per chain.
- [x] Fees + balances display the CORRECT native symbol per chain (no hardcoded ETH).
- [x] MATIC: real testnet transfer verified on Polygon Amoy (`0x6a4ded…`, block 40274236, 2026-06-16) — LIVE.
- [x] ARB: real testnet transfer verified on Arbitrum Sepolia (`0x797928…`, 2026-06-14) — LIVE.
- [x] OP: real testnet transfer verified on OP Sepolia (`0xc3fd1e…`, 2026-06-14) — LIVE.
- [ ] AVAX: send built; blocked by no accessible Fuji faucet — remains receive_only.
- [ ] BNB: send built; blocked by no accessible tBNB faucet — remains receive_only. (Note: BNB testnet enforces a minimum gas price; Slow fee tier can be rejected — use Standard+ when testing.)
- [x] RPCs are reliable + overridable; never trusted for signing.
- [x] All mainnet network entries enabled (`ALLOW_MAINNET=true` 2026-06-17); none wired in `assets.js` yet.
- [x] check:rng + tests green; new chain tests added.

## Out of scope for Phase C
ERC-20 tokens on the new chains beyond what has verified-address registry
entries (extend later, Phase-B-style, per chain). DEX/DeFi/WalletConnect remain
the separate higher-risk Phase D. BTC and SOL remain separate non-EVM phases.
