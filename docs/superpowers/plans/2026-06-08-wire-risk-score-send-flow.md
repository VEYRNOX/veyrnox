# Wire risk score() into the send flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the standalone `src/risk` composite scorer into `SendCrypto.jsx` as the authoritative one-sentence pre-sign verdict and the first real RISK gate on the signer.

**Architecture:** A pure, unit-tested adapter (`buildRiskInputs`) maps `SendCrypto`'s live local state to `score()`'s three inputs. `SendCrypto` calls it in a `useMemo`, renders the verdict via a small presentational `RiskVerdictBanner` at the verify step, and re-evaluates at signing time (fail-closed) — mirroring the existing spend-limit gate. `simulate.js` is extended to surface the `eth_getCode` it already fetches so S7 needs no new RPC call. No signal logic changes.

**Tech Stack:** Vite + React, ethers v6, Vitest. Design-system tokens `risk`/`caution`/`info` (tailwind.config.js).

**Spec:** `docs/superpowers/specs/2026-06-08-wire-risk-score-send-flow-design.md`

**Invariants to preserve:** I1 (no seed/key contact), I2 (no new network call — reuse already-fetched data), I3 (deniability: banner structurally identical real/decoy), I4 (fail honest / fail closed). Status on merge is **BUILT** (unit-green), never "verified" — 0-of-8 on-chain verification is unchanged.

---

## File structure

- **Create** `src/risk/fromSendState.js` — pure mapping fn `buildRiskInputs(...)`. Imports only `parseEther`.
- **Create** `src/risk/__tests__/fromSendState.test.js` — unit tests for the adapter + its integration with `score()`.
- **Create** `src/components/RiskVerdictBanner.jsx` — presentational verdict banner (no risk logic).
- **Modify** `src/risk/index.js` — re-export `buildRiskInputs`.
- **Modify** `src/wallet-core/evm/simulate.js` — surface `recipientCode` + `targetIsContract` in `simulateEvmTransaction`'s result.
- **Modify** `src/pages/SendCrypto.jsx` — memoized verdict, banner at verify step, button gating, freshness reset, sign-time re-check.

---

## Task 1: Surface `recipientCode` from the simulation

**Files:**
- Modify: `src/wallet-core/evm/simulate.js` (the `simulateEvmTransaction` function, ~lines 318–400)

The simulation already does `eth_getCode` but discards the raw hex (keeps only a boolean). Surface it so S7 can reuse it (I2: no second `getCode`). This is additive — the existing suite asserts specific fields, so non-breaking.

- [ ] **Step 1: Capture the raw code in the getCode block**

In `simulateEvmTransaction`, replace this block:

```js
  // Is the tx target a contract? (eth_getCode)
  let targetIsContract = false;
  try {
    const code = await provider.getCode(to);
    queries.push('eth_getCode');
    targetIsContract = !!code && code !== '0x';
  } catch { /* RPC unreachable — degrade, never block */ }
```

with:

```js
  // Is the tx target a contract? (eth_getCode) Capture the raw code too so
  // downstream consumers (risk S7) can reuse this already-fetched read instead of
  // issuing a second eth_getCode (I2: no new network call).
  let targetIsContract = false;
  let recipientCode = null;
  try {
    const code = await provider.getCode(to);
    queries.push('eth_getCode');
    recipientCode = code;
    targetIsContract = !!code && code !== '0x';
  } catch { /* RPC unreachable — degrade, never block */ }
```

- [ ] **Step 2: Add the fields to the returned object**

In the `return { ... }` at the end of `simulateEvmTransaction`, add two lines immediately after `simulated: true,`:

```js
    simulated: true, // a real on-chain dry-run (eth_call) ran
    recipientCode,    // raw eth_getCode hex of `to` (null if unfetchable) — risk S7 input
    targetIsContract, // convenience boolean derived from recipientCode
```

- [ ] **Step 3: Run the simulate suite to confirm non-breakage**

Run: `npx vitest run src/wallet-core/__tests__/simulate.test.js`
Expected: PASS (all existing tests still green; the added fields don't affect `assessEvmTransaction` tests or the input-guard test).

- [ ] **Step 4: Commit**

```bash
git add src/wallet-core/evm/simulate.js
git commit -m "feat(simulate): surface recipientCode for downstream risk S7 (no new RPC)"
```

---

## Task 2: `buildRiskInputs` pure adapter (TDD)

**Files:**
- Create: `src/risk/fromSendState.js`
- Modify: `src/risk/index.js`
- Test: `src/risk/__tests__/fromSendState.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/risk/__tests__/fromSendState.test.js`:

```js
// src/risk/__tests__/fromSendState.test.js
//
// buildRiskInputs — the pure adapter that maps SendCrypto's live local state to
// score()'s three inputs. No network, no signer. Total: bad/missing input yields
// omitted fields so the signals fail closed, never a throw.

import { describe, it, expect } from 'vitest';
import { parseEther } from 'ethers';
import { buildRiskInputs } from '../fromSendState.js';
import { score } from '../score.js';
import { LEVEL } from '../levels.js';

const TO = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const A  = '0xa11ce1234567890abcdef1234567890abcc0ffee';

describe('buildRiskInputs — unsignedTx', () => {
  it('native send: value is parseEther(amount) wei and data is 0x', () => {
    const { unsignedTx } = buildRiskInputs({ to: TO, amountText: '0.05', isErc20: false, chainId: 11155111 });
    expect(unsignedTx.to).toBe(TO);
    expect(unsignedTx.value).toBe(parseEther('0.05'));
    expect(unsignedTx.data).toBe('0x');
    expect(unsignedTx.inputs).toBeUndefined();
    expect(unsignedTx.chainId).toBe(11155111);
  });

  it('erc20 send: value is 0n and data is the calldata', () => {
    const { unsignedTx } = buildRiskInputs({ to: TO, amountText: '12.5', isErc20: true, calldata: '0xa9059cbb00' });
    expect(unsignedTx.value).toBe(0n);
    expect(unsignedTx.data).toBe('0xa9059cbb00');
  });

  it('unparseable amount -> value undefined (S8 then fails closed)', () => {
    const { unsignedTx } = buildRiskInputs({ to: TO, amountText: 'abc', isErc20: false });
    expect(unsignedTx.value).toBeUndefined();
  });
});

describe('buildRiskInputs — ensCache (S5)', () => {
  it('populates the cache ONLY when both name and resolved address are present', () => {
    const { activeSetLocalState } = buildRiskInputs({
      to: TO, amountText: '1', displayedEns: 'alice.eth', ensResolvedAddress: A,
    });
    expect(activeSetLocalState.ensCache).toEqual({ 'alice.eth': A });
  });

  it('empty cache when no name was displayed', () => {
    const { activeSetLocalState } = buildRiskInputs({ to: TO, amountText: '1' });
    expect(activeSetLocalState.ensCache).toEqual({});
  });
});

describe('buildRiskInputs — priorSendValuesWei (S8)', () => {
  it('converts native sends of the selected asset to wei and drops bad amounts', () => {
    const history = [
      { type: 'send', currency: 'ETH', amount: '0.1' },
      { type: 'send', currency: 'ETH', amount: 'oops' },
      { type: 'receive', currency: 'ETH', amount: '5' },
      { type: 'send', currency: 'MATIC', amount: '9' },
    ];
    const { activeSetLocalState } = buildRiskInputs({ to: TO, amountText: '1', assetCurrency: 'ETH', history });
    expect(activeSetLocalState.priorSendValuesWei).toEqual([parseEther('0.1')]);
  });

  it('is empty for an erc20 send (value rides in calldata)', () => {
    const history = [{ type: 'send', currency: 'USDC', amount: '10' }];
    const { activeSetLocalState } = buildRiskInputs({ to: TO, amountText: '1', isErc20: true, assetCurrency: 'USDC', history });
    expect(activeSetLocalState.priorSendValuesWei).toEqual([]);
  });
});

describe('buildRiskInputs — chainData (S7)', () => {
  it('passes recipientCode through verbatim', () => {
    expect(buildRiskInputs({ to: TO, amountText: '1', recipientCode: '0x' }).chainData.recipientCode).toBe('0x');
    expect(buildRiskInputs({ to: TO, amountText: '1', recipientCode: '0x60806040' }).chainData.recipientCode).toBe('0x60806040');
    expect(buildRiskInputs({ to: TO, amountText: '1' }).chainData.recipientCode).toBeUndefined();
  });
});

describe('buildRiskInputs — totality + mapping', () => {
  it('never throws on empty input', () => {
    expect(() => buildRiskInputs()).not.toThrow();
    const r = buildRiskInputs();
    expect(r.unsignedTx).toBeTruthy();
    expect(r.activeSetLocalState).toBeTruthy();
    expect(r.chainData).toBeTruthy();
  });

  it('maps knownAddresses to counterparties and whitelist to knownGoodSpenders', () => {
    const { activeSetLocalState } = buildRiskInputs({
      to: TO, amountText: '1',
      knownAddresses: [{ address: A, label: 'x' }],
      whitelist: [{ address: TO, currency: 'ETH' }],
    });
    expect(activeSetLocalState.counterparties).toEqual([{ address: A, label: 'x' }]);
    expect(activeSetLocalState.knownGoodSpenders).toEqual([{ address: TO, currency: 'ETH' }]);
  });
});

describe('buildRiskInputs — integrates with score()', () => {
  it('a look-alike recipient yields a RISK composite (S4)', () => {
    const known = '0xa11ce1234567890abcdef1234567890abcc0ffee';
    const lookAlike = '0xa11cefedcba0987654321fedcba0987654c0ffee';
    const inputs = buildRiskInputs({
      to: lookAlike, amountText: '0.1', assetCurrency: 'ETH',
      knownAddresses: [{ address: known, label: 'paid before' }],
      recipientCode: '0x', // EOA, so S7 stays OK
    });
    const verdict = score(inputs.unsignedTx, inputs.activeSetLocalState, inputs.chainData);
    expect(verdict.level).toBe(LEVEL.RISK);
    expect(verdict.requiresConfirmation).toBe(true);
  });

  it('a clean fresh-recipient send is at most INFO and never requires confirmation', () => {
    const inputs = buildRiskInputs({ to: TO, amountText: '0.05', assetCurrency: 'ETH', recipientCode: '0x' });
    const verdict = score(inputs.unsignedTx, inputs.activeSetLocalState, inputs.chainData);
    expect(verdict.requiresConfirmation).toBe(false);
    expect([LEVEL.OK, LEVEL.INFO]).toContain(verdict.level);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/risk/__tests__/fromSendState.test.js`
Expected: FAIL — `Failed to resolve import '../fromSendState.js'` (file does not exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/risk/fromSendState.js`:

```js
// src/risk/fromSendState.js
//
// Risk Scoring v1 — UNAUDITED-PROVISIONAL.
//
// Pure adapter: maps SendCrypto's live local state to the three inputs score()
// expects — (unsignedTx, activeSetLocalState, chainData). NO network, NO signer,
// NO seed; imports only ethers' parseEther. Total by design: bad/missing inputs
// produce omitted fields so the signals fail closed rather than throwing.
//
// All sources are the SAME local stores the existing pre-sign warnings already
// read (history / address book / whitelist). This adapter introduces no new data
// and no new fetch (I1/I2). It is where every mapping, unit-conversion and I3
// scoping decision lives — and is unit-tested as such.

import { parseEther } from 'ethers';

// Parse a decimal ETH-unit string to wei, or null if it is not a clean amount.
function toWeiOrNull(text) {
  try {
    if (text == null || String(text).trim() === '') return null;
    return parseEther(String(text));
  } catch {
    return null;
  }
}

/**
 * @param {object} p
 * @param {string} [p.to]                    resolved recipient address
 * @param {string} [p.amountText]            raw amount input (display units)
 * @param {boolean} [p.isErc20]              is this an ERC-20 send?
 * @param {string|null} [p.calldata]         ERC-20 calldata hex (transfer/approve), else null
 * @param {string|null} [p.displayedEns]     the ENS/SNS name the UI showed, else null
 * @param {string|null} [p.ensResolvedAddress] the address that name resolved to (display-time), else null
 * @param {number} [p.chainId]
 * @param {string} [p.assetCurrency]         selected asset symbol (filters prior native sends)
 * @param {Array}  [p.history]               base44 Transaction records
 * @param {Array}  [p.knownAddresses]        [{address,label,date}] interacted-with corpus
 * @param {Array}  [p.whitelist]             [{address,currency}] whitelisted addresses
 * @param {string|null|undefined} [p.recipientCode] eth_getCode hex of `to` (S7); undefined when unknown
 * @returns {{ unsignedTx: object, activeSetLocalState: object, chainData: object }}
 */
export function buildRiskInputs({
  to,
  amountText,
  isErc20 = false,
  calldata = null,
  displayedEns = null,
  ensResolvedAddress = null,
  chainId,
  assetCurrency,
  history = [],
  knownAddresses = [],
  whitelist = [],
  recipientCode,
} = {}) {
  // ERC-20 value rides in calldata, so the tx value is 0 (S8 then no-ops on tokens).
  // A native amount that won't parse yields undefined -> S8 fails closed.
  const value = isErc20 ? 0n : (toWeiOrNull(amountText) ?? undefined);

  const unsignedTx = {
    to: to || undefined,
    value,
    data: isErc20 ? (calldata || '0x') : '0x',
    displayedEns: displayedEns || null,
    inputs: undefined, // EVM: no UTXO inputs (S6 N/A)
    chainId,
  };

  // sendHistory (S1): this set's prior SENDS only.
  const sendHistory = (history || [])
    .filter((t) => t?.type === 'send' && t?.to_address)
    .map((t) => ({ to: t.to_address }));

  // priorSendValuesWei (S8): native-send magnitudes for the SELECTED asset only.
  // ERC-20 sends carry value in calldata (tx value 0), so S8 is native-only here.
  const priorSendValuesWei = isErc20
    ? []
    : (history || [])
        .filter((t) => t?.type === 'send' && t?.currency === assetCurrency)
        .map((t) => toWeiOrNull(t?.amount))
        .filter((v) => v !== null);

  // ensCache (S5): ONLY the name the UI already resolved at display time. No new
  // resolution here (I2). Absent name -> empty cache -> S5 not-applicable.
  const ensCache = (displayedEns && ensResolvedAddress)
    ? { [displayedEns]: ensResolvedAddress }
    : {};

  const activeSetLocalState = {
    sendHistory,                          // S1
    counterparties: knownAddresses || [], // S4 (entryAddr reads .address)
    knownGoodSpenders: whitelist || [],   // S3 (entryAddr reads .address)
    ensCache,                             // S5
    dustInputs: [],                       // S6 (EVM N/A)
    priorSendValuesWei,                   // S8
  };

  // chainData (S7): pass recipientCode through verbatim. undefined => S7 fails
  // closed (INDETERMINATE -> CAUTION) per I4.
  const chainData = { recipientCode };

  return { unsignedTx, activeSetLocalState, chainData };
}
```

- [ ] **Step 4: Re-export from the module surface**

In `src/risk/index.js`, add one line after the `export { score, SIGNALS } ...` / `export { LEVEL, PRIORITY } ...` lines:

```js
export { score, SIGNALS } from './score.js';
export { LEVEL, PRIORITY } from './levels.js';
export { buildRiskInputs } from './fromSendState.js';
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/risk/__tests__/fromSendState.test.js`
Expected: PASS (all describe blocks green).

- [ ] **Step 6: Run the whole risk suite to confirm no regression**

Run: `npx vitest run src/risk`
Expected: PASS — 11 files now (10 prior + fromSendState), all green.

- [ ] **Step 7: Commit**

```bash
git add src/risk/fromSendState.js src/risk/index.js src/risk/__tests__/fromSendState.test.js
git commit -m "feat(risk): buildRiskInputs adapter mapping send state to score() inputs"
```

---

## Task 3: `RiskVerdictBanner` presentational component

**Files:**
- Create: `src/components/RiskVerdictBanner.jsx`

> **Note on testing:** this component has no risk logic (it renders what `score()` returned) and the codebase has no component-test harness — it tests pure helpers, not React components. It is therefore verified by `npm run lint` + `npm run build` (Task 5) and the manual smoke (Task 5), not a unit test. All risk *logic* is covered by the Task 2 + existing signal tests.

- [ ] **Step 1: Create the component**

Create `src/components/RiskVerdictBanner.jsx`:

```jsx
// src/components/RiskVerdictBanner.jsx
//
// Risk Scoring v1 — UNAUDITED-PROVISIONAL.
//
// The ONE authoritative pre-sign verdict, rendered at the verify step.
// Presentational only: it renders whatever score() returned and owns no risk
// logic. Design system: one sentence, one token color (INFO/CAUTION/RISK),
// verifiable values in IBM Plex Mono truncated-middle, and a destructive-confirm
// ("Sign anyway") that appears ONLY after the sentence on RISK. Deniability (I3):
// the banner is structurally identical for a real or decoy set — same chrome,
// same copy logic; nothing here reads or reveals which set is active.

import { AlertTriangle, ShieldAlert, Info } from 'lucide-react';

const truncMiddle = (s) =>
  typeof s === 'string' && s.length > 12 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;

// Map a composite level to its design-system token + icon. OK renders nothing.
const STYLES = {
  INFO:    { box: 'bg-info/10 border-info/30',       text: 'text-info',    Icon: Info },
  CAUTION: { box: 'bg-caution/10 border-caution/30', text: 'text-caution', Icon: AlertTriangle },
  RISK:    { box: 'bg-risk/10 border-risk/40',       text: 'text-risk',    Icon: ShieldAlert },
};

export default function RiskVerdictBanner({ verdict, acknowledged = false, onAcknowledge }) {
  if (!verdict || verdict.level === 'OK' || !verdict.sentence) return null;
  const style = STYLES[verdict.level];
  if (!style) return null;
  const { Icon } = style;
  const values = verdict.evidence?.values || {};
  const monoEntries = Object.entries(values).filter(([, v]) => typeof v === 'string');

  return (
    <div className={`flex items-start gap-2 p-3 rounded-lg border ${style.box}`}>
      <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${style.text}`} />
      <div className={`text-xs space-y-1.5 min-w-0 ${style.text}`}>
        <p className="font-medium">{verdict.sentence}</p>
        {monoEntries.length > 0 && (
          <div className="space-y-0.5">
            {monoEntries.map(([k, v]) => (
              <div key={k} className="flex gap-2 min-w-0">
                <span className="uppercase tracking-wide opacity-70 text-[10px] shrink-0">{k}</span>
                <span className="mono-value truncate" title={v}>{truncMiddle(v)}</span>
              </div>
            ))}
          </div>
        )}
        {verdict.requiresConfirmation && (
          <label className="flex items-start gap-2 cursor-pointer pt-0.5">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={acknowledged}
              onChange={(e) => onAcknowledge?.(e.target.checked)}
            />
            <span>I understand the risk and want to sign anyway.</span>
          </label>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Lint the new file**

Run: `npx eslint src/components/RiskVerdictBanner.jsx`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/RiskVerdictBanner.jsx
git commit -m "feat(risk): RiskVerdictBanner — one-sentence composite verdict (design system)"
```

---

## Task 4: Wire into `SendCrypto.jsx`

**Files:**
- Modify: `src/pages/SendCrypto.jsx`

- [ ] **Step 1: Add imports**

After the existing import line `import { describeErc20Call } from "@/wallet-core/evm/calldata";` (and the nearby risk-adjacent imports), add:

```js
import RiskVerdictBanner from "@/components/RiskVerdictBanner";
import { score, buildRiskInputs } from "@/risk";
```

- [ ] **Step 2: Add the calldata + verdict memos and the ack state**

Immediately AFTER the existing `tokenCalldata` `useMemo` block (the one ending `}, [isErc20, selectedAsset, toAddress, amount]);`), insert:

```jsx
  // Raw calldata for the risk scorer (S2/S3/S7 read tx.data). Distinct from
  // tokenCalldata above, which is the human-readable DECODE. Native sends have no
  // calldata. Cheap + local; recomputed with the same inputs as the decode.
  const riskCalldata = useMemo(() => {
    if (!isErc20 || !toAddress || !amount || parseFloat(amount) <= 0) return null;
    try {
      return buildTokenTransfer({ networkKey, symbol: selectedAsset.symbol, to: toAddress, amount }).data;
    } catch {
      return null;
    }
  }, [isErc20, selectedAsset, toAddress, amount, networkKey]);

  // PRE-SIGN RISK SCORE (src/risk) — the authoritative one-sentence verdict + the
  // RISK gate. Pure + local: maps the SAME local state the existing warnings read
  // into score()'s inputs (no new fetch, no signer/seed). recipientCode (S7) is
  // reused from the simulation's already-fetched eth_getCode (I2). In DEMO there
  // is no live RPC, so recipients are treated as EOAs ('0x'): the verdict is a
  // real computation over the entered inputs; only the chain fact behind S7 is
  // demo-seeded. We wait for the simulation to settle (data or error) before
  // judging so S7 doesn't flash a transient fail-closed CAUTION while it loads.
  const riskReady = DEMO || !!txSim.data || txSim.isError;
  const riskVerdict = useMemo(() => {
    if (!toAddress || !addressFormatValid || !(isEvmFamily(selectedAsset) || isErc20)) return null;
    if (!riskReady) return null;
    const recipientCode = DEMO ? '0x' : txSim.data?.recipientCode;
    const { unsignedTx, activeSetLocalState, chainData } = buildRiskInputs({
      to: toAddress,
      amountText: amount,
      isErc20,
      calldata: riskCalldata,
      displayedEns: ensResolved?.name ?? null,
      ensResolvedAddress: ensResolved?.address ?? null,
      chainId: activeNetwork?.chainId,
      assetCurrency: selectedWallet?.currency,
      history,
      knownAddresses,
      whitelist,
      recipientCode,
    });
    return score(unsignedTx, activeSetLocalState, chainData);
  }, [toAddress, addressFormatValid, selectedAsset, isErc20, riskCalldata, ensResolved, activeNetwork, selectedWallet, history, knownAddresses, whitelist, riskReady, txSim.data]);

  // RISK acknowledgement ("Sign anyway"). Reset whenever the breach could change —
  // amount, asset, or recipient — so a stale ack never carries into a changed send
  // (same freshness discipline as limitAck above).
  const [riskAck, setRiskAck] = useState(false);
  useEffect(() => { setRiskAck(false); }, [amount, selectedWallet?.currency, toAddress]);
  const blockedByRisk = !!riskVerdict?.requiresConfirmation && !riskAck;
```

- [ ] **Step 3: Add the sign-time hard re-check in the mutation**

In `sendTx`'s `mutationFn`, immediately AFTER the spend-limit gate block (the `if (limitGate.blocked && !limitAck) { ... }` block) and BEFORE `// Map the selected wallet to its HD derivation index`, insert:

```jsx
      // HARD pre-sign RISK gate (defense-in-depth). The verify buttons are already
      // disabled on an unacknowledged RISK, but re-evaluate at signing time so a
      // RISK composite can never be bypassed by stale UI — mirroring the spend-limit
      // re-check above. Fail closed: if scoring itself throws, do NOT sign.
      let riskGate;
      try {
        const recipientCode = DEMO ? '0x' : txSim.data?.recipientCode;
        const inputs = buildRiskInputs({
          to: toAddress, amountText: amount, isErc20, calldata: riskCalldata,
          displayedEns: ensResolved?.name ?? null, ensResolvedAddress: ensResolved?.address ?? null,
          chainId: activeNetwork?.chainId, assetCurrency: selectedWallet.currency,
          history, knownAddresses, whitelist, recipientCode,
        });
        riskGate = score(inputs.unsignedTx, inputs.activeSetLocalState, inputs.chainData);
      } catch {
        throw new Error('Could not complete the pre-sign risk checks — not signing.');
      }
      if (riskGate.requiresConfirmation && !riskAck) {
        throw new Error('Confirm the risk warning before signing.');
      }
```

- [ ] **Step 4: Replace the repeated PoisonWarning at the verify step with the banner**

At the verify step, replace this block:

```jsx
            {/* Address-poisoning warning repeated at the point of signing. */}
            <PoisonWarning screen={poisonScreen} />
```

with:

```jsx
            {/* AUTHORITATIVE pre-sign verdict (src/risk composite). One sentence;
                RISK shows the "Sign anyway" destructive-confirm. Replaces the
                repeated poison box here — poisoning is now one of the signals it
                composes (the form-step PoisonWarning stays as early feedback). */}
            <RiskVerdictBanner verdict={riskVerdict} acknowledged={riskAck} onAcknowledge={setRiskAck} />
```

- [ ] **Step 5: Gate the verify buttons on `blockedByRisk`**

Make these three edits in the verify step:

1. The passkey button — change `disabled={blockedByApproval}` to:
```jsx
                  <Button className="w-full gap-2" disabled={blockedByApproval || blockedByRisk} onClick={() => { setTwoFAMethod("passkey"); verifyPasskey(); }}>
```

2. The "Send Email OTP" button — change `disabled={!EMAIL_AVAILABLE || blockedByApproval}` to:
```jsx
                <Button variant="outline" className="w-full gap-2" disabled={!EMAIL_AVAILABLE || blockedByApproval || blockedByRisk} onClick={() => { setTwoFAMethod("otp"); sendOTP(); }}>
```

3. The "Verify & Send" OTP button — change `disabled={otpCode.length !== 6 || sendTx.isPending || blockedByApproval}` to:
```jsx
                      disabled={otpCode.length !== 6 || sendTx.isPending || blockedByApproval || blockedByRisk}
```

- [ ] **Step 6: Lint + typecheck the file**

Run: `npx eslint src/pages/SendCrypto.jsx`
Expected: no errors (no unused vars; `score`, `buildRiskInputs`, `RiskVerdictBanner`, `riskVerdict`, `blockedByRisk`, `riskAck` all used).

- [ ] **Step 7: Commit**

```bash
git add src/pages/SendCrypto.jsx
git commit -m "feat(send): wire risk score() as authoritative pre-sign verdict + RISK gate"
```

---

## Task 5: Full verification + manual smoke

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite (incl. RNG tripwire)**

Run: `npm test`
Expected: PASS — the `pretest` RNG check passes, then all Vitest suites green (risk suite now 11 files; simulate suite unchanged-green).

- [ ] **Step 2: Lint the whole project**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Production build (confirms imports resolve + tree-shake)**

Run: `npm run build`
Expected: build succeeds (the risk module is now intentionally pulled into the SendCrypto chunk).

- [ ] **Step 4: Manual smoke in demo (design-system states)**

Run: `npm run dev`, open `http://localhost:5173/?demo=1`, go to **Send Crypto**, pick the ETH wallet, enter an amount, then click **Continue** to reach the verify step. Confirm each state:

- **RISK (poisoning):** on the form step, click "Demo: paste a look-alike address" → Continue. The verify step shows a **coral** `RiskVerdictBanner` with one sentence and the "I understand the risk and want to sign anyway." checkbox. The passkey/OTP buttons are **disabled** until the box is ticked.
- **INFO (fresh recipient):** enter a brand-new plain `0x…` address you haven't used → Continue. Banner is a calm **blue** INFO chip (fresh recipient), no checkbox, buttons enabled.
- **No banner:** (only reproducible once an address is in history — acceptable to skip in demo). Confirm the banner simply renders nothing on OK.
- Confirm the `TransactionPreview` (balance changes / decoded call) still renders **below** the banner, unchanged.

- [ ] **Step 5: Confirm honesty accounting (no status change)**

Verify NOTHING flipped an asset to `live` or wrote "verified": this PR is **BUILT** wiring only. `docs/risk-verification-plan-sepolia.md` stays at 0-of-8; the module stays UNAUDITED-PROVISIONAL. No code change to `src/risk/score.js` or the 8 signal files.

- [ ] **Step 6: Final commit (if any smoke fixups were needed)**

```bash
git add -A
git commit -m "test: verify risk-score send-flow wiring (suite green, lint clean, build ok)"
```

(Skip if Steps 1–5 required no changes.)

---

## Self-review notes

- **Spec coverage:** §2 architecture → Tasks 1–4; §3 state mapping → Task 2 (`buildRiskInputs` + tests); §4 gating/UX → Task 4 (banner swap, button gating, freshness, sign-time re-check) + Task 3 (banner); §5 demo → Task 4 Steps 2/3 (`DEMO ? '0x'`) + Task 5 Step 4 smoke; §6 testing/error handling → Tasks 2 & 5; §7 status → Task 5 Step 5; §8 order → Tasks 1→5.
- **Type consistency:** `buildRiskInputs` param names (`amountText`, `assetCurrency`, `ensResolvedAddress`, `recipientCode`) are identical across the adapter, its tests, and both call sites in `SendCrypto`. `score()` is called positionally `(unsignedTx, activeSetLocalState, chainData)` everywhere, matching its signature in `src/risk/score.js`. Banner props (`verdict`, `acknowledged`, `onAcknowledge`) match between component and call site.
- **No placeholders:** every code step shows complete code; every run step has an exact command + expected result.
- **Known accepted interim:** `TransactionPreview`'s risk list still overlaps the banner at the verify step (per spec §4, decision 4) — not a defect, deferred to consolidation.
