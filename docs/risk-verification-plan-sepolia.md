# Risk Scoring v1 — testnet verification plan (Sepolia, all 8 signals)

**Goal:** move each signal from BUILT/UNAUDITED-PROVISIONAL (0-of-8 verified) toward *verified* per the hard rule: a signal is verified only when exercised against a **real malicious-pattern tx / real on-chain data**, not unit fixtures.

**Chain:** Sepolia first (best faucet supply, ENS resolves, full explorer tooling). Repeat per-chain later; record verified-count per (signal × chain).

**Execution:** Claude Code session or manual. This is broadcast + score work — the advisory session can't do it.

**What "verified" requires per signal — read this first:** Not every signal needs a broadcast. Three kinds:
- **(B) Broadcast** — you must put a real tx on-chain and feed the confirmed tx object to the scorer.
- **(D) Real on-chain data** — the signal reads real chain state (ENS, code-at-address); verified by pointing it at real data, no malicious broadcast needed.
- **(H) Real historical tx** — verified against a real existing on-chain tx exhibiting the pattern; no new broadcast needed.

---

## 0. Prerequisites (once)

1. A Sepolia EOA you control (the "victim" wallet) + its private key in a testnet-only env. **Never a mainnet key.**
2. Sepolia ETH from a faucet (e.g. a PoW/Alchemy/Infura Sepolia faucet). Need ~0.1 ETH for gas across all broadcasts.
3. A second Sepolia address (the "attacker"/counterparty) for poisoning + fresh-recipient cases.
4. A Sepolia RPC endpoint (Alchemy/Infura/public). Read-only is fine for (D)/(H); broadcasts need a funded signer.
5. A test ERC-20 on Sepolia for approval cases — deploy a trivial OpenZeppelin ERC-20, or use a known Sepolia test token. Record its address.
6. A scoring harness: a small script that builds/loads a tx object and calls the `src/risk` composite, printing `{level, evidence}` per signal + composite. This is the verification instrument — keep it out of `src/` (e.g. `scripts/verify-risk/`), it's not product code.

**Record for every run:** signal ID · tx hash (explorer link) or data source · expected level · actual level · PASS/FAIL · date · chain. One row per signal in a verification log (e.g. `docs/risk-verification-log.md`).

---

## Tier 1 — audit-priority (do first)

### S2 — unlimited approval · (B) broadcast
1. From victim EOA, broadcast `approve(spender, 2^256-1)` on the test ERC-20 to the attacker address. Confirm on explorer.
2. Feed the confirmed tx (real calldata) to the scorer.
3. **PASS:** S2 → RISK; evidence names the spender (mono) + flags max value.
4. Negative control: broadcast `approve(spender, 100e18)` (finite, below threshold). **PASS:** S2 does NOT fire RISK.
5. Fail-closed: hand the scorer a malformed/truncated approve calldata. **PASS:** INDETERMINATE, not OK.

### S4 — address poisoning / lookalike · (B) broadcast + real history
1. Seed real history: from victim, send a small real tx to the attacker address `0xABC…123`. Confirm.
2. Generate a lookalike address sharing prefix/suffix with `0xABC…123` (vanity-grind a Sepolia address, or use a known poisoning sample). It must be a real, distinct address.
3. Build a send to the *lookalike* and score it (history = the real prior counterparty).
4. **PASS:** S4 → RISK; evidence shows the lookalike vs the real counterparty, character-verify affordance present.
5. Negative control: send to the *exact* known counterparty. **PASS:** S4 does NOT fire (exact match ≠ lookalike).
6. Boundary: a legitimately different address (no prefix/suffix/Levenshtein match). **PASS:** no fire.

### S5 — ENS / resolved mismatch · (D) real on-chain data
> **Correction (was: "verify against real resolution" — implies the signal resolves on-chain).**
> S5 does NOT resolve ENS. It reads the active set's local `ensCache` only and is a pure
> function at score time — by design (I2: no new network call between tx construction and
> signing; the cache was populated earlier, when the UI resolved the name to display it). See
> `src/risk/signals/s5-ens-mismatch.js` (`activeSetLocalState.ensCache[ens]`).
>
> **So the realness of this (D) check enters through the cache, not the signal.** The
> *harness* (or, in production, the display layer) performs the one real Sepolia ENS
> resolution out-of-band via RPC, writes the true resolved address into `ensCache`, and then
> the scorer is fed a `to` that does/doesn't match it. "Real on-chain data" = a real
> resolution captured in the cache; the signal itself touches no chain. Record the RPC
> resolution (name → resolved address, block/explorer) as the (D) data source in the log.
1. Resolve a real Sepolia ENS name to address `X` via RPC (out-of-band). Put `{ [name]: X }` in `ensCache`. Build a tx whose `displayedEns` is that name but whose recipient is `Y ≠ X`.
2. **PASS:** S5 → RISK; evidence shows ENS→X vs recipient Y.
3. Negative control: recipient == cached resolved address (`to == X`). **PASS:** no fire.
4. Fail-closed: a `displayedEns` that is **absent from the cache** (the production analogue of an unresolvable / errored name — the signal never retries on-chain). **PASS:** INDETERMINATE, not OK.

---

## Tier 2

### S3 — fresh-spender approval · (B) broadcast
1. Reuse the S2 unlimited-approval tx, but ensure the spender is **not** in the known-good local set.
2. **PASS:** S3 → RISK (compounds with S2). Composite stays RISK.
3. Negative control: approve to a spender that IS in known-good set. **PASS:** S3 does not fire.

### S1 — fresh recipient · (B) light broadcast / real history
1. With send-history containing the attacker address, build a send to a brand-new never-seen Sepolia address.
2. **PASS:** S1 → INFO; "Fresh recipient" chip.
3. Negative control: send to an address already in history. **PASS:** no fire.
4. Confirm history read is active-set-scoped (feed decoy-set history → identical behaviour shape).

### S6 — dust input · (H) real historical tx
> Dusting is real on Sepolia. No need to craft an attack — find a real one.
1. Identify a real dust-tagged input received by an address (a tiny unsolicited token/ETH transfer). Tag it dust in local state.
2. Build a tx that consolidates/spends that input; score it.
3. **PASS:** S6 → CAUTION.
4. Fail-closed: inputs unreadable → INDETERMINATE.

### S7 — calldata / code mismatch · (D) real on-chain data
1. Real contract case: build calldata-bearing tx to a Sepolia address **with** code (the test ERC-20) → expect no mismatch. Then calldata to an EOA (no code) → **PASS:** CAUTION.
2. The "vice versa" branch you flagged: value-only native send to a contract address. **Confirm the product decision first** (does your user model ever do this?). Verify whichever behaviour you settle on.
3. Fail-closed: code-at-address unknown/unfetched → INDETERMINATE.

### S8 — value-vs-history anomaly
> **Correction (was: one signal with a "fund the victim, confirm output unchanged"
> holdings-decoupling step).** That step cannot run as written. S8's input is
> `activeSetLocalState.priorSendValuesWei` and `unsignedTx.value` only — there is *no balance
> field in its input to vary* (see `src/risk/signals/s8-value-anomaly.js`). You cannot prove
> decoupling by changing a number the signal never receives. Split S8 into two distinct
> claims with two distinct owners:

#### S8a — anomaly behaviour · (B) broadcast / real history · **harness-verifiable**
1. Seed history with several small real sends (≥ `MIN_HISTORY` = 3) to establish a low median **send** magnitude.
2. Build a send an order of magnitude larger (> `MULTIPLE` = 10 × median).
3. **PASS:** S8 → INFO; evidence cites the anomaly vs median *send* size.
4. Negative control: a send in line with the median. **PASS:** OK, no fire.
5. Honest-gating control: fewer than `MIN_HISTORY` priors. **PASS:** OK (an INFO that can't baseline must NOT escalate).
6. Fail-closed: unparseable value → INDETERMINATE.

#### S8b — holdings-decoupling (I2) · **integration-level · audit-gated · NOT harness-verifiable**
> This is not a property of the S8 signal — the signal already cannot see balance, so feeding
> it different balances proves nothing (there is no parameter to feed). The real question is a
> **wiring** one: does the send flow that *builds* `activeSetLocalState` ever read total
> balance / asset count / set membership and pass it in? That can only be shown by auditing
> the call site (the integration that assembles the state object), not by scoring txs.
> - **Structural claim (code-review grade):** `activeSetLocalState` carries no balance/holdings
>   field; the unit suite asserts the result shape. The harness can re-state this, but it is a
>   schema fact, not an on-chain verification.
> - **Integration claim (audit grade):** the producer of `activeSetLocalState` is balance-blind.
>   This is **audit-gated** — log it as a TARGET for the §24 audit's I2 review, not as a
>   testnet-verifiable signal. Do not record S8b in the per-signal verified-count.

---

## Composite + deniability re-confirm on real data

- After individual signals pass, build one tx that fires multiple (e.g. unlimited approval to a fresh lookalike spender) and confirm composite = max-priority (RISK) with ONE sentence owned by the highest-priority signal.
- Re-run the I3 check on real data: score the same real tx under real-set state and decoy-set state; confirm structurally + verdict-identical output, no field naming a set/count/balance. The unit test already asserts this — re-confirming on real chain data is the verification-grade version.

---

## Honest status accounting

- Update the verification log + any status table as each signal passes. A signal moves to *verified* ONLY with an explorer link (B/H) or a named real resolution source (D) in the log.
- The module stays **UNAUDITED-PROVISIONAL** even at 8-of-8 verified. Verified ≠ audited. On-chain verification proves the signals fire on real patterns; it does NOT replace the auditor's review of the signal *logic* (S2/S4/S5 especially). Keep the two axes separate: `verified-count` (testnet evidence) and `tier` (UNAUDITED-PROVISIONAL until audit).
- Do NOT let 8-of-8 green tempt the tier up. That's the same discipline that keeps multi-asset send honest at 1-of-10.
