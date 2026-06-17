# ETH/ARB/OP testnet re-verification — environment setup

> Companion to `eth-owner-signoff-runbook.md` Step 1. Everything you need to
> re-witness a real on-chain send for the three live EVM assets after the signing
> path changed (commits `93f91c7`, `6c22e97`). The UI-path send is the bar; the
> Node script is optional harness-assist. Testnet only — `ALLOW_MAINNET` stays false.

## Per-chain reference (from `src/wallet-core/evm/networks.js`)

| Asset | Network | chainId | Default RPC | Explorer |
|---|---|---|---|---|
| ETH | Sepolia | 11155111 | `https://ethereum-sepolia-rpc.publicnode.com` | https://sepolia.etherscan.io |
| ARB | Arbitrum Sepolia | 421614 | `https://sepolia-rollup.arbitrum.io/rpc` | https://sepolia.arbiscan.io |
| OP | OP Sepolia | 11155420 | `https://sepolia.optimism.io` | https://sepolia-optimism.etherscan.io |

All three share ONE address (`m/44'/60'/0'/0/0`) — fund and send from the same address per chain.

### Faucets
- **Sepolia ETH:** https://www.alchemy.com/faucets/ethereum-sepolia · https://faucet.quicknode.com/ethereum/sepolia
- **Arbitrum Sepolia:** bridge Sepolia ETH via https://bridge.arbitrum.io (Sepolia → Arb Sepolia), or a direct Arb-Sepolia faucet.
- **OP Sepolia:** https://app.optimism.io/faucet, or bridge Sepolia ETH through the OptimismPortal (how it was funded the first time).

## A) UI-path re-verification (the required bar)

1. **Clear demo** (the known trap): visit `/?demo=0`. Confirm NO demo box and a real wallet shows **0.0** on-chain — not a seeded demo balance. (Demo also persists via `veyrnox-demo=1` in localStorage; `/?demo=0` clears it.)
2. Run the app: `npm run dev` (or use the running preview). Create/unlock a real wallet.
3. **Fund** the wallet's EVM address from the chain's faucet above.
4. **Send** a small amount through the in-app Send screen to an address you control. Use a **non-Slow** fee (BNB-style underpricing aside, Standard+ is safest).
5. **Witness on the explorer:** open the txid; confirm **recipient, amount, fee, chainId**, status = success, and that the in-app txid === the explorer txid.
6. **Record** the txid in `docs/Feature-Status.md` next to the asset and in the sign-off record.

> No env flag is needed — ETH/ARB/OP are already `live`, so the send gate passes.
> (`VITE_DEV_UNGATE_SEND` is only for re-verifying `receive_only` assets later.)

## B) Optional: Node harness-assist (Sepolia)

`scripts/sepolia-send-proof.mjs` exercises the same wallet-core path from Node and
prints the real tx hash. It reads `process.env` directly (NOT `.env.local`), so set
shell vars. Use a **throwaway** testnet seed/key — never a real or mainnet key.

```powershell
$env:MNEMONIC    = "<12/24-word THROWAWAY testnet seed>"   # OR $env:PRIVATE_KEY = "0x..."
$env:TO_ADDRESS  = "0x..."        # recipient (defaults to self)
$env:AMOUNT_ETH  = "0.0001"
node scripts/sepolia-send-proof.mjs   # with no funds it prints your address + a faucet hint
```

A script broadcast is **necessary, not sufficient** — the catalogue bar is a real
**UI-path** send (section A). ARB/OP have no dedicated proof script; verify them via the UI.

## `.env.local` (app flags only)
Copy `.env.example` → `.env.local` (git-ignored) only if you need app flags. For
this re-verification you do not — leave demo unset and run a real wallet. NEVER put
a mainnet key or real seed in any env file.

## Readiness self-check — VERIFIED 2026-06-17
- ✅ **RPC reachable + correct chainId** (raw `eth_chainId`, what the new guard relies on):
  ETH Sepolia → 11155111 · ARB Arbitrum Sepolia → 421614 · OP OP Sepolia → 11155420 (all match).
- ✅ **App boots in real (non-demo) mode** at `/?demo=0` — genuine onboarding
  ("v1.0 · Testnet beta · keys stay on-device"), no demo dashboard, no fake balances, no console errors.
- ☐ `npm test` / `npm run check:rng` / `npm run audit:eth` green at the reviewed commit (run before sign-off).
- ☐ Wallet funded from the faucet(s) above (owner — interactive).
