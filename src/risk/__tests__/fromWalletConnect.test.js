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
