// src/risk/__tests__/s7-calldata-mismatch.test.js
//
// S7 — calldata / contract-code mismatch. Catches mis-targeted sends by comparing
// the tx's intent (does it carry calldata?) against the recipient's code-ness
// (does it have bytecode?), using the eth_getCode result the wallet ALREADY
// fetched (I2: no new network call). Truth table:
//
//   data present + recipient is a contract → OK  (normal contract call)
//   data present + recipient is an EOA      → CAUTION (calldata silently no-ops)
//   no data      + recipient is an EOA      → OK  (normal native send)
//   no data      + recipient is a contract  → CAUTION (value to a contract — unusual)
//   recipient code unknown                  → INDETERMINATE (fail closed)

import { describe, it, expect } from 'vitest';
import { s7CalldataMismatch } from '../signals/s7-calldata-mismatch.js';
import { LEVEL } from '../levels.js';

const APPROVE = '0x095ea7b3000000000000000000000000000000000000000000000000000000000000dead';
const CONTRACT_CODE = '0x6080604052348015';
const EOA_CODE = '0x';

const tx = (data) => ({ to: '0xabc', data, value: 0n, chainId: 11155111 });
const chain = (recipientCode) => ({ recipientCode });

describe('S7 calldata / code mismatch', () => {
  it('MISS: calldata to a contract is a normal call → OK', () => {
    expect(s7CalldataMismatch(tx(APPROVE), {}, chain(CONTRACT_CODE)).level).toBe(LEVEL.OK);
  });

  it('HIT: calldata to an EOA (no code) → CAUTION (it will silently do nothing)', () => {
    expect(s7CalldataMismatch(tx(APPROVE), {}, chain(EOA_CODE)).level).toBe(LEVEL.CAUTION);
  });

  it('MISS: a plain native send to an EOA → OK', () => {
    expect(s7CalldataMismatch(tx('0x'), {}, chain(EOA_CODE)).level).toBe(LEVEL.OK);
  });

  it('HIT: a value-only send to a contract → CAUTION (unusual)', () => {
    expect(s7CalldataMismatch(tx('0x'), {}, chain(CONTRACT_CODE)).level).toBe(LEVEL.CAUTION);
  });

  it('INDETERMINATE: recipient code not known → fail closed', () => {
    expect(s7CalldataMismatch(tx(APPROVE), {}, chain(undefined)).level).toBe(LEVEL.INDETERMINATE);
  });
});
