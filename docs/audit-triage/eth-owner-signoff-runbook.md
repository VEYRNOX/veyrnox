# ETH mainnet — owner sign-off runbook

> The machine-checkable and self-review work for the ETH path is done (harness
> green, self-review F1–F5, deep money-path review + fixes). What remains are the
> steps in the internal-audit gate that **only the owner can perform** — they need
> your hands (real testnet sends, an external wallet), your judgement, or your
> sign-off. This runbook makes each one turnkey. Nothing here is done by Claude;
> nothing here flips `ALLOW_MAINNET`.
>
> Gate flow: internal audit → remediate (crit/high/med) → re-review → **owner
> sign-off** → flip `ALLOW_MAINNET`. Source of policy: `docs/Audit.scope.md`,
> `CLAUDE.md`. Findings this runbook closes out: `docs/audit-triage/eth-selfreview-2026-06.md`.

---

## Step 1 — Re-verify ETH/ARB/OP on-chain (REQUIRED: live signing path changed)

Commit `93f91c7` changed the live native signing path (the chainId guard now does
a real `eth_chainId` read; gas estimation moved to `preflight.js`). Unit tests are
NOT on-chain verification ("verify, don't assert"). Re-prove each live asset:

For **ETH (Sepolia), ARB (Arbitrum Sepolia), OP (OP Sepolia)** — one real UI-path
send each, exactly as they were first verified:
1. Clear demo (visit `/?demo=0`), confirm a fresh real wallet shows `0.0` on-chain.
2. Fund the address from the chain's faucet (manual, rate-limited).
3. Send a small amount through the **in-app Send UI** (not a script) to an address
   you control. Pick a non-Slow fee.
4. Witness on the block explorer: correct **recipient, amount, fee, and chainId**;
   status success; the in-app txid matches the explorer txid.
5. Record the txid in `docs/Feature-Status.md` next to the asset.

Reference: `docs/multi-asset-send.verification-checklist.md`,
`docs/send-verification-scripts.md`, the `veyrnox-send-verification` skill, and
`scripts/sepolia-send-proof.mjs` (harness-assist only — the UI-path send is the bar).

> If any of the three cannot be re-witnessed, drop it back to `receive_only` until
> it is — do not leave it `live` on an unverified signing path.

---

## Step 2 — External-wallet interop (NEEDS-OWNER from the self-review)

Proves a generated seed is recoverable elsewhere (the whole point of self-custody).
1. Generate a fresh mnemonic in-app.
2. Import it into an INDEPENDENT wallet (e.g. MetaMask).
3. Confirm the FIRST address matches the in-app `m/44'/60'/0'/0/0` address
   (canonical conformance is already unit-tested vs `0x9858EfFD…`; this is the
   real external confirmation).
4. Record pass/fail + the wallet used.

---

## Step 3 — Owner judgement calls (record the decision, don't leave implicit)

- **Argon2id parameters** (`vault.js` t=3 / 192 MiB / p=1): decide they are
  adequate for your target devices, or adjust. The code flags this as an explicit
  audit item. Record the decision + rationale.
- **F4 — dependency pinning**: caret ranges today, reproducibility via lockfile +
  `npm ci`. Decide: accept lockfile-enforced, or pin crypto libs exactly
  (`@noble/*`, `@scure/*`, `ethers`, `hash-wasm`). Record the choice.
- **Transaction-list provenance**: the displayed tx *list* is DB-backed (local,
  keyed to real txids, for screening) while *balances* are chain-sourced. Confirm
  acceptable, or move the list to an explorer/RPC source.

---

## Step 4 — Owner code review (the gate's human review)

Review, by hand, the ETH money + key path (the AI self-review is input, not this):
- `src/wallet-core/`: `mnemonic.js`, `derivation.js`, `vault.js`, `signing.js`,
  `multiVault.js`, `keystore/*`.
- `src/wallet-core/evm/`: `send.js`, `token-send.js`, `provider.js`, `fees.js`,
  `preflight.js`, `networks.js`, `tokens.js`, `calldata.js`.
- `src/lib/WalletProvider.jsx`: key lifetime (`withPrivateKey` and lock/idle paths).

Work the `docs/SECURITY_REVIEW_CHECKLIST.md` boxes yourself and initial each.

---

## Step 5 — Re-review

After Steps 1–4 and any fixes they produce: re-run the full gate confirmation.
- `npm test` (full suite green), `npm run check:rng`, `npm run audit:eth` GREEN.
- Confirm no new open critical/high/medium findings.
- Confirm `ALLOW_MAINNET` is still `false` until the sign-off below.

---

## Step 6 — Owner sign-off record (and ONLY THEN the flip)

Record, in writing, before changing any code:

```
ETH mainnet sign-off
  commit:            <git sha reviewed>
  on-chain re-verify: ETH <txid>  ARB <txid>  OP <txid>
  interop:           <wallet> — first address matches: yes/no
  decisions:         Argon2id <ok/changed>; pinning <choice>; tx-list <choice>
  code review:       <owner> — checklist complete: yes
  re-review:         suite/check:rng/audit:eth green at <sha>
  independent audit: <none / firm + report ref>   (recommended, not required)
  signed:            <owner>  <date>
```

Only after that record exists is flipping `ALLOW_MAINNET = true` a deliberate,
authorized action — and it is yours to make, by hand, never from a script or agent.

---

## Standing caveat (plain language)
This is the **internal** gate you opted into. It has had **no independent
third-party review** — by your policy that is recommended, not required, but it
remains the single biggest difference between this and how a real-money wallet is
normally cleared. Re-read `docs/Audit.scope.md` before the flip.
