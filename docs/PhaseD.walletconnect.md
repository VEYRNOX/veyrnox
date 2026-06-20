# Phase D — WalletConnect + Arbitrary-Transaction Safety (DESIGN DOC)

> This is a DESIGN + THREAT-MODEL document, not a wire-it-up task. It is the
> highest-risk phase in the roadmap and the foundation that DEX swaps and DeFi
> deposits will sign through.
>
> **Gate status as of 2026-06-20:** The internal audit is complete (2026-06-17,
> 0 crit/high/med). WalletConnect remains deferred pending the independent audit,
> which is the remaining gate for this phase. Do NOT implement Phase D before the
> independent audit clears, and treat its own audit as a separate, larger scope.
>
> Status gate: nothing here goes to mainnet. Build on testnet, behind the same
> ALLOW_MAINNET gate, and add an additional WALLETCONNECT_ENABLED flag so dApp
> connectivity can be shipped dark and turned on only after its own audit.

---

## Why this phase is categorically different

Phase A/B sign ONLY transactions the app itself constructs (a native send, a
known ERC-20 transfer). The wallet author controls the calldata.

WalletConnect changes that: the wallet will be asked to sign transactions and
messages **originating from arbitrary external websites**, including malicious
ones. This is where the large, well-documented drains happen. The threat is not
the crypto — it is **blind signing**: a user approving something they cannot
see the true meaning of.

The Phase B `calldata.js` decoder understands only the handful of functions in
its minimal ERC-20 ABI; for arbitrary contracts it returns `unknown` (safe, but
uninformative). That is the gap this phase must close before any dApp can ask
the wallet to sign.

---

## Threat model (write this up; the auditor will want it)

Adversaries and vectors to defend against:

1. **Malicious dApp requesting unlimited approval** — site asks for
   `approve(attacker, MaxUint256)`. Classic drain. Must be detected, decoded,
   and shown with a hard warning + explicit acknowledgement (Phase B already
   does this for known tokens; here it must work for ANY token/spender).

2. **Deceptive `eth_sign` / `personal_sign` / `signTypedData`** — a signature
   request that is actually authorising a transfer, a Permit (EIP-2612), a
   Permit2, or a Seaport/marketplace order that hands over assets. Off-chain
   signatures can drain assets WITHOUT an on-chain tx. These are the most
   dangerous because users think "just signing a message" is harmless.
   - MUST decode EIP-712 typed data and surface what it authorises.
   - MUST loudly flag Permit / Permit2 / order signatures.
   - Consider refusing raw `eth_sign` entirely (it can sign anything; most
     reputable wallets warn or block it).

3. **Wrong-chain / chain-switch requests** (`wallet_switchEthereumChain`,
   `wallet_addEthereumChain`) — a dApp adding a malicious RPC or pushing the
   user onto an attacker-controlled "network". Validate against your own
   network registry; never auto-add arbitrary chains/RPCs.

4. **Address/contract spoofing** — lookalike contract addresses, poisoned
   suggestions. Show full addresses; integrate known-malicious lists if used.

5. **Session persistence abuse** — a connected dApp retaining signing reach
   longer than intended. Sessions must be visible, expiring, and revocable.

6. **Phishing dApp URLs / fake WalletConnect prompts** — display the dApp's
   origin/domain prominently and let the user verify it before connecting.

---

## The non-negotiable capability: human-readable signing for ARBITRARY txs

Once the wallet signs for contracts it did not author, the user MUST be shown
what a transaction actually does. This is a real build, not a flag:

- **4byte / ABI decoding** — resolve the function selector and parameters where
  an ABI or signature database is available, so a raw blob becomes
  "swapExactTokensForTokens(…)" with decoded args.
- **Transaction simulation** — the strongest control: simulate the tx against
  current chain state and show the user the NET EFFECT ("you will send 100 USDC
  and receive ~0.03 ETH; this contract will gain approval to spend your USDC").
  This typically means integrating a simulation provider (e.g. Tenderly,
  Blocknative, or an equivalent) — budget for it; it is the difference between a
  wallet that protects users at dApps and one that drains them.
- **Asset-change preview** — derive and display token-in / token-out / approval
  deltas, not just decoded calldata.
- **Fail closed** — if the wallet cannot decode AND cannot simulate a request,
  it must present a prominent "UNVERIFIED — we cannot show you what this does"
  state and make proceeding deliberately hard (not a one-tap approve).

If this capability is not in place, dApp connectivity should NOT ship. A wallet
that signs arbitrary calldata it cannot explain is the exact failure mode this
whole project has been avoiding.

---

## Architecture sketch (build on the existing core)

- **Reuse, do not replace:** keys, vault, derivation, and local signing from
  Phase A are unchanged. WalletConnect is a *request source* that feeds the
  SAME local signer — keys still never leave the device.
- **WalletConnect v2** (`@walletconnect/web3wallet` / current SDK) as the
  transport. The wallet acts as the "wallet" side of the pairing.
- **A request-router + approval-UI layer** sits between an incoming WC request
  and the signer:
    incoming request → classify (tx / typed-data / sign / chain-switch)
      → decode + simulate → render human-readable approval screen
      → explicit user approval (with extra friction for approvals/permits/unknown)
      → local sign → respond to dApp.
- **Session manager** — list active dApp sessions, their permissions, origin,
  and a one-tap revoke. Sessions expire.
- **Per-request chain validation** against the existing `networks.js` registry;
  reject unknown chains/RPCs rather than auto-adding.

New modules (sketch — names to firm up at build time):
- `evm/walletconnect/session.js` — pairing, session lifecycle, revoke.
- `evm/walletconnect/router.js` — classify + dispatch incoming requests.
- `evm/decode/abi-decode.js` — selector/ABI decoding (extends Phase B's decoder).
- `evm/decode/simulate.js` — simulation-provider integration + asset-diff.
- `evm/typed-data.js` — EIP-712 / Permit / Permit2 decoding + warnings.
- UI: a generic, security-first approval modal (the most important UI in the app).

---

## Phasing within this work (it is too big for one PR)

D1. **WalletConnect plumbing, read-only:** pair, show sessions, display incoming
    requests as DECODED-WHERE-POSSIBLE — but signing DISABLED. Lets you prove
    the transport + decode UI with zero signing risk.
D2. **Typed-data + message signing** with full EIP-712 decode and Permit/Permit2
    warnings; raw `eth_sign` blocked or hard-warned.
D3. **Transaction signing** with ABI decode + simulation + asset-change preview
    and the fail-closed unknown state.
D4. **Session management hardening** (expiry, revoke, per-dApp limits).

Each sub-phase: its own branch, its own tests, its own review. D3 in particular
should not ship without the simulation capability working.

---

## What MUST stay true (carry-over invariants)

- Keys never leave the device; WalletConnect only feeds the local signer.
- Mainnet stays gated (ALLOW_MAINNET) AND WalletConnect behind its own flag.
- No auto-approval of anything, ever. Approvals/permits/unknown get extra friction.
- Chain/RPC requests validated against the local registry; nothing auto-added.
- Fail closed on anything the wallet cannot decode or simulate.
- This phase expands the independent-audit scope substantially — the audit must
  cover the request router, typed-data decoding, simulation, and approval UX,
  not just the key core.

---

## Verification gates (in addition to the standard checklist)

- [ ] Unlimited approval from an arbitrary dApp → detected, decoded, hard-warned,
      requires explicit acknowledgement (test with a hostile-style payload).
- [ ] EIP-712 Permit / Permit2 / Seaport-style order → decoded and flagged as
      asset-authorising, not shown as a harmless "message".
- [ ] Raw eth_sign → blocked or hard-warned (decide policy; document it).
- [ ] Unknown calldata that cannot be simulated → fail-closed UNVERIFIED state,
      no one-tap approve.
- [ ] wallet_addEthereumChain with an unknown/malicious RPC → rejected.
- [ ] Sessions are listable, expiring, and revocable; revoke actually kills reach.
- [ ] dApp origin/domain shown prominently before connect.
- [ ] Keys never serialized/logged through any WC code path (grep + review).
- [ ] Independent audit scope updated to include all of the above.
