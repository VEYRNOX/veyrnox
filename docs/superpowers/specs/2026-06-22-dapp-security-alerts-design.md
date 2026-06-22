# dApp Security Alerts (inline, WalletConnect) — design

**Status:** UNAUDITED-PROVISIONAL / BUILT-at-most. Wires the existing local known-bad
dApp list and the existing risk-signal engine into the live WalletConnect connect &
request flow so they fire automatically at the moment of exposure. Testnet-only repo;
nothing here unblocks mainnet, adds a backend, or touches the audit-gated hardening
surface (§24). No security control is mocked. The feature is "verified" ONLY after a real
testnet WalletConnect interaction confirms the alerts fire on-device — passing tests are
not verification.

**Date:** 2026-06-22

---

## Problem (root cause)

Veyrnox already has the two ingredients of dApp security alerts, but they are not connected
to the place a user is actually exposed:

- **A local known-bad dApp list exists but is passive.** `src/pages/DAppSecurityAlerts.jsx`
  ("dApp Domain Check") lets a user *manually* paste a domain to check it against an inline
  `LOCAL_KNOWN_BAD` list. A drainer does its damage at connect/sign time — not when someone
  remembers to go look a URL up — so a manual checker protects almost no one.
- **The risk-signal engine exists but is Send-only.** `src/risk/score.js` runs eight signals
  (S2 unlimited approval, S3 fresh-spender approval, S4 address poisoning, etc.) over an
  unsigned tx and reduces them to one verdict, surfaced in the Send flow via
  `RiskVerdictBanner`. The **WalletConnect** path does NOT call it: a dApp
  `eth_sendTransaction` currently shows only a generic "this will broadcast a transaction"
  warning in `RequestApprovalModal.jsx`, so S2/S3/S4 are silently missed for dApp-initiated
  transactions — exactly the transactions most likely to be hostile.
- **The known-bad list is also duplicated/stranded** inline in the page, with no single
  source of truth other modules can import.

There is therefore no *automatic* dApp security alert anywhere in the connect or signing
flow.

## Decision

Build inline alerts wired into the live WalletConnect flow (not a standalone alerts
feed/history — that is deferred as YAGNI). Alerts are **on-device and honest**: they can say
"known bad" or surface a risk verdict, but never claim a dApp is "safe". Behaviour follows
the existing acknowledge-to-proceed pattern already used for risky approvals — the user stays
sovereign (a small *local* list can have false positives; hard-blocking a self-custody wallet
is paternalistic and dangerous on a false positive).

Two surfaces:

1. **Connect-time** (`SessionProposalModal`): check the dApp domain against the shared
   known-bad list; if flagged, show a RISK alert and gate Connect behind an explicit
   acknowledgement.
2. **Request-time** (`RequestApprovalModal`): for `eth_sendTransaction`, run the existing
   `score()` engine and render the existing `RiskVerdictBanner`, gating Approve on a RISK
   verdict; and carry the connected dApp's known-bad domain status into every request.

## Design

### Components

#### 1. `src/risk/knownBadDapps.js` — shared known-bad dApp module (NEW, pure)

The single source of truth for the local known-bad list. Mirrors the
`wallet-core/evm/poison.js` `LOCAL_FLAGGED` pattern: local-only, leaks nothing off-device,
never asserts "safe" — only "known bad". Pure string inspection; no network, no keys, no
React.

```js
// Illustrative, non-exhaustive, LOCAL seed — intended to be hydrated from a real threat
// feed later, and still stay local. Moved verbatim out of DAppSecurityAlerts.jsx.
export const LOCAL_KNOWN_BAD = [ { domain, reason }, ... ];

export function normalizeDomain(input)   // lowercase, strip scheme/www/path → bare host
export function checkDappDomain(url)      // → { domain: string, flagged: boolean, reason: string|null }
```

`checkDappDomain` is **total**: empty / malformed / non-string input returns
`{ domain: '', flagged: false, reason: null }` and never throws (a crashing check must not
bypass to "not flagged" silently, but normalisation of a missing URL legitimately yields "no
domain to flag").

`DAppSecurityAlerts.jsx` is refactored to import `LOCAL_KNOWN_BAD` / `normalizeDomain` /
`checkDappDomain` from this module instead of defining them inline — one list, two callers
(the page and the WC flow).

#### 2. `src/risk/fromWalletConnect.js` — WC request → risk inputs adapter (NEW, pure)

Analogous to `src/risk/fromSendState.js`. Maps a WalletConnect `eth_sendTransaction` request
to the three inputs `score()` expects, reading only the ACTIVE set's local stores (I3). NO
network, NO signer, NO seed. Total by design: bad/missing inputs produce omitted fields so
signals fail closed rather than throwing.

```js
export function buildRiskInputsFromWcRequest({
  txParam,          // reqParams[0]: { to, value, data, ... }
  chainId,
  history = [],         // this set's Transaction records (S1, S8)
  knownAddresses = [],  // interacted-with corpus (S4)
  whitelist = [],       // known-good spenders (S3)
  recipientCode,        // eth_getCode(to) hex (S7); undefined → S7 fails closed → CAUTION
}) // → { unsignedTx, activeSetLocalState, chainData }
```

Mapping notes (kept faithful to `fromSendState.js` semantics):
- `value` ← `BigInt(txParam.value)` when parseable, else `undefined` (S8 fails closed).
- `data` ← `txParam.data || '0x'`. A dApp tx is a contract call, so calldata drives
  S2/S3/S7 directly — this is the whole point of scoring it.
- `to` ← `txParam.to` (the tx target; for a dApp this is typically the contract).
- `displayedEns: null`, `inputs: undefined` (no ENS display step, no UTXO inputs on EVM).

#### 3. `SessionProposalModal.jsx` — connect-time alert

On render, `const dapp = checkDappDomain(meta.url)`.
- **`dapp.flagged`** → render a prominent RISK alert block (the design-system risk token,
  `dapp.reason`, and `dapp.domain` shown in mono, never truncated) ABOVE the actions, and
  require an acknowledgement checkbox — "I understand this is a known scam/phishing site and
  want to connect anyway" — before Connect is enabled (`disabled={busy || (flagged &&
  !acknowledged)}`).
- **not flagged** → render nothing new. The existing generic "Only connect to dApps you
  trust…" line stays. We make **no** "safe"/"verified" claim — absence from a small local
  list proves nothing (honesty contract, same wording discipline as the page).

#### 4. `RequestApprovalModal.jsx` — request-time alert

Two additions, both inside the existing modal; existing typed-data `assetAuthorising` warning
and `personal_sign` hint are unchanged.

(a) **Connected-dApp domain carry-through (all request types).**
`const dapp = checkDappDomain(sessionMeta.url)`. If `dapp.flagged`, render the same RISK
alert block at the top of the modal — if you are connected to a known drainer, every request
it makes is suspect. This is a pure-local check; it does not gate on its own (the per-request
risk gate below and the existing per-method acknowledgements do the gating), but it is loud.

(b) **`eth_sendTransaction` risk scoring (the gap-closer).**
For `type === REQUEST_TYPES.SEND_TRANSACTION`:
1. Obtain `recipientCode` the SAME way the Send flow does — reuse the existing
   `simulate()` (`src/wallet-core/evm/simulate.js`), which already fetches `eth_getCode` (along
   with the balance/decode it does for Send) and exposes `recipientCode`
   (`SendCrypto.jsx` reads `txSim.data?.recipientCode`). Reusing `simulate()` gives the WC tx
   the same scoring inputs the Send flow gets and avoids a second redundant code fetch (I2). A
   bare `provider.getCode(to)` is the acceptable lighter fallback if the plan prefers it. On
   any error/timeout → `recipientCode = undefined` (S7 then reports CAUTION — correct
   fail-closed; we never treat an unknown as safe). The fetch runs in an effect; while pending,
   `RiskVerdictBanner` renders its `pending` state and Approve stays disabled.
2. `const inputs = buildRiskInputsFromWcRequest({ txParam, chainId, history, knownAddresses,
   whitelist, recipientCode })`.
3. `const verdict = score(inputs.unsignedTx, inputs.activeSetLocalState, inputs.chainData)`.
   `score()` already fails closed if it throws — but the caller still must not reach the
   signer on throw; we treat a thrown/absent verdict as block-Approve.
4. Render `<RiskVerdictBanner verdict={verdict} pending={codePending} acknowledged={...}
   onAcknowledge={...} />`.
5. Fold the banner into the existing `approveBlocked`: Approve is blocked while
   `codePending`, or when `verdict.requiresConfirmation && !riskAcknowledged`, in ADDITION to
   the existing `txAcknowledged` "I understand this will send a real transaction" gate. (Both
   gates coexist: the generic broadcast acknowledgement AND, on RISK, the risk acknowledgement.)

The local stores (`history`, `knownAddresses`, `whitelist`) are read from the same active-set
sources the Send flow's adapter reads — surfaced to the modal via the existing
`WalletConnectProvider` / wallet context (no new store, no new fetch beyond the one
`eth_getCode`, which the Send flow already makes for its own scoring).

### Data flow

```
Session proposal ─▶ checkDappDomain(meta.url) ───────────────▶ RISK alert + ack-gate (local, no net)
                                                                 │
eth_sendTransaction request ─▶ simulate(to,…) → recipientCode (as Send does; fail-closed)
                            └▶ buildRiskInputsFromWcRequest ─▶ score() ─▶ RiskVerdictBanner + ack-gate
connected dApp domain ──────▶ checkDappDomain(session.url) ──▶ RISK alert (local, no net)
```

### Error handling / invariants

- **I2/I3 (no silent egress, deniability):** the domain check is pure-local (no network). The
  send-tx scoring reads only ACTIVE-set local stores plus the `simulate()` the Send flow
  already runs (whose `eth_getCode` supplies `recipientCode`) — no new egress class, no
  backend, deniability preserved. The rendered verdict/alert shape is identical for a real or
  decoy set.
- **Fail closed (I4):** `checkDappDomain` is total. `buildRiskInputsFromWcRequest` is total
  (bad inputs → omitted fields → signals INDETERMINATE → CAUTION). `score()` catches throwing
  signals → CAUTION. `eth_getCode` failure → `recipientCode` undefined → S7 CAUTION. A RISK
  verdict gates Approve; a thrown/absent verdict blocks Approve. No path silently reads "safe".
- **No fake security / honesty:** no green "safe to connect" verdict anywhere — only
  RISK/CAUTION/INFO or silence. The known-bad list is labelled illustrative/local/non-
  exhaustive. The feature ships **BUILT / UNAUDITED-PROVISIONAL** at most; "verified" requires
  a real testnet WC interaction, not a green suite.
- **Demo mode:** the domain check is harmless local string work; demo has no real WC sessions,
  so no fabricated alerts are produced.

### Testing

- **Unit — `knownBadDapps`:** scheme/`www`/path stripping; case-insensitivity; typosquat hit
  returns reason; clean domain returns `flagged:false`; empty/malformed/non-string input
  returns `{domain:'',flagged:false}` and never throws.
- **Unit — `fromWalletConnect`:** maps `{to,value,data,chainId}` faithfully; unparseable
  `value` → `undefined`; missing `data` → `'0x'`; `recipientCode` passthrough; bad inputs omit
  fields (fail closed). Asserts parity with `fromSendState` semantics where they overlap.
- **Component — `SessionProposalModal`:** known-bad domain renders the RISK alert and disables
  Connect until acknowledged; clean domain renders no new claim and leaves Connect enabled.
- **Component — `RequestApprovalModal`:** `eth_sendTransaction` renders `RiskVerdictBanner`;
  Approve disabled while code-fetch pending; a RISK verdict requires the risk acknowledgement
  (in addition to the existing broadcast acknowledgement) before Approve enables; a known-bad
  connected-dApp domain renders the RISK alert across request types.

## Out of scope (later phases)

- Persistent alerts **feed / notification-center history** (this build is inline-only).
- A **live remote threat feed** — the list stays a local seed; hydrate later, still local.
- Risk-scoring **arbitrary `personal_sign` / typed-data** beyond the existing
  `assetAuthorising` heuristic.
- In-app **dApp browser**.

## Status tag

**BUILT** at most on merge (in code, testnet/provisional, UNAUDITED-PROVISIONAL). Not "live"
or "verified" until a real testnet WalletConnect interaction confirms the alerts fire
on-device with the expected verdicts.
