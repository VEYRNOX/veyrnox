// audit-H8: unit tests for the personal_sign address validation guard.
//
// personal_sign params are [hexMessage, address]. Some legacy dApps (early
// MetaMask convention) reverse the order to [address, hexMessage]. Without
// validating params[1] against the wallet's own address, a reversed payload
// would cause params[0] (the address bytes) to be signed as the message —
// a payload different from what the user approved in the UI.
import { describe, it, expect } from 'vitest';
import { assertPersonalSignAddress } from '../WalletConnectProvider';

const WALLET = '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12';

describe('assertPersonalSignAddress — H8 personal_sign address guard', () => {
  it('passes when params[1] exactly matches the wallet address', () => {
    expect(() => assertPersonalSignAddress(WALLET, WALLET)).not.toThrow();
  });

  it('passes case-insensitively (checksummed vs lowercase)', () => {
    expect(() => assertPersonalSignAddress(WALLET.toLowerCase(), WALLET)).not.toThrow();
    expect(() => assertPersonalSignAddress(WALLET, WALLET.toLowerCase())).not.toThrow();
    expect(() => assertPersonalSignAddress(WALLET.toLowerCase(), WALLET.toLowerCase())).not.toThrow();
  });

  it('throws when params[1] is a different address', () => {
    const other = '0x0000000000000000000000000000000000000001';
    expect(() => assertPersonalSignAddress(other, WALLET)).toThrow(/address mismatch/i);
  });

  it('throws when params[1] is undefined (reversed-order / missing address param)', () => {
    expect(() => assertPersonalSignAddress(undefined, WALLET)).toThrow(/address mismatch/i);
  });

  it('throws when params[1] is null', () => {
    expect(() => assertPersonalSignAddress(null, WALLET)).toThrow(/address mismatch/i);
  });

  it('throws when params[1] is an empty string', () => {
    expect(() => assertPersonalSignAddress('', WALLET)).toThrow(/address mismatch/i);
  });

  it('throws when the wallet address is unknown (null evmAddress — no active session)', () => {
    expect(() => assertPersonalSignAddress(WALLET, null)).toThrow(/address mismatch/i);
  });

  it('error message includes both the request address and the wallet address', () => {
    const other = '0x1111111111111111111111111111111111111111';
    let msg = '';
    try { assertPersonalSignAddress(other, WALLET); } catch (e) { msg = e.message; }
    expect(msg).toContain(other);
    expect(msg).toContain(WALLET);
  });
});
