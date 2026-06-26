// H8 — personal_sign address-param validation.
// A pure helper resolves which params entry is the hex message and asserts the
// address param matches the wallet's own EVM address. Reversed-order payloads
// ([address, message], MetaMask legacy) and foreign-address payloads must be
// rejected (I4 fail closed) before the key is ever touched.

import { describe, it, expect } from 'vitest';
import { resolvePersonalSignMessage } from '@/lib/WalletConnectProvider.jsx';

const OWN = '0x1111111111111111111111111111111111111111';
const FOREIGN = '0x2222222222222222222222222222222222222222';
// "hello" as a hex message
const MSG = '0x68656c6c6f';

describe('resolvePersonalSignMessage (H8)', () => {
  it('accepts EIP-1474 [message, ownAddress] and returns the message', () => {
    const res = resolvePersonalSignMessage([MSG, OWN], OWN);
    expect(res.ok).toBe(true);
    expect(res.message).toBe(MSG);
  });

  it('accepts MetaMask-legacy [ownAddress, message] by swapping', () => {
    const res = resolvePersonalSignMessage([OWN, MSG], OWN);
    expect(res.ok).toBe(true);
    expect(res.message).toBe(MSG);
  });

  it('rejects a foreign address (no param matches own address)', () => {
    const res = resolvePersonalSignMessage([MSG, FOREIGN], OWN);
    expect(res.ok).toBe(false);
    expect(res.code).toBe('PERSONAL_SIGN_ADDRESS_MISMATCH');
  });

  it('rejects when no address param is present at all', () => {
    const res = resolvePersonalSignMessage([MSG, MSG], OWN);
    expect(res.ok).toBe(false);
    expect(res.code).toBe('PERSONAL_SIGN_ADDRESS_MISMATCH');
  });

  it('matches own address case-insensitively', () => {
    const res = resolvePersonalSignMessage([MSG, OWN.toUpperCase().replace('0X', '0x')], OWN);
    expect(res.ok).toBe(true);
    expect(res.message).toBe(MSG);
  });

  it('fails closed when own address is unknown', () => {
    const res = resolvePersonalSignMessage([MSG, OWN], null);
    expect(res.ok).toBe(false);
    expect(res.code).toBe('PERSONAL_SIGN_NO_WALLET');
  });
});
