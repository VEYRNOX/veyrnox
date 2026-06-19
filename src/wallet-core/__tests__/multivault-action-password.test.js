// Per-SET Action Password (2FA second factor) carried inside the multi-seed container.
import { describe, it, expect } from 'vitest';
import {
  migrateLegacyMnemonic,
  serializeContainer,
  parseVault,
  validateContainer,
  addWallet,
  removeWallet,
  getActionPasswordRecord,
  withActionPasswordRecord,
  clearActionPasswordRecord,
} from '../multiVault.js';
import { serializeActionPasswordRecord } from '../actionPassword.js';

// Standard BIP-39 test vectors (valid checksums) so validateMnemonic accepts them.
const M1 = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const M2 = 'legal winner thank year wave sausage worth useful legal winner thank yellow';

// A well-formed (fake bytes) serialized verifier record — shape is what matters here.
const REC = serializeActionPasswordRecord({
  salt: new Uint8Array([1, 2, 3, 4]),
  hash: new Uint8Array(Array.from({ length: 32 }, (_, i) => i)),
  params: { parallelism: 1, iterations: 3, memorySize: 196608, hashLength: 32 },
});

const baseContainer = () => migrateLegacyMnemonic(M1).container;

describe('multiVault — per-set Action Password record', () => {
  it('a container WITHOUT an Action Password serialises byte-identically to the pre-feature shape', () => {
    const c = baseContainer();
    const json = JSON.parse(serializeContainer(c));
    expect(json).not.toHaveProperty('actionPassword'); // no field when absent
    expect(getActionPasswordRecord(c)).toBeNull();
  });

  it('withActionPasswordRecord attaches the record on a NEW container; the original is untouched', () => {
    const c = baseContainer();
    const withAp = withActionPasswordRecord(c, REC);
    expect(getActionPasswordRecord(withAp)).toEqual(REC);
    expect(getActionPasswordRecord(c)).toBeNull(); // isolation: original unchanged
    // Setting the second factor never touches the seeds.
    expect(withAp.wallets).toEqual(c.wallets);
  });

  it('the record survives serialise -> parseVault round-trip', () => {
    const withAp = withActionPasswordRecord(baseContainer(), REC);
    const { container, migrated } = parseVault(serializeContainer(withAp));
    expect(migrated).toBe(false);
    expect(getActionPasswordRecord(container)).toEqual(REC);
  });

  it('addWallet and removeWallet carry the Action Password through unchanged (it is a SET property)', () => {
    const withAp = withActionPasswordRecord(baseContainer(), REC);
    const added = addWallet(withAp, M2);
    expect(getActionPasswordRecord(added.container)).toEqual(REC);
    expect(added.container.wallets).toHaveLength(2);

    const removed = removeWallet(added.container, added.walletId);
    expect(getActionPasswordRecord(removed)).toEqual(REC); // still there after removing a wallet
    expect(removed.wallets).toHaveLength(1);
  });

  it('clearActionPasswordRecord removes the second factor for this set only (new container)', () => {
    const withAp = withActionPasswordRecord(baseContainer(), REC);
    const cleared = clearActionPasswordRecord(withAp);
    expect(getActionPasswordRecord(cleared)).toBeNull();
    expect(getActionPasswordRecord(withAp)).toEqual(REC); // original untouched
    expect(JSON.parse(serializeContainer(cleared))).not.toHaveProperty('actionPassword');
  });

  it('withActionPasswordRecord rejects a malformed record', () => {
    expect(() => withActionPasswordRecord(baseContainer(), { v: 99 })).toThrow();
    expect(() => withActionPasswordRecord(baseContainer(), null)).toThrow();
  });

  it('validateContainer / parseVault reject a container whose Action Password record is malformed', () => {
    const bad = { ...baseContainer(), actionPassword: { v: 1, salt: 'a' /* missing hash/params */ } };
    expect(() => validateContainer(bad)).toThrow(/Action Password/);
    // parseVault validates before normalising, so a corrupt on-disk record is caught.
    const payload = JSON.stringify(bad);
    expect(() => parseVault(payload)).toThrow();
  });

  it('a legacy bare-mnemonic vault migrates with NO Action Password (opt-in only)', () => {
    const { container, migrated } = parseVault(M1);
    expect(migrated).toBe(true);
    expect(getActionPasswordRecord(container)).toBeNull();
  });

  // H2 GATE PARITY: decoy/hidden sets are now ALSO single-wallet containers, so a
  // decoy/hidden container that carries a record reports "configured" exactly like a
  // primary set. This is the value WalletProvider feeds into actionPasswordConfigured,
  // so the 2FA gate fires identically across primary/decoy/hidden.
  it('a single-wallet (decoy/hidden-shaped) container carrying a record reports configured after round-trip', () => {
    const decoyLike = withActionPasswordRecord(baseContainer(), REC); // baseContainer is 1 wallet
    const { container } = parseVault(serializeContainer(decoyLike));
    expect(getActionPasswordRecord(container)).toEqual(REC);          // present == configured
    expect(getActionPasswordRecord(container) != null).toBe(true);    // the gate input is true
  });

  it('a single-wallet container with NO record reports NOT configured (presence still means configured)', () => {
    const { container } = parseVault(serializeContainer(baseContainer()));
    expect(getActionPasswordRecord(container)).toBeNull();
    expect(getActionPasswordRecord(container) != null).toBe(false);
  });
});
