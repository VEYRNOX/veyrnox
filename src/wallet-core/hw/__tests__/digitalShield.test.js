import { describe, expect, it } from 'vitest';
import { HDKey } from '@scure/bip32';
import { base58, hex } from '@scure/base';
import { computeAddress, SigningKey, Transaction } from 'ethers';
import { UREncoder } from '@ngraveio/bc-ur';
import { CryptoHDKey, CryptoKeypath, CryptoPSBT, PathComponent } from '@keystonehq/bc-ur-registry';
import { CryptoMultiAccounts } from '@keystonehq/bc-ur-registry/dist/extended/CryptoMultiAccounts.js';
import { ETHSignature } from '@keystonehq/bc-ur-registry-eth';
import { SolSignature } from '@keystonehq/bc-ur-registry-sol';
import { p2wpkh, Transaction as BtcTransaction } from '@scure/btc-signer';
import { ed25519 } from '@noble/curves/ed25519';

import {
  buildDigitalShieldBtcPsbt,
  buildDigitalShieldEvmRequest,
  buildDigitalShieldSolRequest,
  finalizeDigitalShieldBtcResponse,
  finalizeDigitalShieldEvmResponse,
  finalizeDigitalShieldSolResponse,
  parseDigitalShieldImport,
} from '../digitalShield.js';
import { deriveSolAccount, deriveSolPublicKey } from '../../sol/derivation.js';
import { getBtcNetworkInfo } from '../../btc/networks.js';
import { mnemonicToSeed } from '../../mnemonic.js';

const TEST_UUID = '11111111-1111-4111-8111-111111111111';
const MNEMONIC = 'test test test test test test test test test test test junk';

function makeKeypath(path, fingerprintHex) {
  return new CryptoKeypath(
    path.split('/').slice(1).map((component) => {
      const hardened = component.endsWith("'");
      const index = Number(component.replace(/'/g, ''));
      return new PathComponent({ index, hardened });
    }),
    Buffer.from(fingerprintHex, 'hex'),
  );
}

function u32beBytes(num) {
  return Buffer.from([
    (num >>> 24) & 0xff,
    (num >>> 16) & 0xff,
    (num >>> 8) & 0xff,
    num & 0xff,
  ]);
}

function encodeParts(ur) {
  const encoder = new UREncoder(ur, 500, 0);
  return encoder.encodeWhole().map((part) => part.toUpperCase());
}

function makeImportUr({ includeAmbiguousEvm = false } = {}) {
  const seed = mnemonicToSeed(MNEMONIC);
  const master = HDKey.fromMasterSeed(seed);
  const fingerprintBytes = u32beBytes(master.fingerprint);
  const fingerprintHex = fingerprintBytes.toString('hex');
  const evmNode = master.derive("m/44'/60'/0'");
  const btcNode = master.derive("m/84'/0'/0'");
  const sol = deriveSolPublicKey(MNEMONIC);
  const keys = [
    new CryptoHDKey({
      isMaster: false,
      key: evmNode.publicKey,
      chainCode: evmNode.chainCode,
      origin: makeKeypath("m/44'/60'/0'", fingerprintHex),
      parentFingerprint: u32beBytes(evmNode.parentFingerprint),
    }),
    new CryptoHDKey({
      isMaster: false,
      key: btcNode.publicKey,
      chainCode: btcNode.chainCode,
      origin: makeKeypath("m/84'/0'/0'", fingerprintHex),
      parentFingerprint: u32beBytes(btcNode.parentFingerprint),
    }),
    new CryptoHDKey({
      isMaster: false,
      key: hex.decode(hex.encode(sol.publicKey)),
      origin: makeKeypath("m/44'/501'/0'/0'", fingerprintHex),
    }),
  ];
  if (includeAmbiguousEvm) {
    const evmRoot = master.derive("m/44'/60'");
    keys.push(new CryptoHDKey({
      isMaster: false,
      key: evmRoot.publicKey,
      chainCode: evmRoot.chainCode,
      origin: makeKeypath("m/44'/60'", fingerprintHex),
      parentFingerprint: u32beBytes(evmRoot.parentFingerprint),
    }));
  }
  const multi = new CryptoMultiAccounts(fingerprintBytes, keys, 'Digital Shield', 'device-1', '1.0.0');
  return encodeParts(multi.toUR());
}

describe('Digital Shield import parsing', () => {
  it('parses a fragmented crypto-multi-accounts payload and derives addresses', () => {
    const imported = parseDigitalShieldImport(makeImportUr());
    expect(imported.providerId).toBe('digital-shield');
    expect(imported.accounts.evm.address).toMatch(/^0x[0-9A-Fa-f]{40}$/);
    expect(imported.accounts.btc.address.startsWith('bc1')).toBe(true);
    expect(imported.accounts.solana.address).toBe(base58.encode(deriveSolPublicKey(MNEMONIC).publicKey));
  });

  it('rejects ambiguous EVM imports instead of guessing the account node', () => {
    expect(() => parseDigitalShieldImport(makeImportUr({ includeAmbiguousEvm: true }))).toThrow('DIGITAL_SHIELD_EVM_IMPORT_AMBIGUOUS');
  });
});

describe('Digital Shield EVM request/response', () => {
  it('binds request_id, verifies the signer locally, and marks the session consumed', () => {
    const imported = parseDigitalShieldImport(makeImportUr());
    const account = imported.accounts.evm;
    const req = buildDigitalShieldEvmRequest({
      account,
      requestId: TEST_UUID,
      tx: {
        chainId: 1,
        nonce: 7,
        to: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        value: 123n,
        gasLimit: 21000n,
        maxFeePerGas: 2_000_000_000n,
        maxPriorityFeePerGas: 1_000_000_000n,
      },
    });
    const seed = mnemonicToSeed(MNEMONIC);
    const root = HDKey.fromMasterSeed(seed);
    const leaf = root.derive(account.accountPath);
    const unsigned = Transaction.from(req.unsignedHex);
    const signature = new SigningKey(`0x${hex.encode(leaf.privateKey)}`).sign(unsigned.unsignedHash).serialized;
    const responseUr = new ETHSignature(Buffer.from(signature.slice(2), 'hex'), Buffer.from(TEST_UUID.replace(/-/g, ''), 'hex'));
    const finalized = finalizeDigitalShieldEvmResponse({
      session: req.session,
      unsignedHex: req.unsignedHex,
      input: encodeParts(responseUr.toUR())[0],
    });
    const signed = Transaction.from(finalized.signedHex);
    expect(signed.from).toBe(account.address);
    expect(finalized.session.consumedAtMs).not.toBeNull();
  });
});

describe('Digital Shield BTC request/response', () => {
  it('builds a PSBT request with BIP32 binding and accepts only matching signed outputs', () => {
    const imported = parseDigitalShieldImport(makeImportUr());
    const account = imported.accounts.btc;
    const req = buildDigitalShieldBtcPsbt({
      account,
      requestId: TEST_UUID,
      plan: {
        inputs: [{ txid: 'aa'.repeat(32), vout: 0, value: 100000n }],
        outputs: [
          { address: account.address, value: 90000n },
          { address: account.address, value: 9000n },
        ],
      },
    });
    const seed = mnemonicToSeed(MNEMONIC);
    const root = HDKey.fromMasterSeed(seed);
    const leaf = root.derive(account.accountPath);
    const net = getBtcNetworkInfo('mainnet');
    const signed = BtcTransaction.fromPSBT(hex.decode(req.psbtHex));
    signed.sign(leaf.privateKey);
    signed.finalize();
    const responseUr = new CryptoPSBT(signed.toPSBT()).toUR();
    const finalized = finalizeDigitalShieldBtcResponse({
      session: req.session,
      unsignedPsbtHex: req.psbtHex,
      input: encodeParts(responseUr),
    });
    expect(finalized.txid).toBe(signed.id);
    expect(finalized.finalizedTxHex).toMatch(/^[0-9a-f]+$/);
    expect(p2wpkh(root.derive(account.accountPath).publicKey, net.params).address).toBe(account.address);
  });

  it('rejects a signed response that substitutes an input', () => {
    const imported = parseDigitalShieldImport(makeImportUr());
    const account = imported.accounts.btc;
    const req = buildDigitalShieldBtcPsbt({
      account,
      requestId: TEST_UUID,
      plan: {
        inputs: [{ txid: 'aa'.repeat(32), vout: 0, value: 100000n }],
        outputs: [
          { address: account.address, value: 90000n },
          { address: account.address, value: 9000n },
        ],
      },
    });
    const seed = mnemonicToSeed(MNEMONIC);
    const root = HDKey.fromMasterSeed(seed);
    const leaf = root.derive(account.accountPath);
    const net = getBtcNetworkInfo('mainnet');
    const owner = p2wpkh(leaf.publicKey, net.params);
    const substituted = new BtcTransaction();
    substituted.addInput({
      txid: hex.decode('bb'.repeat(32)),
      index: 0,
      witnessUtxo: { script: owner.script, amount: 100000n },
    });
    substituted.addOutputAddress(account.address, 90000n, net.params);
    substituted.addOutputAddress(account.address, 9000n, net.params);
    substituted.sign(leaf.privateKey);
    substituted.finalize();
    const responseUr = new CryptoPSBT(substituted.toPSBT()).toUR();

    expect(() => finalizeDigitalShieldBtcResponse({
      session: req.session,
      unsignedPsbtHex: req.psbtHex,
      input: encodeParts(responseUr),
    })).toThrow('DIGITAL_SHIELD_BTC_INPUT_MISMATCH');
  });
});

describe('Digital Shield extended-pubkey versioning (R6 audit)', () => {
  it('serializes the BIP84 BTC account as a zpub (version bytes 04b24746)', () => {
    const imported = parseDigitalShieldImport(makeImportUr());
    const btcXpub = imported.accounts.btc.xpub;
    // zpub prefix is deterministic; xpub would start with "xpub".
    expect(btcXpub.slice(0, 4)).toBe('zpub');
    // Ensure the round-trip still derives a valid P2WPKH address (proves the
    // toStandardXpub rewrap keeps HDKey happy).
    expect(imported.accounts.btc.address).toMatch(/^bc1[a-z0-9]+$/);
  });

  it('serializes the BIP44 EVM account as an xpub (version bytes 0488b21e)', () => {
    const imported = parseDigitalShieldImport(makeImportUr());
    expect(imported.accounts.evm.xpub.slice(0, 4)).toBe('xpub');
  });
});

describe('Digital Shield Solana request/response', () => {
  it('verifies an ed25519 signature locally and consumes the session', () => {
    const imported = parseDigitalShieldImport(makeImportUr());
    const account = imported.accounts.solana;
    const message = 'deadbeef';
    const req = buildDigitalShieldSolRequest({
      account,
      signDataHex: message,
      requestId: TEST_UUID,
    });
    const sol = deriveSolAccount(MNEMONIC);
    const signature = ed25519.sign(hex.decode(message), sol.privateKey);
    const responseUr = new SolSignature(signature, Buffer.from(TEST_UUID.replace(/-/g, ''), 'hex')).toUR();
    const finalized = finalizeDigitalShieldSolResponse({
      session: req.session,
      signDataHex: message,
      input: encodeParts(responseUr)[0],
    });
    expect(finalized.signatureHex).toMatch(/^0x[0-9a-f]+$/);
    expect(finalized.session.consumedAtMs).not.toBeNull();
  });
});
