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

  it('maps to_address from history records into sendHistory for S1', () => {
    const history = [{ type: 'send', to_address: TO, currency: 'ETH', amount: '1' }];
    const { activeSetLocalState } = buildRiskInputs({ to: TO, amountText: '1', history });
    expect(activeSetLocalState.sendHistory).toEqual([{ to: TO }]);
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

  it('ENS-mismatch yields a RISK composite owned by S5', () => {
    // displayedEns resolves (cache) to A, but the tx is going to TO (A !== TO).
    const inputs = buildRiskInputs({
      to: TO, amountText: '0.1', assetCurrency: 'ETH',
      displayedEns: 'alice.eth', ensResolvedAddress: A,
      recipientCode: '0x', // EOA, so S7 stays OK
    });
    const verdict = score(inputs.unsignedTx, inputs.activeSetLocalState, inputs.chainData);
    expect(verdict.level).toBe(LEVEL.RISK);
    expect(verdict.signalId).toBe('S5');
  });

  it('CAUTION verdict requires confirmation so the presign gate can be cleared', () => {
    // A CAUTION verdict must set requiresConfirmation=true so RiskVerdictBanner
    // renders the acknowledge checkbox. Without it the presign gate (WARN tier)
    // blocks the send with no UI affordance to unblock it.
    const cautionSignal = [{ id: 'T1', fn: () => ({ level: LEVEL.CAUTION, evidence: { reason: 'test caution' } }) }];
    const verdict = score({}, {}, {}, cautionSignal);
    expect(verdict.level).toBe(LEVEL.CAUTION);
    expect(verdict.requiresConfirmation).toBe(true);
  });
});
