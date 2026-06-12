# Wiring `score()` into the send flow — design

**Date:** 2026-06-08
**Status:** DESIGN (pre-implementation). The wired module is **BUILT** on merge (unit-green), never "verified".
**Scope:** integrate the existing `src/risk` composite scorer (Risk Scoring v1, UNAUDITED-PROVISIONAL) into `SendCrypto.jsx` as the authoritative pre-sign verdict + the first real RISK gate on the signer.

---

## 1. Problem & context

`src/risk/score.js` (the 8-signal composite) is code-complete and unit-green (10 suites / 51 tests) but is a **standalone island**: nothing in the app imports it. The spec (`docs/risk-scoring-v1-spec.md` §6) says `score()` must be called *between* tx construction and signer invocation, and that "the signer is never reached if a RISK composite is unconfirmed." Neither is true today.

Meanwhile `SendCrypto.jsx` already carries **overlapping, ad-hoc pre-sign machinery** built before `src/risk` existed:

- `PoisonWarning` + `screenRecipient` (`wallet-core/evm/poison.js`) ≈ **S4** (address poisoning).
- `tokenCalldata`/`describeErc20Call` flags unlimited `approve` ≈ **S2** (spender ≈ S3).
- `simulateEvmTransaction` (`wallet-core/evm/simulate.js`) flags unlimited approval, look-alike recipient, no-code recipient (≈ S7), predicted revert, large outflow (≈ S8-ish), first-time recipient (≈ S1).
- `resolveENS` → `ensResolved {name,address}` ≈ the input for **S5**.

So the core decision is not *how* to call `score()` but *what relationship it has to the existing warnings*. This design wires `score()` as the **authoritative one-sentence verdict + the RISK gate**, while leaving the existing display warnings in place for a **later** consolidation. It does **not** modify any signal logic.

### Decisions locked in (from brainstorming)

1. **Integration scope:** authoritative gate, keep existing display. `score()` becomes the single blocking RISK gate (currently nothing blocks on poisoning); consolidation of the legacy warnings is deferred.
2. **Verdict placement:** a single authoritative banner at the **verify** step. The legacy `PoisonWarning` stays on the **form** step (early feedback) and is **removed from the verify step** (no double-warning).
3. **Demo:** run `score()` in demo on the entered inputs, with a synthetic EOA `recipientCode` (see §5).
4. **Preview overlap:** the banner is authoritative on top; `TransactionPreview` (txSim) stays **unchanged** below it (balance changes + revert + its risk list). Residual risk-list overlap is accepted as an honest interim state until consolidation.
5. **Mechanism:** a pure, unit-tested adapter (`buildRiskInputs`) + `useMemo`, plus a sign-time hard re-check mirroring the existing spend-limit gate.

---

## 2. Architecture & data flow

```
SendCrypto state ──▶ buildRiskInputs()  [NEW pure fn, src/risk/fromSendState.js]
   (to, amount,          │
    calldata, ens,       ▼
    history, whitelist)  { unsignedTx, activeSetLocalState, chainData }
                         │
   simulate result ──────┤ (recipientCode surfaced from the existing eth_getCode)
                         ▼
                      score()  [EXISTING, UNCHANGED]
                         │
                         ▼
              { level, sentence, evidence, requiresConfirmation }
                         │
            ┌────────────┴─────────────┐
            ▼                          ▼
   RiskVerdictBanner            sign-time re-check
   (verify step, 1 sentence)    (in sendTx mutation, fail-closed)
```

### Files

- **NEW** `src/risk/fromSendState.js` — pure mapping fn. Imports only `parseEther` from ethers.
- **NEW** `src/risk/__tests__/fromSendState.test.js` — unit tests (codebase discipline).
- **NEW** `src/components/RiskVerdictBanner.jsx` — small presentational component (no logic).
- **EDIT** `src/pages/SendCrypto.jsx` — call adapter + `score()` in `useMemo`; render banner; gate buttons; sign-time re-check.
- **EDIT** `src/wallet-core/evm/simulate.js` — surface `recipientCode` (and `targetIsContract`) in the returned object so S7 can consume the **already-fetched** `eth_getCode` (no new RPC; I2 intact).

`src/risk/score.js`, `levels.js`, the 8 signals, and their tests are **untouched** — pure wiring, no signal-logic change, no new audit surface in the scorer itself.

---

## 3. State mapping (`buildRiskInputs`)

All sources are the **same local stores the existing warnings already read**. No new data, no new fetch.

### `unsignedTx`

| Field | Source | Notes |
|---|---|---|
| `to` | `toAddress` | Resolved `0x…`; at verify the form gate guarantees validity. |
| `value` | native → `parseEther(amount)` (bigint wei); erc20 → `0n` | ERC-20 value rides in calldata, so native value is `0` → S8 no-ops on tokens (correct). |
| `data` | native → `'0x'`; erc20 → `buildTokenTransfer(...).data` | Drives S2/S3. Plain ETH send → `'0x'` → S2/S3 OK. |
| `displayedEns` | `ensResolved?.name` else `null` | Set only when the UI resolved+displayed a name. Raw-address send → `null` → S5 OK. |
| `inputs` | `undefined` | EVM has no UTXO inputs → S6 N/A → OK. |
| `chainId` | `activeNetwork.chainId` | Carried for completeness; no v1 signal reads it. |

### `activeSetLocalState`

| Field | Signal | Source | Notes |
|---|---|---|---|
| `sendHistory` | S1 | `history` filtered `type==='send'` → `{to: to_address}` | Fresh-recipient check. |
| `counterparties` | S4 | `knownAddresses` (history + book + whitelist, already built) | Passed as-is; S4's `entryAddr` reads `.address`. |
| `knownGoodSpenders` | S3 | `whitelist` addresses | If empty, any `approve` to an unlisted spender → RISK (compounds S2). Only reachable on the approve/dev-ungate path; transfer-only sends never hit S3. |
| `ensCache` | S5 | `ensResolved ? { [name]: address } : {}` | **I2-critical:** resolution already happened at display time (`resolveENS`); we only cache its result — no new network call at score time. |
| `dustInputs` | S6 | `[]` | EVM N/A. |
| `priorSendValuesWei` | S8 | native `send` history → `parseEther(amount)` (guarded) | Native-only baseline; parse failures dropped, matching S8's own `toWei` tolerance. |

### `chainData`

| Field | Signal | Source | Notes |
|---|---|---|---|
| `recipientCode` | S7 | surfaced from `txSim.data` (existing `eth_getCode`) | Unresolved / errored / demo → `undefined` → S7 INDETERMINATE → composite escalates to CAUTION (honest fail-closed, I4). Demo override in §5. |

### Deniability note (I3) — audit follow-up, not in scope

`history`, `addressBook`, `whitelist` come via `base44.entities` — the *same* sources the existing poison/limit/simulate logic already consumes. Whether that layer is strictly active-set-scoped is a **pre-existing** question (the vault-vs-localClient store seam). This wiring neither fixes nor worsens it; flagged here as a follow-up for the §24 audit's I3 review.

---

## 4. Gating & UX

### Banner (`RiskVerdictBanner`) — design system §5

| Level | Render | Friction |
|---|---|---|
| OK | nothing | none |
| INFO | neutral chip, one token color (`--info`/accent) | none |
| CAUTION | one amber sentence (`--caution`) | none — sign proceeds |
| RISK | one coral sentence (`--risk`) + destructive-confirm; the "Sign anyway" checkbox appears **only after** the sentence | blocks until acknowledged |

- One sentence only — the winning signal owns it (`verdict.sentence`). No wall of warnings.
- `evidence.values` (spender, resolved address, recipient) → IBM Plex Mono, truncated-middle.
- Banner area is structurally identical real vs decoy (I3): same chrome, same copy logic, no element implying which set is active.

### Gating — mirrors the two existing patterns (`approvalAck`, `limitAck`)

1. **Verify-step block.** New `riskAck` state. `blockedByRisk = verdict.requiresConfirmation && !riskAck`. The 2FA verify buttons get `disabled={… || blockedByRisk}` — exactly how `blockedByApproval` already disables them. INFO/CAUTION → `requiresConfirmation:false` → never block.
2. **Freshness.** `useEffect(() => setRiskAck(false), [amount, currency, toAddress, data])` — same discipline as `limitAck`, so a stale ack never carries into a changed send.
3. **Sign-time hard re-check (defense-in-depth).** In `sendTx.mutationFn`, recompute `buildRiskInputs` + `score()` and `throw` if `requiresConfirmation && !riskAck` — mirroring the `limitGate` re-evaluation. This is what finally enforces spec §6 ("signer never reached if a RISK composite is unconfirmed"), which nothing currently enforces.

### Placement

- **Verify step:** replace the repeated `<PoisonWarning>` with `<RiskVerdictBanner>`; keep `<TransactionPreview>` unchanged below it (balance changes + revert + risk list).
- **Form step:** `<PoisonWarning>` stays as early feedback.

---

## 5. Demo handling

Demo is a *declared-fake* world (already seeds balances/history/the poison address). Running `score()` there is honest provided S7's missing chain fact is handled openly:

- **Real computation, demo-seeded chain fact.** S2/S4/S5/S8 genuinely evaluate the entered `to`/`amount`/`calldata` — nothing mocked. S7's `recipientCode` has no live RPC in demo, so supply a **synthetic `recipientCode: '0x'`** (treat demo recipients as EOAs). Avoids a permanent fail-closed CAUTION; consistent with demo's existing fake balances — not a mocked control.
  - A plain demo value-send → S7 OK; `DEMO_POISON_ADDRESS` value-send → S4 fires RISK (a clean live showcase of the gate + "Sign anyway").
- **Honesty guard (CLAUDE.md "no fake security").** The banner in demo sits alongside demo's existing sample-data disclosure, so a demo verdict is never mistaken for a real on-chain check. The verdict is real; the chain state behind S7 is labeled demo.
- **Placement unchanged.** "On form inputs" = computed from entered values; the banner still renders at the verify step (live and demo alike).

---

## 6. Testing & error handling

- **New unit test** `src/risk/__tests__/fromSendState.test.js`: native vs erc20 `unsignedTx` shape; `ensCache` populated only when a name was displayed; `priorSendValuesWei` wei-conversion + drop-on-unparseable; `recipientCode` present/absent/demo; empty-state safety.
- **`score.js` and the 8 signal tests stay untouched.**
- **Fail-closed:** `buildRiskInputs` is total — never throws (bad inputs → omitted fields → signals fail closed). `score()` already catches per-signal throws → INDETERMINATE → CAUTION. The sign-time re-check is wrapped so that if scoring itself throws, the mutation fails closed (throws, does not sign) — consistent with spec §6.
- **Invariants:** no new deps (only ethers `parseEther`), no new network calls, no signer/seed contact (I1/I2 intact). `simulate.js` change only re-exposes data it already fetched.

---

## 7. Status & honesty accounting

- This PR makes the wiring **BUILT** (code-complete, unit-green), **not verified**. The 0-of-8 on-chain verification (`docs/risk-verification-plan-sepolia.md`) is unchanged; wiring *enables* later harness verification, it does not substitute for it.
- The module stays **UNAUDITED-PROVISIONAL**. Wiring it in does not drop the caveat — the signal logic (S2/S4/S5 especially) still needs the §24 audit.
- Out of scope (deferred, named here so the boundary is explicit): consolidating `TransactionPreview`'s risk list and `PoisonWarning` into `score()`; verifying active-set scoping of the `base44.entities` stores (I3); any BTC/SOL send path (S6 dust).

---

## 8. Implementation order (for the plan)

1. `simulate.js`: surface `recipientCode` + `targetIsContract` in the result (+ keep its tests green).
2. `src/risk/fromSendState.js` + its unit test (TDD).
3. `RiskVerdictBanner.jsx`.
4. `SendCrypto.jsx`: `useMemo` verdict, banner at verify, button gating, freshness reset, sign-time re-check, demo `recipientCode`.
5. Full `vitest run src/risk` + the simulate suite green; manual smoke per design-system states (OK/INFO/CAUTION/RISK) in demo.
