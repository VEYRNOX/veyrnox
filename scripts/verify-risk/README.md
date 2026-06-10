# `scripts/verify-risk/` — Risk Scoring v1 verification instrument

**Not product code.** This directory is the verification harness called for in
[`docs/risk-verification-plan-sepolia.md`](../../docs/risk-verification-plan-sepolia.md)
prerequisite #6. It exercises the pure on-device composite scorer (`src/risk`) so
you can see, per signal, what verdict a given transaction + local-state + chain-data
produces. It is dead simple on purpose and imports no signer, no seed, no vault.

## The honesty boundary (read first)

Running anything here proves **scorer behaviour** — "this input maps to this
verdict". It is **NOT** on-chain verification. Per the project hard rule, a signal
is *verified* only when exercised against a real on-chain pattern:

| kind | what makes it real | artifact for the log |
|------|--------------------|----------------------|
| **B** | a real broadcast you confirm on an explorer | tx hash + explorer link |
| **D** | real chain state read at score-prep time | named ENS resolution / `eth_getCode` source |
| **H** | a real existing on-chain tx with the pattern | tx hash of the historical tx |

The runner labels every non-logic case with the `verify:` artifact it still needs.
Nothing in this directory writes to a verification log, and nothing here flips an
asset/feature to "verified". That step is manual and requires the real artifact.

## Files

- **`score-tx.mjs`** — the instrument. `scoreCase()` runs one case through
  `score()`; `checkExpectations()` compares the result to the case's `expect`
  block. CLI: `node scripts/verify-risk/score-tx.mjs <case.json>` scores a single
  case from JSON — this is how you score a **real confirmed tx** later (export the
  tx + state + chain-data to JSON and feed it in).
- **`cases.mjs`** — the read-only cases. Every case runs through the pure scorer
  now (no network, no signer). Each carries `kind` (B/D/H/logic) and `verifiedBy`.
- **`run.mjs`** — runs all cases, prints per-case composite + owner + the
  verification gap, plus a read-only **I3 deniability** re-confirm (real-set vs
  decoy-set output is structurally + verdict-identical, no field naming a
  set/count/balance). Exits non-zero on any scorer-behaviour mismatch.
- **`chain-read.mjs`** — *optional, read-only* Sepolia helpers (`resolveName`,
  `eth_getCode`) that turn the (D) cases from fixtures into real data. Needs
  `SEPOLIA_RPC_URL` (read-only endpoint, no key). Not invoked by `run.mjs`.

## Run the read-only scoring paths

```sh
node scripts/verify-risk/run.mjs
```

No env, no network. This is the full "read-only scoring paths" sweep.

## Turning a (D) case into real data (optional, still no broadcast)

```sh
# real ENS resolution → paste cacheEntry into a case's ensCache
SEPOLIA_RPC_URL=https://… node scripts/verify-risk/chain-read.mjs ens vitalik.eth

# real code-at-address → use the full result as chainData.recipientCode
SEPOLIA_RPC_URL=https://… node scripts/verify-risk/chain-read.mjs code 0x…
```

Then record the named real source (name→address, or the address whose code you
read) in the verification log as the (D) evidence.

## What is parked until you supply inputs

- All **B** broadcasts (S2, S3, S4, S1, S8a, the composite multi-fire). These need
  a funded Sepolia signer and a confirmed txid you supply. Score the confirmed tx
  via `score-tx.mjs <case.json>` and log the explorer link.
- The **verification log** itself (`docs/risk-verification-log.md`) — created only
  as real artifacts arrive. The module stays **UNAUDITED-PROVISIONAL** regardless.
- **S8b holdings-decoupling** is *not* in scope here: it is an integration/wiring
  property (does the producer of `activeSetLocalState` ever read balance?), not a
  signal behaviour, and is audit-gated. See the corrected plan's S8 section.
