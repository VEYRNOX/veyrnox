# Risk Scoring v1 — pre-sign on-device risk module

**Status:** PLANNED (spec) · target tier on build: **UNAUDITED-PROVISIONAL**
**Scope:** on-device transaction risk evaluation, computed from the unsigned tx + locally-held state. No egress. No holdings coupling.
**Framing:** PRE-AUDIT.

---

## 1. What this is (and is not)

This is the scoring spine of the MONITORING & RISK roadmap line. It evaluates a transaction **before signing** and surfaces, at most, one plain-language sentence (per the design system's "plain-language risk" principle). It is the natural extension of the existing pre-sign risk affordances already named in the design system (fresh recipient, unlimited approval, poisoning).

It is **not**:
- A background monitor (nothing runs while the app is idle).
- A network service (no indexer calls beyond chain data the wallet already fetches to build the tx).
- A holdings-aware engine (signals never read total balance, asset count, or wallet-set membership in a way that could leak via timing or output).

## 2. Invariant compliance

| Invariant | How v1 holds it |
|---|---|
| **I1** keys never leave device | Scoring touches the unsigned tx only; never the seed/private key. Runs before the signer is invoked. |
| **I2** no silent egress | All signals computed from (a) the unsigned tx object and (b) data the wallet already fetched to build that tx. No new network calls introduced by scoring. |
| **I3** deniability is sacred | Signal inputs are **scoped to the active wallet-set only**. No signal may read across wallet-sets. History-based signals (e.g. fresh-recipient) read only the active set's send history. The decoy's scorer behaves identically on the decoy's own history. **No score, chip, or limit may differ in a way that reveals another set exists.** |
| **I4** fail honest / fail closed | If a signal cannot be evaluated (missing data, decode failure), it returns `INDETERMINATE` and the composite **escalates** (treats absence as caution), never silently passes. A scorer crash blocks the sign path, it does not bypass it. |
| **I5** backend untrusted | Scoring never depends on a backend verdict. No "is this address safe?" server lookup. |

## 3. Signals (v1 set)

All signals are pure functions of `(unsignedTx, activeSetLocalState, chainData)` → `{ level, evidence }` where `level ∈ {OK, INFO, CAUTION, RISK, INDETERMINATE}`.

| ID | Signal | Inputs | Level on hit | Notes |
|---|---|---|---|---|
| S1 | **Fresh recipient** | recipient ∉ active-set send history | INFO | Design-system "Fresh recipient" chip. History is active-set-scoped (I3). |
| S2 | **Unlimited approval** | `approve(spender, value)` where `value == 2^256-1` (or ≥ threshold) | RISK | The classic drainer vector. Plain sentence + character-verify spender. |
| S3 | **Approval to fresh spender** | S2-style approve where spender ∉ known-good local set | RISK | Compounds with S2. |
| S4 | **Address poisoning / lookalike** | Levenshtein / prefix-suffix match of recipient against recent counterparties (active-set) but not equal | RISK | Detects the "looks like an address you used" attack. |
| S5 | **ENS / resolved mismatch** | displayed ENS resolves to address ≠ tx recipient | RISK | Resolution must be deterministic and local-cache-checked; mismatch fails closed. |
| S6 | **Dust input present** | tx spends/consolidates a known dust-tagged input | CAUTION | Dusting deanonymises; warn before consolidating. |
| S7 | **Calldata to non-contract / contract-to-EOA mismatch** | calldata present but recipient has no code (or vice versa) | CAUTION | Catches malformed / mis-targeted sends. |
| S8 | **Value-vs-history anomaly** | tx value ≫ active-set's typical send (rolling, local) | INFO | Local only. Must NOT read total balance — only prior *send* magnitudes in this set. |

> **Deferred (need design decision, not in v1):** any signal requiring a remote allowlist/blocklist (egress), any signal reading total holdings (I2/holdings-coupling), chain-analytics "tainted funds" lookups (egress + I5).

## 4. Composite

```
levels priority: RISK > CAUTION > INFO > OK
INDETERMINATE is treated as CAUTION for escalation (I4 fail-closed)

composite = max-priority level across fired signals
```

- **OK** → no banner; sign proceeds normally.
- **INFO** → one neutral chip (e.g. "Fresh recipient"), no friction.
- **CAUTION** → one amber sentence, sign button normal.
- **RISK** → one coral sentence + the destructive-confirm pattern ("Sign anyway" in `--risk`, only after the sentence), per the design system.

The composite returns **one** sentence (highest-priority fired signal owns the copy). No wall of warnings — that's an explicit design-system constraint.

## 5. UI conformance (design system)

- Risk chips: small, **one** token color from `{--caution, --risk, --info, --accent}`, one-sentence explanation. Never stack colors.
- Verifiable values in the evidence (spender address, value, chain ID) → **IBM Plex Mono**, truncated-middle for addresses (`0x8F3a…b9c4`), character-verify affordance on S4/S5.
- Prose (the risk sentence) → **Schibsted Grotesk**, sentence case, calm.
- Destructive path uses `--risk` fill, and only appears *after* the plain sentence.
- **Deniability:** the banner area is structurally identical in real and decoy modes. No element implies "this is your real wallet, be careful" vs "this is the decoy." Same chrome, same copy logic.

## 6. Architecture placement

- New module `src/risk/score.js` (pure, no I/O) + `src/risk/signals/*.js` (one file per signal, each a pure fn).
- Called by the send flow **between** tx construction and signer invocation. The signer (`vault.js` derivation path) is never reached if a RISK composite is unconfirmed.
- No new dependency on backend, no new network client. Reuses chain data already fetched for gas/nonce.
- Tests: each signal gets unit tests (hit/miss/indeterminate); composite gets escalation + fail-closed tests. Target parity with existing test discipline (signals must be green before the module is merged; merge via PR so the verify CI gate runs, per repo convention for `src/` changes).

## 7. Status tags on ship

- Module merges as **UNAUDITED-PROVISIONAL** — it is security-adjacent code that influences whether a user signs. The provisional caveat cannot be dropped until the independent audit reviews the signal logic (S2/S4/S5 in particular are the ones an attacker would target).
- "Code-ready ≠ verified." A signal is only considered *verified* once exercised against a real malicious-pattern tx (testnet), not just unit fixtures.

## 8. Honest note on priority

This module is buildable, delegatable, and audit-relevant — which is exactly why it's tempting. It is **not** a mainnet blocker. S2/S4/S5 are genuinely worth the auditor's eyes, which is an argument for *booking the audit*, not for shipping the module first and the audit later.
