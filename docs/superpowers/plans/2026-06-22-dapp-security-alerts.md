# dApp Security Alerts (inline, WalletConnect) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fire automatic, on-device security alerts when a user connects to or transacts with a dApp via WalletConnect — a known-bad domain alert at connect time, and risk-scoring (unlimited-approval / calldata-mismatch) on `eth_sendTransaction` requests — by wiring the existing local known-bad list and risk-signal engine into the live WalletConnect modals.

**Architecture:** Two new pure modules under `src/risk/` (a shared known-bad dApp list + check, and a WC-request → `score()` adapter), consumed by the two existing WalletConnect modals (`SessionProposalModal`, `RequestApprovalModal`). Connect-time uses a pure local domain check + acknowledge-to-proceed gate. Request-time reuses the tested `simulateEvmTransaction()` for `recipientCode`, feeds `score()`, and renders the existing `RiskVerdictBanner`. No backend, no new key access; everything fails closed.

**Tech Stack:** React 18, ethers v6, Vite, Vitest + @testing-library/react (jsdom), CSS Modules. Existing modules reused: `src/risk/score.js`, `src/risk/calldata.js`, `src/components/RiskVerdictBanner.jsx`, `src/wallet-core/evm/simulate.js`, `src/wallet-core/evm/networks.js`.

## Global Constraints

- **Honesty (no fake security):** never render a "safe to connect"/"verified"/green verdict. Only RISK/CAUTION/INFO or silence. Absence from the local known-bad list is NOT a safety verdict.
- **Fail honest, fail closed (I4):** all new pure functions are total (bad/missing input → omitted fields or `flagged:false`, never a throw). `score()` already escalates a throwing signal to CAUTION. An unknown `recipientCode` → S7 CAUTION. A RISK verdict gates Approve.
- **No silent egress / deniability (I1/I2/I3):** the domain check is pure-local (no network). Request-time scoring adds no egress class beyond the `simulateEvmTransaction()` the Send flow already runs. Rendered alert/verdict shape is identical for a real or decoy set.
- **Status:** ships **BUILT / UNAUDITED-PROVISIONAL** at most. Do NOT mark "verified" — that needs a real testnet WalletConnect interaction with an explorer txid the user supplies.
- **Corpus scope (this build):** `RequestApprovalModal` scores with calldata + `recipientCode` and an EMPTY corpus (`history/knownAddresses/whitelist = []`). S2 (unlimited approval) and S7 (calldata mismatch) need no corpus; corpus-dependent signals safely no-op to OK. The adapter still accepts corpus args for a later enrichment pass.
- **Tests:** this repo does NOT wire `@testing-library/jest-dom` — assert with core matchers (`toBeTruthy`/`toBeNull`/`toBe`). Run a single file with `npx vitest run <path>`.
- **Design system:** verifiable values (domains, addresses) in IBM Plex Mono; risk red is `#f85149` (matches `.permitWarning` in `RequestApprovalModal.module.css`). One sentence per alert; never a wall of warnings.

---

## File Structure

- `src/risk/knownBadDapps.js` (CREATE) — single source of truth for the local known-bad dApp list + `normalizeDomain()` / `checkDappDomain()`. Pure, local.
- `src/risk/__tests__/knownBadDapps.test.js` (CREATE) — unit tests for the above.
- `src/pages/DAppSecurityAlerts.jsx` (MODIFY) — refactor to import the list/check from `knownBadDapps.js` instead of defining them inline.
- `src/risk/fromWalletConnect.js` (CREATE) — pure adapter: WC `eth_sendTransaction` → `score()` inputs.
- `src/risk/__tests__/fromWalletConnect.test.js` (CREATE) — unit tests for the adapter, incl. `score()` integration on unlimited-approval calldata.
- `src/components/walletconnect/SessionProposalModal.jsx` (MODIFY) — connect-time known-bad alert + acknowledge gate.
- `src/components/walletconnect/SessionProposalModal.module.css` (MODIFY) — risk-alert styles.
- `src/components/walletconnect/__tests__/SessionProposalModal.test.jsx` (CREATE) — component test.
- `src/components/walletconnect/RequestApprovalModal.jsx` (MODIFY) — connected-dApp domain carry-through + `eth_sendTransaction` risk scoring + gate.
- `src/components/walletconnect/__tests__/RequestApprovalModal.test.jsx` (CREATE) — component tests.

---

## Task 1: Shared known-bad dApp module + page refactor

**Files:**
- Create: `src/risk/knownBadDapps.js`
- Test: `src/risk/__tests__/knownBadDapps.test.js`
- Modify: `src/pages/DAppSecurityAlerts.jsx`

**Interfaces:**
- Produces: `LOCAL_KNOWN_BAD: Array<{domain:string, reason:string}>`, `normalizeDomain(input:unknown) → string`, `checkDappDomain(url:unknown) → { domain:string, flagged:boolean, reason:string|null }`.

- [ ] **Step 1: Write the failing test**

Create `src/risk/__tests__/knownBadDapps.test.js`:

```js
// src/risk/__tests__/knownBadDapps.test.js
//
// knownBadDapps — the single local source of truth for the known-bad dApp list
// and the pure check over it. LOCAL-ONLY, total (never throws), never "safe".

import { describe, it, expect } from 'vitest';
import { LOCAL_KNOWN_BAD, normalizeDomain, checkDappDomain } from '../knownBadDapps.js';

describe('normalizeDomain', () => {
  it('strips scheme, www, path and lowercases', () => {
    expect(normalizeDomain('HTTPS://www.FakeSwap-Rewards.xyz/claim?a=1')).toBe('fakeswap-rewards.xyz');
  });
  it('is total: non-string and empty inputs yield empty string', () => {
    expect(normalizeDomain(undefined)).toBe('');
    expect(normalizeDomain(null)).toBe('');
    expect(normalizeDomain(42)).toBe('');
    expect(normalizeDomain('   ')).toBe('');
  });
});

describe('checkDappDomain', () => {
  it('flags a known-bad domain with its reason (scheme/path tolerant)', () => {
    const r = checkDappDomain('https://fakeswap-rewards.xyz/airdrop');
    expect(r.flagged).toBe(true);
    expect(r.domain).toBe('fakeswap-rewards.xyz');
    expect(typeof r.reason).toBe('string');
  });
  it('does NOT flag a domain absent from the local list, and returns no reason', () => {
    const r = checkDappDomain('https://app.uniswap.org');
    expect(r.flagged).toBe(false);
    expect(r.domain).toBe('app.uniswap.org');
    expect(r.reason).toBeNull();
  });
  it('is total: empty / non-string input is unflagged and never throws', () => {
    expect(() => checkDappDomain(undefined)).not.toThrow();
    expect(checkDappDomain(undefined)).toEqual({ domain: '', flagged: false, reason: null });
    expect(checkDappDomain('')).toEqual({ domain: '', flagged: false, reason: null });
  });
  it('every list entry is itself flagged (self-consistency)', () => {
    for (const b of LOCAL_KNOWN_BAD) {
      expect(checkDappDomain(b.domain).flagged).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/risk/__tests__/knownBadDapps.test.js`
Expected: FAIL — `Failed to resolve import "../knownBadDapps.js"`.

- [ ] **Step 3: Create the module**

Create `src/risk/knownBadDapps.js`:

```js
// src/risk/knownBadDapps.js
//
// Risk Scoring v1 — UNAUDITED-PROVISIONAL.
//
// The ONE local source of truth for the known-bad / phishing dApp domain list and
// the pure check over it. Mirrors wallet-core/evm/poison.js's LOCAL_FLAGGED
// pattern: LOCAL-ONLY (checking it leaks nothing off-device), illustrative and
// non-exhaustive, and it NEVER asserts a domain is "safe" — only that a domain is
// known bad. Intended to be hydrated from a real threat feed later and still stay
// local. No network, no keys, no React.

// Moved verbatim out of pages/DAppSecurityAlerts.jsx so the page and the
// WalletConnect connect/request flow share one list.
export const LOCAL_KNOWN_BAD = [
  { domain: 'fakeswap-rewards.xyz', reason: 'Known phishing / wallet-drainer domain' },
  { domain: 'airdrop-claim2024.io', reason: 'Known approval-drainer / fake airdrop' },
  { domain: 'uniswap-app.org', reason: 'Look-alike of uniswap.org (typosquat)' },
  { domain: 'metamask-wallet.app', reason: 'Look-alike of metamask.io (credential phish)' },
];

const BAD_SET = new Map(LOCAL_KNOWN_BAD.map((b) => [b.domain.toLowerCase(), b]));

/**
 * Reduce an arbitrary URL/host input to a bare lowercase host: strips scheme,
 * a leading www., any path/query, and surrounding whitespace. Total: a non-string
 * or empty input yields ''.
 * @param {unknown} input
 * @returns {string}
 */
export function normalizeDomain(input) {
  if (typeof input !== 'string') return '';
  return input
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0];
}

/**
 * Check a dApp URL/domain against the LOCAL known-bad list. Pure + total: never
 * throws, never makes a network call, and never returns a "safe" verdict —
 * absence from the list is reported as flagged:false, which the caller must NOT
 * present as a safety guarantee.
 *
 * @param {unknown} url
 * @returns {{ domain: string, flagged: boolean, reason: string|null }}
 */
export function checkDappDomain(url) {
  const domain = normalizeDomain(url);
  if (!domain) return { domain: '', flagged: false, reason: null };
  const hit = BAD_SET.get(domain);
  return hit
    ? { domain, flagged: true, reason: hit.reason }
    : { domain, flagged: false, reason: null };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/risk/__tests__/knownBadDapps.test.js`
Expected: PASS (all assertions).

- [ ] **Step 5: Refactor `DAppSecurityAlerts.jsx` to consume the shared module**

In `src/pages/DAppSecurityAlerts.jsx`:

(a) Add the import after the existing UI imports (below the `Badge` import line):

```jsx
import { LOCAL_KNOWN_BAD, checkDappDomain } from "@/risk/knownBadDapps.js";
```

(b) DELETE the now-duplicated local definitions — the `LOCAL_KNOWN_BAD` array, the `BAD_SET` line, and the `normalizeDomain` function (the block that currently spans from `const LOCAL_KNOWN_BAD = [` through the end of the `normalizeDomain` function, just above `export default function DAppSecurityAlerts()`).

(c) Replace the body of `handleCheck` with the shared check:

```jsx
  const handleCheck = () => {
    if (!url.trim()) return;
    const { domain, flagged, reason } = checkDappDomain(url);
    setResult(flagged ? { domain, flagged: true, reason } : { domain, flagged: false });
  };
```

(The list-rendering `LOCAL_KNOWN_BAD.map(...)` further down now reads the imported constant — no change needed there.)

- [ ] **Step 6: Verify the refactor compiles and nothing regressed**

Run: `npx vitest run src/risk/__tests__/knownBadDapps.test.js && npm run lint`
Expected: tests PASS; lint reports no errors for `src/risk/knownBadDapps.js` or `src/pages/DAppSecurityAlerts.jsx`.

- [ ] **Step 7: Commit**

```bash
git add src/risk/knownBadDapps.js src/risk/__tests__/knownBadDapps.test.js src/pages/DAppSecurityAlerts.jsx
git commit -m "$(cat <<'EOF'
feat(risk): shared local known-bad dApp module + page refactor

Extract the known-bad list and check into one pure source of truth so the
WalletConnect flow and the existing checker page share it.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: WalletConnect request → risk-inputs adapter

**Files:**
- Create: `src/risk/fromWalletConnect.js`
- Test: `src/risk/__tests__/fromWalletConnect.test.js`

**Interfaces:**
- Consumes: `score` from `src/risk/score.js`, `LEVEL` from `src/risk/levels.js` (tests only).
- Produces: `buildRiskInputsFromWcRequest({ txParam, chainId, history, knownAddresses, whitelist, recipientCode }) → { unsignedTx, activeSetLocalState, chainData }`.

- [ ] **Step 1: Write the failing test**

Create `src/risk/__tests__/fromWalletConnect.test.js`:

```js
// src/risk/__tests__/fromWalletConnect.test.js
//
// buildRiskInputsFromWcRequest — pure adapter mapping a WalletConnect
// eth_sendTransaction request to score()'s three inputs. No network, no signer.
// Total: bad/missing input yields omitted fields so signals fail closed.

import { describe, it, expect } from 'vitest';
import { buildRiskInputsFromWcRequest } from '../fromWalletConnect.js';
import { score } from '../score.js';
import { LEVEL } from '../levels.js';

const TO = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const A  = '0xa11ce1234567890abcdef1234567890abcc0ffee';

// approve(spender=...dead, value=MaxUint256) — the canonical unlimited-approval
// drainer calldata S2 must flag.
const APPROVE_UNLIMITED =
  '0x095ea7b3' +
  '000000000000000000000000000000000000000000000000000000000000dead' +
  'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

describe('buildRiskInputsFromWcRequest — unsignedTx mapping', () => {
  it('maps to/value/data/chainId from the WC tx param', () => {
    const { unsignedTx } = buildRiskInputsFromWcRequest({
      txParam: { to: TO, value: '0x16345785d8a0000', data: '0xabcd' }, // 0.1 ETH in wei
      chainId: 11155111,
    });
    expect(unsignedTx.to).toBe(TO);
    expect(unsignedTx.value).toBe(100000000000000000n);
    expect(unsignedTx.data).toBe('0xabcd');
    expect(unsignedTx.chainId).toBe(11155111);
    expect(unsignedTx.inputs).toBeUndefined();
    expect(unsignedTx.displayedEns).toBeNull();
  });

  it('missing data defaults to 0x; unparseable value -> undefined (S8 fails closed)', () => {
    const { unsignedTx } = buildRiskInputsFromWcRequest({ txParam: { to: TO, value: 'oops' } });
    expect(unsignedTx.data).toBe('0x');
    expect(unsignedTx.value).toBeUndefined();
  });
});

describe('buildRiskInputsFromWcRequest — chainData + corpus', () => {
  it('passes recipientCode through verbatim (undefined when absent)', () => {
    expect(buildRiskInputsFromWcRequest({ txParam: { to: TO }, recipientCode: '0x' }).chainData.recipientCode).toBe('0x');
    expect(buildRiskInputsFromWcRequest({ txParam: { to: TO } }).chainData.recipientCode).toBeUndefined();
  });
  it('maps the (optional) corpus: knownAddresses->counterparties, whitelist->knownGoodSpenders, history->sendHistory', () => {
    const { activeSetLocalState } = buildRiskInputsFromWcRequest({
      txParam: { to: TO },
      knownAddresses: [{ address: A, label: 'x' }],
      whitelist: [{ address: TO, currency: 'ETH' }],
      history: [{ type: 'send', to_address: TO }],
    });
    expect(activeSetLocalState.counterparties).toEqual([{ address: A, label: 'x' }]);
    expect(activeSetLocalState.knownGoodSpenders).toEqual([{ address: TO, currency: 'ETH' }]);
    expect(activeSetLocalState.sendHistory).toEqual([{ to: TO }]);
  });
});

describe('buildRiskInputsFromWcRequest — totality', () => {
  it('never throws on empty input and returns the three input objects', () => {
    expect(() => buildRiskInputsFromWcRequest()).not.toThrow();
    const r = buildRiskInputsFromWcRequest();
    expect(r.unsignedTx).toBeTruthy();
    expect(r.activeSetLocalState).toBeTruthy();
    expect(r.chainData).toBeTruthy();
  });
});

describe('buildRiskInputsFromWcRequest — integrates with score()', () => {
  it('unlimited-approval calldata yields a RISK verdict requiring confirmation, on an EMPTY corpus', () => {
    const inputs = buildRiskInputsFromWcRequest({
      txParam: { to: TO, value: '0x0', data: APPROVE_UNLIMITED },
      chainId: 11155111,
      recipientCode: '0x6080', // a contract, so S7 stays OK
    });
    const verdict = score(inputs.unsignedTx, inputs.activeSetLocalState, inputs.chainData);
    expect(verdict.level).toBe(LEVEL.RISK);
    expect(verdict.requiresConfirmation).toBe(true);
    expect(verdict.signalId).toBe('S2');
  });

  it('a plain native transfer with a contract recipient is not RISK', () => {
    const inputs = buildRiskInputsFromWcRequest({
      txParam: { to: TO, value: '0x16345785d8a0000', data: '0x' },
      chainId: 11155111,
      recipientCode: '0x', // EOA
    });
    const verdict = score(inputs.unsignedTx, inputs.activeSetLocalState, inputs.chainData);
    expect(verdict.requiresConfirmation).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/risk/__tests__/fromWalletConnect.test.js`
Expected: FAIL — `Failed to resolve import "../fromWalletConnect.js"`.

- [ ] **Step 3: Create the adapter**

Create `src/risk/fromWalletConnect.js`:

```js
// src/risk/fromWalletConnect.js
//
// Risk Scoring v1 — UNAUDITED-PROVISIONAL.
//
// Pure adapter: maps a WalletConnect eth_sendTransaction request to the three
// inputs score() expects — (unsignedTx, activeSetLocalState, chainData). NO
// network, NO signer, NO seed. Sibling of fromSendState.js; same totality
// contract (bad/missing input -> omitted fields so signals fail closed, never a
// throw).
//
// Corpus scope: the dApp-relevant signals (S2 unlimited approval, S7 calldata
// mismatch) read only calldata + recipientCode and need no corpus. The corpus
// args (history -> S1, knownAddresses -> S4, whitelist -> S3) are accepted and
// mapped exactly as fromSendState maps them, so a later enrichment pass can
// supply them — but the WalletConnect modal passes them empty in this build. S5
// (ENS) and S8 (native-send baseline) have no source on a dApp tx and stay inert.

/**
 * Parse a WC value field (hex string / number / bigint, in wei) to a bigint, or
 * undefined when it is absent/unparseable (S8 then fails closed rather than
 * misreading 0).
 * @param {unknown} v
 * @returns {bigint|undefined}
 */
function toWeiOrUndefined(v) {
  if (v == null || v === '') return undefined;
  try {
    return BigInt(v);
  } catch {
    return undefined;
  }
}

/**
 * @param {object} p
 * @param {object} [p.txParam]           WC reqParams[0]: { to, value, data, ... }
 * @param {number} [p.chainId]
 * @param {Array}  [p.history]           Transaction records (S1); empty in this build
 * @param {Array}  [p.knownAddresses]    interacted-with corpus (S4); empty in this build
 * @param {Array}  [p.whitelist]         known-good spenders (S3); empty in this build
 * @param {string|null|undefined} [p.recipientCode] eth_getCode(to) hex (S7); undefined => CAUTION
 * @returns {{ unsignedTx: object, activeSetLocalState: object, chainData: object }}
 */
export function buildRiskInputsFromWcRequest({
  txParam = {},
  chainId,
  history = [],
  knownAddresses = [],
  whitelist = [],
  recipientCode,
} = {}) {
  const tx = txParam || {};

  const unsignedTx = {
    to: tx.to || undefined,
    value: toWeiOrUndefined(tx.value),
    data: tx.data || '0x',
    displayedEns: null,    // dApp tx: no ENS display step (S5 N/A)
    inputs: undefined,     // EVM: no UTXO inputs (S6 N/A)
    chainId,
  };

  // sendHistory (S1): this set's prior SENDS only — same shape as fromSendState.
  const sendHistory = (history || [])
    .filter((t) => t?.type === 'send' && t?.to_address)
    .map((t) => ({ to: t.to_address }));

  const activeSetLocalState = {
    sendHistory,                          // S1
    counterparties: knownAddresses || [], // S4
    knownGoodSpenders: whitelist || [],   // S3
    ensCache: {},                         // S5 (no displayed name on a dApp tx)
    dustInputs: [],                       // S6 (EVM N/A)
    priorSendValuesWei: [],               // S8 (no native-send baseline wired here)
  };

  // chainData (S7): pass recipientCode through verbatim. undefined => S7 fails
  // closed (INDETERMINATE -> CAUTION) per I4.
  const chainData = { recipientCode };

  return { unsignedTx, activeSetLocalState, chainData };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/risk/__tests__/fromWalletConnect.test.js`
Expected: PASS (all assertions, including the S2 integration verdict).

- [ ] **Step 5: Commit**

```bash
git add src/risk/fromWalletConnect.js src/risk/__tests__/fromWalletConnect.test.js
git commit -m "$(cat <<'EOF'
feat(risk): WalletConnect request -> score() input adapter

Pure sibling of fromSendState.js mapping an eth_sendTransaction request into
the risk engine's inputs; unlimited-approval calldata scores RISK on an empty
corpus.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Connect-time known-bad dApp alert (SessionProposalModal)

**Files:**
- Modify: `src/components/walletconnect/SessionProposalModal.jsx`
- Modify: `src/components/walletconnect/SessionProposalModal.module.css`
- Test: `src/components/walletconnect/__tests__/SessionProposalModal.test.jsx`

**Interfaces:**
- Consumes: `checkDappDomain` from `src/risk/knownBadDapps.js`.

- [ ] **Step 1: Write the failing test**

Create `src/components/walletconnect/__tests__/SessionProposalModal.test.jsx`:

```jsx
// src/components/walletconnect/__tests__/SessionProposalModal.test.jsx
//
// Connect-time alert: a known-bad dApp domain renders a RISK alert and gates
// Connect behind an acknowledgement; a clean domain makes no claim and leaves
// Connect enabled. (No jest-dom in this repo — core matchers only.)

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SessionProposalModal } from '@/components/walletconnect/SessionProposalModal.jsx';

vi.mock('@/lib/WalletConnectProvider.jsx', () => ({
  useWalletConnect: () => ({
    approveSession: vi.fn(),
    rejectSession: vi.fn(),
    evmAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  }),
}));

function makeProposal(url) {
  return {
    id: 1,
    params: {
      proposer: { metadata: { name: 'Test dApp', url } },
      requiredNamespaces: { eip155: { methods: ['eth_sendTransaction'], chains: ['eip155:11155111'] } },
    },
  };
}

describe('SessionProposalModal — known-bad dApp alert', () => {
  it('flags a known-bad domain and disables Connect until acknowledged', () => {
    render(<SessionProposalModal proposal={makeProposal('https://fakeswap-rewards.xyz')} onClose={vi.fn()} />);
    expect(screen.getByText(/known scam/i)).toBeTruthy();
    const connect = screen.getByRole('button', { name: /^connect$/i });
    expect(connect.disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(connect.disabled).toBe(false);
  });

  it('makes no scam claim for a domain absent from the local list and leaves Connect enabled', () => {
    render(<SessionProposalModal proposal={makeProposal('https://app.uniswap.org')} onClose={vi.fn()} />);
    expect(screen.queryByText(/known scam/i)).toBeNull();
    expect(screen.getByRole('button', { name: /^connect$/i }).disabled).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/walletconnect/__tests__/SessionProposalModal.test.jsx`
Expected: FAIL — no element matching `/known scam/i` (alert not implemented yet).

- [ ] **Step 3: Add the risk-alert styles**

Append to `src/components/walletconnect/SessionProposalModal.module.css`:

```css
.riskAlert {
  background: rgba(248, 81, 73, 0.1);
  border: 1px solid rgba(248, 81, 73, 0.4);
  border-radius: 10px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.riskTitle { font-weight: 700; color: #f85149; margin: 0; font-size: 0.95rem; }
.riskBody { color: #f0f2f5; margin: 0; font-size: 0.85rem; line-height: 1.5; }
.riskDomain { font-family: 'IBM Plex Mono', monospace; color: #f85149; margin: 0; font-size: 0.85rem; word-break: break-all; }
.riskCheck { display: flex; gap: 8px; align-items: flex-start; font-size: 0.85rem; color: #f0f2f5; cursor: pointer; }
```

- [ ] **Step 4: Wire the alert + gate into the modal**

In `src/components/walletconnect/SessionProposalModal.jsx`:

(a) Add the import below the existing `useState` import line:

```jsx
import { checkDappDomain } from '@/risk/knownBadDapps.js';
```

(b) Inside the component, after the `const chains = ...` line, add state + the check:

```jsx
  const [ackKnownBad, setAckKnownBad] = useState(false);
  const dapp = checkDappDomain(meta.url);
```

(c) Render the alert immediately after the `<h2 className={styles.title}>Connect to dApp?</h2>` line:

```jsx
        {dapp.flagged && (
          <div className={styles.riskAlert}>
            <p className={styles.riskTitle}>⚠ Known scam / phishing site</p>
            <p className={styles.riskBody}>{dapp.reason}</p>
            <p className={styles.riskDomain}>{dapp.domain}</p>
            <label className={styles.riskCheck}>
              <input
                type="checkbox"
                checked={ackKnownBad}
                onChange={(e) => setAckKnownBad(e.target.checked)}
              />
              I understand this is a known scam/phishing site and want to connect anyway.
            </label>
          </div>
        )}
```

(d) Change the Connect button's `disabled` to also gate on an unacknowledged known-bad domain:

```jsx
          <button className={styles.approveBtn} onClick={handleApprove} disabled={busy || (dapp.flagged && !ackKnownBad)}>
            {busy ? 'Connecting…' : 'Connect'}
          </button>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/components/walletconnect/__tests__/SessionProposalModal.test.jsx`
Expected: PASS (both cases).

- [ ] **Step 6: Lint**

Run: `npm run lint`
Expected: no errors for the modified modal/CSS or new test.

- [ ] **Step 7: Commit**

```bash
git add src/components/walletconnect/SessionProposalModal.jsx src/components/walletconnect/SessionProposalModal.module.css src/components/walletconnect/__tests__/SessionProposalModal.test.jsx
git commit -m "$(cat <<'EOF'
feat(walletconnect): known-bad dApp alert at connect time

Check the proposer domain against the local known-bad list; a hit shows a RISK
alert and gates Connect behind an explicit acknowledgement. No "safe" claim on
a clean domain.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Request-time connected-dApp domain carry-through (RequestApprovalModal)

**Files:**
- Modify: `src/components/walletconnect/RequestApprovalModal.jsx`
- Test: `src/components/walletconnect/__tests__/RequestApprovalModal.test.jsx`

**Interfaces:**
- Consumes: `checkDappDomain` from `src/risk/knownBadDapps.js`.

- [ ] **Step 1: Write the failing test**

Create `src/components/walletconnect/__tests__/RequestApprovalModal.test.jsx`:

```jsx
// src/components/walletconnect/__tests__/RequestApprovalModal.test.jsx
//
// Request-time alerts. Part A (this file, first describe): a known-bad connected
// dApp domain surfaces a RISK alert on every request. (No jest-dom — core matchers.)

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RequestApprovalModal } from '@/components/walletconnect/RequestApprovalModal.jsx';

vi.mock('@/lib/WalletConnectProvider.jsx', () => ({
  useWalletConnect: () => ({
    signPersonal: vi.fn(),
    signTypedData: vi.fn(),
    sendTransaction: vi.fn(),
    rejectRequest: vi.fn(),
    isSendReauthRequired: () => false,
    evmAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  }),
}));

function personalSignRequest(url) {
  return {
    topic: 't', id: 1, type: 'personal_sign', blocked: false, typedDataMeta: null,
    params: {
      request: { method: 'personal_sign', params: ['0x48656c6c6f'] }, // "Hello"
      proposer: { metadata: { name: 'Bad dApp', url } },
    },
  };
}

describe('RequestApprovalModal — connected known-bad dApp domain', () => {
  it('surfaces a RISK alert when the connected dApp domain is known-bad', () => {
    render(<RequestApprovalModal request={personalSignRequest('https://airdrop-claim2024.io')} onClose={vi.fn()} />);
    expect(screen.getByText(/known scam/i)).toBeTruthy();
  });

  it('shows no scam alert for a clean connected dApp domain', () => {
    render(<RequestApprovalModal request={personalSignRequest('https://app.example.org')} onClose={vi.fn()} />);
    expect(screen.queryByText(/known scam/i)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/walletconnect/__tests__/RequestApprovalModal.test.jsx`
Expected: FAIL — no `/known scam/i` element.

- [ ] **Step 3: Wire the domain carry-through alert**

In `src/components/walletconnect/RequestApprovalModal.jsx`:

(a) Add the import below the existing `REQUEST_TYPES` import:

```jsx
import { checkDappDomain } from '@/risk/knownBadDapps.js';
```

(b) After the existing `const sessionMeta = request.params?.proposer?.metadata ?? {};` line, add:

```jsx
  const dapp = checkDappDomain(sessionMeta.url);
```

(c) In the main (non-blocked) `return (...)`, render the alert immediately after the closing `</div>` of `<div className={styles.header}>…</div>`:

```jsx
        {dapp.flagged && (
          <div className={styles.permitWarning}>
            <p className={styles.permitTitle}>⚠ Known scam / phishing dApp</p>
            <p className={styles.permitBody}>
              {sessionMeta.name ?? 'This dApp'} ({dapp.domain}) is on Veyrnox’s local known-bad
              list: {dapp.reason}. Do not approve unless you are absolutely certain.
            </p>
          </div>
        )}
```

(The existing `.permitWarning`/`.permitTitle`/`.permitBody` classes already exist in `RequestApprovalModal.module.css`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/walletconnect/__tests__/RequestApprovalModal.test.jsx`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add src/components/walletconnect/RequestApprovalModal.jsx src/components/walletconnect/__tests__/RequestApprovalModal.test.jsx
git commit -m "$(cat <<'EOF'
feat(walletconnect): surface known-bad connected-dApp alert on requests

If the connected dApp's domain is on the local known-bad list, show a RISK
alert on every signing/approval request from it.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Request-time risk scoring of eth_sendTransaction (RequestApprovalModal)

**Files:**
- Modify: `src/components/walletconnect/RequestApprovalModal.jsx`
- Test: `src/components/walletconnect/__tests__/RequestApprovalModal.test.jsx` (extend the file from Task 4)

**Interfaces:**
- Consumes: `score` (`src/risk/score.js`), `buildRiskInputsFromWcRequest` (`src/risk/fromWalletConnect.js`), `RiskVerdictBanner` (default export, `src/components/RiskVerdictBanner.jsx`), `simulateEvmTransaction` (`src/wallet-core/evm/simulate.js`), `getNetworkByChainId` (`src/wallet-core/evm/networks.js`), `evmAddress` from `useWalletConnect()`.

- [ ] **Step 1: Write the failing test (append to the Task 4 file)**

Append to `src/components/walletconnect/__tests__/RequestApprovalModal.test.jsx`. First add these mocks at the TOP of the file, directly after the existing `vi.mock('@/lib/WalletConnectProvider.jsx', …)` block:

```jsx
// recipientCode comes from the tested simulation — mock it so no real RPC is hit.
vi.mock('@/wallet-core/evm/simulate.js', () => ({
  simulateEvmTransaction: vi.fn(async () => ({ recipientCode: '0x6080' })), // a contract
}));
vi.mock('@/wallet-core/evm/networks.js', () => ({
  getNetworkByChainId: () => ({ key: 'sepolia' }),
}));
```

Then append this `describe` block at the end of the file:

```jsx
// approve(spender=...dead, value=MaxUint256) — unlimited-approval drainer calldata.
const APPROVE_UNLIMITED =
  '0x095ea7b3' +
  '000000000000000000000000000000000000000000000000000000000000dead' +
  'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

function sendTxRequest(data) {
  return {
    topic: 't', id: 2, type: 'send_transaction', blocked: false, typedDataMeta: null,
    params: {
      chainId: 'eip155:11155111',
      request: {
        method: 'eth_sendTransaction',
        params: [{ to: '0x1111111111111111111111111111111111111111', value: '0x0', data }],
      },
      proposer: { metadata: { name: 'Some dApp', url: 'https://app.example.org' } },
    },
  };
}

describe('RequestApprovalModal — eth_sendTransaction risk scoring', () => {
  it('scores an unlimited approval as RISK and blocks Approve until both acknowledgements are checked', async () => {
    render(<RequestApprovalModal request={sendTxRequest(APPROVE_UNLIMITED)} onClose={vi.fn()} />);

    // The risk verdict resolves after the (mocked) simulation; its sentence appears.
    await screen.findByText(/unlimited spending/i);

    const approve = screen.getByRole('button', { name: /^approve$/i });
    expect(approve.disabled).toBe(true);

    // Two gates now: the existing broadcast ack + the RISK ack in the banner.
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes.length).toBe(2);
    boxes.forEach((b) => fireEvent.click(b));
    expect(approve.disabled).toBe(false);
  });
});
```

Also extend the import line at the top of the file to include `fireEvent`:

```jsx
import { render, screen, fireEvent } from '@testing-library/react';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/walletconnect/__tests__/RequestApprovalModal.test.jsx`
Expected: FAIL — `/unlimited spending/i` never appears (no scoring wired); the Task 4 cases still pass.

- [ ] **Step 3: Add imports + a chain-id helper**

In `src/components/walletconnect/RequestApprovalModal.jsx`:

(a) Change the React import (currently `import { useState } from 'react';`) to add `useEffect`:

```jsx
import { useEffect, useState } from 'react';
```

(b) Add these imports below the `checkDappDomain` import from Task 4:

```jsx
import { score } from '@/risk/score.js';
import { buildRiskInputsFromWcRequest } from '@/risk/fromWalletConnect.js';
import RiskVerdictBanner from '@/components/RiskVerdictBanner.jsx';
import { simulateEvmTransaction } from '@/wallet-core/evm/simulate.js';
import { getNetworkByChainId } from '@/wallet-core/evm/networks.js';
```

(c) Add this module-scope helper just below the imports (above `export function RequestApprovalModal`):

```jsx
// "eip155:11155111" -> 11155111. Returns NaN for anything unparseable.
function parseWcChainId(caip2) {
  if (typeof caip2 !== 'string') return NaN;
  return parseInt(caip2.replace(/^eip155:/, ''), 10);
}
```

- [ ] **Step 4: Add scoring state + effect**

In the component body, after `const dapp = checkDappDomain(sessionMeta.url);` (Task 4), add:

```jsx
  const [riskVerdict, setRiskVerdict] = useState(null);
  const [codePending, setCodePending] = useState(false);
  const [riskAck, setRiskAck] = useState(false);

  // eth_sendTransaction risk scoring. Fetch recipientCode via the SAME simulation
  // the Send flow runs, feed score(), and render the verdict. Fail closed: any
  // simulation error -> recipientCode undefined -> S7 CAUTION; a throwing score()
  // -> a blocking RISK verdict. Corpus is empty in this build (S2/S7 need none).
  useEffect(() => {
    if (type !== REQUEST_TYPES.SEND_TRANSACTION) return undefined;
    const txParam = reqParams?.[0] || {};
    const chainId = parseWcChainId(params.chainId);
    let cancelled = false;
    setCodePending(true);
    setRiskVerdict(null);
    (async () => {
      let recipientCode;
      try {
        const net = getNetworkByChainId(chainId);
        if (net?.key && txParam.to) {
          const sim = await simulateEvmTransaction({
            networkKey: net.key,
            from: evmAddress,
            to: txParam.to,
            valueWei: txParam.value ? BigInt(txParam.value) : 0n,
            data: txParam.data ?? '0x',
          });
          recipientCode = sim?.recipientCode ?? undefined;
        }
      } catch {
        recipientCode = undefined; // fail closed -> S7 CAUTION
      }
      if (cancelled) return;
      const inputs = buildRiskInputsFromWcRequest({ txParam, chainId, recipientCode });
      let verdict;
      try {
        verdict = score(inputs.unsignedTx, inputs.activeSetLocalState, inputs.chainData);
      } catch {
        // score() should never throw (it catches its signals), but if it does we
        // must not read "safe" — synthesize a blocking RISK verdict.
        verdict = {
          level: 'RISK',
          sentence: 'A risk check could not complete. Treat this request as unsafe.',
          evidence: null,
          signalId: null,
          requiresConfirmation: true,
          signals: [],
        };
      }
      setRiskVerdict(verdict);
      setCodePending(false);
    })();
    return () => { cancelled = true; };
  }, [type, reqParams, params.chainId, evmAddress]);
```

Note: add `evmAddress` to the `useWalletConnect()` destructure at the top of the component (it currently destructures `signPersonal, signTypedData, sendTransaction, rejectRequest, isSendReauthRequired`):

```jsx
  const { signPersonal, signTypedData, sendTransaction, rejectRequest, isSendReauthRequired, evmAddress } = useWalletConnect();
```

- [ ] **Step 5: Fold the risk gate into `approveBlocked`**

Replace the existing `approveBlocked` definition with one that also blocks while the code-fetch is pending and while a RISK verdict is unacknowledged:

```jsx
  const riskBlocks =
    type === REQUEST_TYPES.SEND_TRANSACTION &&
    (codePending || (riskVerdict?.requiresConfirmation && !riskAck));

  const approveBlocked =
    needsReauth ||
    (isAssetAuth && !permitAcknowledged) ||
    (type === REQUEST_TYPES.SEND_TRANSACTION && !txAcknowledged) ||
    type === REQUEST_TYPES.UNKNOWN ||
    riskBlocks;
```

- [ ] **Step 6: Render the verdict banner in the SEND_TRANSACTION block**

Inside the `{type === REQUEST_TYPES.SEND_TRANSACTION && (…)}` block, add the banner immediately after the existing broadcast `permitWarning` `</div>` (i.e. after the `<label className={styles.permitCheck}>…</label></div>` that holds the "I understand this will send a real transaction" checkbox), still inside the fragment:

```jsx
            <RiskVerdictBanner
              verdict={riskVerdict}
              pending={codePending}
              acknowledged={riskAck}
              onAcknowledge={setRiskAck}
            />
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/components/walletconnect/__tests__/RequestApprovalModal.test.jsx`
Expected: PASS — all of Task 4's cases plus the new scoring case (unlimited-approval sentence appears, Approve unlocks only after both checkboxes are ticked).

- [ ] **Step 8: Lint**

Run: `npm run lint`
Expected: no errors for `RequestApprovalModal.jsx` or the test (in particular, the `useEffect` dependency array is satisfied).

- [ ] **Step 9: Commit**

```bash
git add src/components/walletconnect/RequestApprovalModal.jsx src/components/walletconnect/__tests__/RequestApprovalModal.test.jsx
git commit -m "$(cat <<'EOF'
feat(walletconnect): risk-score eth_sendTransaction requests

Reuse simulate() for recipientCode, run the risk engine, and render the
authoritative RiskVerdictBanner with an acknowledge-on-RISK gate — closing the
gap where dApp transactions got no risk scoring. Catches unlimited-approval and
calldata-mismatch drainers. Fails closed.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Full-suite verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: the suite passes (this also runs the `pretest` RNG tripwire + wallet-core typecheck). New files covered: `knownBadDapps`, `fromWalletConnect`, `SessionProposalModal`, `RequestApprovalModal`.

- [ ] **Step 2: Typecheck the app project**

Run: `npm run typecheck`
Expected: no new type errors introduced by the new `src/risk/*.js` files or the modal edits.

- [ ] **Step 3: Lint the whole project**

Run: `npm run lint`
Expected: clean (no errors).

- [ ] **Step 4: Honesty self-check (manual, no code)**

Confirm by reading the diff: no string anywhere claims a dApp is "safe"/"verified"/"trusted"; the connect-time and request-time alerts only ever say "known scam/phishing" or render a RISK/CAUTION/INFO verdict; and the asset/feature status was NOT flipped to `live`/`verified` (this is BUILT/UNAUDITED-PROVISIONAL until a real testnet WalletConnect interaction is confirmed with an explorer txid the user supplies).

---

## Self-Review (completed during planning)

**Spec coverage:**
- Shared known-bad module (spec §1) → Task 1. ✅
- WC risk-inputs adapter (spec §2) → Task 2. ✅
- Connect-time alert (spec §3) → Task 3. ✅
- Request-time domain carry-through (spec §4a) → Task 4. ✅
- Request-time eth_sendTransaction scoring (spec §4b) → Task 5. ✅
- Honesty/invariants + testing (spec §4–§5) → Global Constraints + Task 6 step 4. ✅
- Out-of-scope items (feed, remote feed, personal_sign scoring, corpus enrichment, dApp browser) → intentionally NOT planned. ✅

**Placeholder scan:** none — every step has concrete code or an exact command.

**Type/name consistency:** `checkDappDomain` / `normalizeDomain` / `LOCAL_KNOWN_BAD` (Task 1) used identically in Tasks 3–4; `buildRiskInputsFromWcRequest` signature (Task 2) matches its call in Task 5; `RiskVerdictBanner` props (`verdict`/`pending`/`acknowledged`/`onAcknowledge`) match the component's real API; `score()` 3-arg shape matches `src/risk/score.js`; `simulateEvmTransaction({networkKey,from,to,valueWei,data})` matches `src/wallet-core/evm/simulate.js`.
