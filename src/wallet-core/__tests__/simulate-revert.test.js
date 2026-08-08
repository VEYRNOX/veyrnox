// wallet-core/__tests__/simulate-revert.test.js
//
// The eth_call dry-run has THREE outcomes and they must not be collapsed into
// two. `provider.call()` rejects both when the node executed the call and it
// REVERTED (ethers v6 raises CALL_EXCEPTION, carrying the revert reason) and
// when we never got an answer at all (timeout / network / bad RPC). Those mean
// opposite things to a user about to sign:
//
//   reverted        → we KNOW signing wastes gas          → high, willRevert
//   did not answer  → we know NOTHING about the outcome   → info, degraded
//   fulfilled       → dry-run ran, no revert              → simulated, clean
//
// History here, both directions:
//   - Originally EVERY rejection set willRevert = true, so an RPC timeout was
//     reported as a confident "this transaction will FAIL" (a fabricated
//     verdict — the fix that #1588 was written to make).
//   - #1588 then routed every rejection to `simulationFailed` instead, which
//     left `willRevert` with no assignment anywhere in the file: permanently
//     false, its `else if` branch unreachable, and the "predicted to FAIL"
//     banner in TransactionPreview dead. A real revert degraded from `high` to
//     `info`. No test asserted willRevert === true, so nothing went red.
//
// These tests pin all three outcomes so neither collapse can return.
//
// The provider is mocked: this file makes NO network calls.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const callMock = vi.fn();
const getCodeMock = vi.fn();
const getBalanceMock = vi.fn();

vi.mock('../evm/provider.js', () => ({
  getProvider: () => ({
    call: (...a) => callMock(...a),
    getCode: (...a) => getCodeMock(...a),
    getBalance: (...a) => getBalanceMock(...a),
  }),
}));

vi.mock('../deniabilitySession.js', async (orig) => ({
  ...(await orig()),
  isDeniabilitySessionActive: () => false,
}));

const { simulateEvmTransaction } = await import('../evm/simulate.js');

const FROM = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const TO   = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';

/**
 * Shape ethers v6 raises when the node EXECUTED the call and it reverted:
 * revert data comes back (here the ABI encoding of Error(string)) and ethers
 * decodes `reason` from it.
 */
function callException(reason) {
  return Object.assign(new Error(`execution reverted: ${reason}`), {
    code: 'CALL_EXCEPTION',
    reason,
    data: '0x08c379a0' + '00'.repeat(28),
    shortMessage: `execution reverted: ${reason}`,
  });
}

/**
 * Shape ethers v6 raises when the RPC never answered — SAME `code`, which is
 * why the code alone cannot be the discriminator. `data` is null and there is
 * no reason. Captured from a real dead endpoint, not invented: gating on
 * `code === 'CALL_EXCEPTION'` alone classifies this as a revert and
 * reintroduces the fabricated-verdict bug #1588 fixed.
 */
function missingRevertData() {
  return Object.assign(new Error('missing revert data (action="call", data=null, reason=null)'), {
    code: 'CALL_EXCEPTION',
    reason: null,
    data: null,
    shortMessage: 'missing revert data',
  });
}

const sim = () => simulateEvmTransaction({
  networkKey: 'sepolia', from: FROM, to: TO, valueWei: 1n,
});

beforeEach(() => {
  vi.clearAllMocks();
  getCodeMock.mockResolvedValue('0x');
  getBalanceMock.mockResolvedValue(10n ** 18n);
});

describe('simulateEvmTransaction — eth_call outcome is three-valued', () => {
  it('a REVERT is reported as willRevert with a high-severity risk', async () => {
    callMock.mockRejectedValue(callException('ERC20: transfer amount exceeds balance'));

    const r = await sim();

    // The dry-run RAN and produced a definitive answer — that is a simulation.
    expect(r.simulated).toBe(true);
    expect(r.willRevert).toBe(true);
    expect(r.degraded).toBeFalsy();
    expect(r.revertReason).toMatch(/exceeds balance/);

    const risk = r.risks.find((x) => x.code === 'will_revert');
    expect(risk).toBeTruthy();
    expect(risk.level).toBe('high');
    // Leads the list — a predicted failure is the most actionable single fact.
    expect(r.risks[0].code).toBe('will_revert');
    // And it must NOT be mistaken for "we couldn't check".
    expect(r.risks.find((x) => x.code === 'simulation_unavailable')).toBeFalsy();
  });

  it('a TIMEOUT is reported as degraded, never as a revert', async () => {
    callMock.mockRejectedValue(new Error('rpc-timeout'));

    const r = await sim();

    expect(r.simulated).toBe(false);
    expect(r.willRevert).toBe(false);   // I4: do not fabricate a verdict
    expect(r.degraded).toBe(true);

    const risk = r.risks.find((x) => x.code === 'simulation_unavailable');
    expect(risk).toBeTruthy();
    // `medium`, deliberately raised from `info`: at `info` this rendered in the
    // panel's dimmest style, and TransactionPreview lists info notes BELOW the
    // no-known-risks summary. "We could not check this" is a caution.
    expect(risk.level).toBe('medium');
    // And it must not carry raw transport error text into user-facing copy.
    expect(risk.detail).not.toMatch(/rpc-timeout/);
    expect(r.revertReason).toBeNull();   // nothing reverted, so no revert reason
    expect(r.risks.find((x) => x.code === 'will_revert')).toBeFalsy();
  });

  it('a NETWORK error is degraded, not a revert (no CALL_EXCEPTION code)', async () => {
    callMock.mockRejectedValue(Object.assign(new Error('could not detect network'), {
      code: 'NETWORK_ERROR',
    }));

    const r = await sim();

    expect(r.simulated).toBe(false);
    expect(r.willRevert).toBe(false);
    expect(r.degraded).toBe(true);
    expect(r.risks.find((x) => x.code === 'simulation_unavailable')).toBeTruthy();
  });

  it('CALL_EXCEPTION with NO revert data is degraded, not a revert', async () => {
    // The trap. An unreachable RPC raises CALL_EXCEPTION exactly like a revert
    // does, so a discriminator that reads only `code` reports "this transaction
    // will FAIL" for a node that never answered — the fabricated verdict #1588
    // removed. The node answering is what counts, and `data: null` means it did
    // not. This case must stay on the degraded side of the branch.
    callMock.mockRejectedValue(missingRevertData());

    const r = await sim();

    expect(r.willRevert).toBe(false);
    expect(r.simulated).toBe(false);
    expect(r.degraded).toBe(true);
    expect(r.risks.find((x) => x.code === 'will_revert')).toBeFalsy();
    expect(r.risks.find((x) => x.code === 'simulation_unavailable')).toBeTruthy();
  });

  it('a bare revert() with no reason string still counts as a revert', async () => {
    // The node answered — `data` is present but empty, and there is no decoded
    // reason. Ambiguity resolves toward "no verdict", but this is not ambiguous:
    // empty data is still data. Distinguishes `data: '0x'` from `data: null`.
    callMock.mockRejectedValue(Object.assign(new Error('execution reverted'), {
      code: 'CALL_EXCEPTION', reason: null, data: '0x', shortMessage: 'execution reverted',
    }));

    const r = await sim();

    expect(r.willRevert).toBe(true);
    expect(r.simulated).toBe(true);
    expect(r.degraded).toBeFalsy();
    expect(r.risks.find((x) => x.code === 'will_revert').level).toBe('high');
  });

  it('a SUCCESSFUL dry-run is simulated, not degraded, and flags no revert', async () => {
    callMock.mockResolvedValue('0x');

    const r = await sim();

    expect(r.simulated).toBe(true);
    expect(r.willRevert).toBe(false);
    expect(r.degraded).toBeFalsy();
    expect(r.risks.find((x) => x.code === 'will_revert')).toBeFalsy();
    expect(r.risks.find((x) => x.code === 'simulation_unavailable')).toBeFalsy();
    expect(r.source.queries).toContain('eth_call');
  });

  it('does not record eth_call as a query it completed when it did not', async () => {
    callMock.mockRejectedValue(new Error('rpc-timeout'));
    const r = await sim();
    // The source disclosure lists what we actually managed to read (I4).
    expect(r.source.queries).not.toContain('eth_call');
  });
});

describe('revertReason is untrusted RPC input, not a message we authored', () => {
  // simulate.js's own header names the threat 40 lines above the code:
  // a malicious RPC "can inject an inflammatory revertReason on a legitimate
  // one". React escapes markup, so this is not XSS — it is CONTENT injection
  // into `level: 'high'` copy on the screen where someone decides whether to
  // sign. Unbounded and unflattened, an endpoint can render arbitrary prose,
  // including instructions, in the app's own voice.
  //
  // This path was unreachable until #1597 restored the willRevert assignment,
  // so the exposure arrived with that fix rather than existing before it.

  it('caps an absurdly long reason instead of rendering all of it', async () => {
    callMock.mockRejectedValue(callException('A'.repeat(5000)));

    const r = await sim();

    expect(r.willRevert).toBe(true);
    expect(r.revertReason.length).toBeLessThanOrEqual(140);
    const risk = r.risks.find((x) => x.code === 'will_revert');
    expect(risk.detail.length).toBeLessThan(400);
  });

  it('flattens newlines so a provider cannot fake structure in the warning', async () => {
    callMock.mockRejectedValue(callException(
      'insufficient allowance\n\n\nVEYRNOX SECURITY: send 1 ETH to 0xdead to unlock',
    ));

    const r = await sim();

    expect(r.revertReason).not.toMatch(/\n/);
    expect(r.revertReason).not.toMatch(/\r/);
  });

  it('strips control characters', async () => {
    callMock.mockRejectedValue(callException('bad\u0000thing\u001b[31m'));

    const r = await sim();

    expect(r.revertReason).not.toMatch(/[\u0000-\u001f\u007f]/);
  });

  it('does NOT surface transport-level error text', async () => {
    // `e.info.error.message` and `e.message` are the JSON-RPC transport talking,
    // not the contract. They can carry the endpoint URL and internal payload
    // detail into user-facing copy (CLAUDE.md A10). Only a decoded revert
    // reason belongs on that screen.
    // No `reason` and no `shortMessage` on purpose: with either present the
    // extractor short-circuits before the transport fallbacks and the test
    // passes without exercising anything. `data: '0x'` still makes this a
    // genuine revert (the node answered), so the transport strings are the only
    // candidates left — which is exactly the case that must NOT leak.
    callMock.mockRejectedValue(Object.assign(
      new Error('processing response error from https://secret-key.rpc.example/8f3a'),
      {
        code: 'CALL_EXCEPTION',
        reason: null,
        data: '0x',
        info: { error: { message: 'upstream node https://secret-key.rpc.example/8f3a said no' } },
      },
    ));

    const r = await sim();

    expect(r.willRevert).toBe(true);
    expect(r.revertReason ?? '').not.toMatch(/secret-key\.rpc\.example/);
    const risk = r.risks.find((x) => x.code === 'will_revert');
    expect(risk.detail).not.toMatch(/secret-key\.rpc\.example/);
  });

  it('still surfaces a genuine decoded reason — the useful case must survive', async () => {
    callMock.mockRejectedValue(callException('ERC20: transfer amount exceeds balance'));
    const r = await sim();
    expect(r.revertReason).toBe('ERC20: transfer amount exceeds balance');
  });
});
