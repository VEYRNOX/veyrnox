// @ts-nocheck
import { HDKey } from '@scure/bip32';
import { base58, base58check, hex } from '@scure/base';
import { computeAddress, Signature, Transaction, getAddress } from 'ethers';
import { ed25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils';
import { UREncoder, URDecoder } from '@ngraveio/bc-ur';
import { CryptoMultiAccounts, CryptoPSBT } from '@keystonehq/bc-ur-registry';
import { ETHSignature } from '@keystonehq/bc-ur-registry-eth';
import { SolSignature } from '@keystonehq/bc-ur-registry-sol';
import { KeystoneEthereumSDK } from '@keystonehq/keystone-sdk/dist/chains/ethereum.js';
import { KeystoneSolanaSDK } from '@keystonehq/keystone-sdk/dist/chains/solana.js';
import { URType } from '@keystonehq/keystone-sdk/dist/types/ur.js';
import { Transaction as BtcTransaction, bip32Path, p2wpkh } from '@scure/btc-signer';
import { stringify as uuidStringify } from 'uuid';
import { buildUnsignedEvmTx } from '../coldkey/evmUnsigned.js';
import { getBtcNetworkInfo } from '../btc/networks.js';
import { getNetworkByChainId, getNetworkInfo } from '../evm/networks.js';

const UR_PREFIX = /^ur:/i;
const MAX_UR_PARTS = 200;
const MAX_UR_PART_LEN = 2048;
const MAX_SIGN_DATA_BYTES = 64 * 1024;
const DEFAULT_SESSION_TTL_MS = 2 * 60 * 1000;
const DIGITAL_SHIELD_ORIGIN = 'Veyrnox';
const SUPPORTED_EVM_CHAIN_IDS = new Set([1, 56, 137, 42161]);
const SUPPORTED_IMPORT_UR_TYPES = new Set([URType.CryptoMultiAccounts]);
const SUPPORTED_EVM_RESPONSE_UR_TYPES = new Set([URType.EthSignature]);
const SUPPORTED_BTC_RESPONSE_UR_TYPES = new Set([URType.CryptoPSBT]);
const SUPPORTED_SOL_RESPONSE_UR_TYPES = new Set([URType.SolSignature]);

const ethereumSdk = new KeystoneEthereumSDK({ origin: DIGITAL_SHIELD_ORIGIN });
const solanaSdk = new KeystoneSolanaSDK();
const base58checkCodec = base58check(sha256);

function sha256Hex(value) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return bytesToHex(sha256(bytes));
}

function ensureHex(value, field) {
  const normalized = String(value || '').trim().toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]+$/.test(normalized) || normalized.length % 2 !== 0) {
    throw new Error(`DIGITAL_SHIELD_INVALID_${field.toUpperCase()}`);
  }
  return normalized;
}

function ensureUuid(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized)) {
    throw new Error('DIGITAL_SHIELD_INVALID_REQUEST_ID');
  }
  return normalized;
}

function ensureAllowedUrPart(part) {
  const trimmed = String(part || '').trim();
  if (!UR_PREFIX.test(trimmed)) throw new Error('DIGITAL_SHIELD_INVALID_UR');
  if (trimmed.length > MAX_UR_PART_LEN) throw new Error('DIGITAL_SHIELD_UR_PART_TOO_LARGE');
  return trimmed.toLowerCase();
}

function bytesToHexString(value) {
  if (value == null) return null;
  if (typeof value === 'string') return ensureHex(value, 'bytes');
  if (Buffer.isBuffer(value) || value instanceof Uint8Array || ArrayBuffer.isView(value)) {
    return Buffer.from(value).toString('hex');
  }
  if (Array.isArray(value)) return Buffer.from(value).toString('hex');
  if (value?.data) return Buffer.from(value.data).toString('hex');
  if (typeof value === 'object') {
    const numericValues = Object.values(value);
    if (numericValues.length && numericValues.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
      return Buffer.from(numericValues).toString('hex');
    }
  }
  throw new Error('DIGITAL_SHIELD_INVALID_BYTE_FIELD');
}

function decodeUr(input, allowedTypes) {
  const parts = Array.isArray(input) ? input : [input];
  if (!parts.length) throw new Error('DIGITAL_SHIELD_EMPTY_UR');
  if (parts.length > MAX_UR_PARTS) throw new Error('DIGITAL_SHIELD_TOO_MANY_UR_PARTS');
  const decoder = new URDecoder();
  for (const raw of parts) decoder.receivePart(ensureAllowedUrPart(raw));
  if (!decoder.isComplete()) throw new Error('DIGITAL_SHIELD_INCOMPLETE_UR');
  if (!decoder.isSuccess()) throw new Error('DIGITAL_SHIELD_INVALID_UR_PAYLOAD');
  const ur = decoder.resultUR();
  if (!allowedTypes.has(ur.type)) throw new Error(`DIGITAL_SHIELD_UR_TYPE_NOT_ALLOWED:${ur.type}`);
  return ur;
}

function encodeUrParts(ur, maxFragmentLength = 220) {
  const encoder = new UREncoder(ur, maxFragmentLength, 0);
  const parts = encoder.encodeWhole().slice(0, MAX_UR_PARTS).map((part) => part.toUpperCase());
  if (!parts.length) throw new Error('DIGITAL_SHIELD_UR_ENCODE_FAILED');
  return parts;
}

function ensureSupportedEvmChain(chainId) {
  const id = Number(chainId);
  if (!SUPPORTED_EVM_CHAIN_IDS.has(id)) {
    throw new Error(`DIGITAL_SHIELD_EVM_CHAIN_UNSUPPORTED:${id}`);
  }
  return id;
}

function serializeXpub({ path, parentFingerprint, chainCode, publicKeyHex }) {
  const components = String(path || '').split('/').slice(1);
  if (!components.length) throw new Error('DIGITAL_SHIELD_INVALID_BIP32_PATH');
  const depth = components.length;
  const last = components[components.length - 1];
  const index = Number(last.replace("'", ''));
  const hardened = last.endsWith("'");
  const childIndex = hardened ? index + 0x80000000 : index;
  const payload = Buffer.concat([
    Buffer.from('0488b21e', 'hex'),
    Buffer.from([depth]),
    Buffer.from(parentFingerprint || '00000000', 'hex'),
    Buffer.from([
      (childIndex >>> 24) & 0xff,
      (childIndex >>> 16) & 0xff,
      (childIndex >>> 8) & 0xff,
      childIndex & 0xff,
    ]),
    Buffer.from(chainCode, 'hex'),
    Buffer.from(publicKeyHex, 'hex'),
  ]);
  return base58checkCodec.encode(payload);
}

function deriveEvmAddressFromXpub(xpub, index = 0) {
  const accountNode = HDKey.fromExtendedKey(xpub);
  const child = accountNode.derive(`m/0/${index}`);
  if (!child.publicKey) throw new Error('DIGITAL_SHIELD_EVM_XPUB_DERIVATION_FAILED');
  return computeAddress(`0x${bytesToHex(child.publicKey)}`);
}

function deriveBtcAddressFromXpub(xpub, networkKey = 'mainnet', change = 0, index = 0) {
  const net = getBtcNetworkInfo(networkKey);
  const accountNode = HDKey.fromExtendedKey(xpub);
  const child = accountNode.derive(`m/${change}/${index}`);
  const { address } = p2wpkh(child.publicKey, net.params);
  if (!address) throw new Error('DIGITAL_SHIELD_BTC_XPUB_DERIVATION_FAILED');
  return address;
}

function deriveSolAddressFromPublicKey(publicKeyHex) {
  return base58.encode(hex.decode(ensureHex(publicKeyHex, 'sol_public_key')));
}

function findCoinType(key) {
  const match = String(key?.path || '').match(/^m\/\d+'\/(\d+)'/);
  return match ? Number(match[1]) : null;
}

function selectUniqueKey(keys, predicate, errorCode) {
  const matches = keys.filter(predicate);
  if (matches.length !== 1) throw new Error(errorCode);
  return matches[0];
}

function normalizeImportedKeys(multiAccounts) {
  const keys = Array.isArray(multiAccounts?.keys) ? multiAccounts.keys : [];
  const evmAccountNodeKeys = keys.filter((key) => findCoinType(key) === 60 && key.path === "m/44'/60'/0'");
  const evmRootNodeKeys = keys.filter((key) => findCoinType(key) === 60 && key.path === "m/44'/60'");
  if (evmRootNodeKeys.length) throw new Error('DIGITAL_SHIELD_EVM_IMPORT_AMBIGUOUS');
  const evm = evmAccountNodeKeys.length
    ? selectUniqueKey(evmAccountNodeKeys, () => true, 'DIGITAL_SHIELD_EVM_IMPORT_AMBIGUOUS')
    : null;
  const btc = keys.find((key) => key.path === "m/84'/0'/0'");
  const sol = keys.find((key) => key.path === "m/44'/501'/0'/0'");
  return { evm, btc, sol };
}

function buildImportedProfile(parsed) {
  const xfp = ensureHex(parsed.masterFingerprint, 'master_fingerprint');
  if (xfp.length !== 8) throw new Error('DIGITAL_SHIELD_INVALID_MASTER_FINGERPRINT');
  const { evm, btc, sol } = normalizeImportedKeys(parsed);
  const accounts = {};
  if (evm?.extendedPublicKey) {
    const accountPath = `${evm.path}/0/0`;
    accounts.evm = {
      family: 'evm',
      xfp,
      accountPath,
      accountNodePath: evm.path,
      xpub: evm.extendedPublicKey,
      publicKeyHex: ensureHex(evm.publicKey, 'evm_public_key'),
      address: deriveEvmAddressFromXpub(evm.extendedPublicKey, 0),
    };
  }
  if (btc?.extendedPublicKey) {
    const accountPath = `${btc.path}/0/0`;
    accounts.btc = {
      family: 'btc',
      xfp,
      accountPath,
      accountNodePath: btc.path,
      xpub: btc.extendedPublicKey,
      publicKeyHex: ensureHex(btc.publicKey, 'btc_public_key'),
      address: deriveBtcAddressFromXpub(btc.extendedPublicKey, 'mainnet', 0, 0),
    };
  }
  if (sol?.publicKey) {
    accounts.solana = {
      family: 'solana',
      xfp,
      accountPath: sol.path,
      accountNodePath: sol.path,
      publicKeyHex: ensureHex(sol.publicKey, 'sol_public_key'),
      address: deriveSolAddressFromPublicKey(sol.publicKey),
    };
  }
  return {
    providerId: 'digital-shield',
    masterFingerprint: xfp,
    device: parsed.device || null,
    deviceId: parsed.deviceId || null,
    deviceVersion: parsed.deviceVersion || null,
    accounts,
  };
}

function createSession(kind, account, binding, ttlMs = DEFAULT_SESSION_TTL_MS, requestId = globalThis.crypto?.randomUUID?.() ?? '00000000-0000-4000-8000-000000000000', now = Date.now()) {
  const expiresAtMs = now + ttlMs;
  return {
    providerId: 'digital-shield',
    kind,
    requestId: ensureUuid(requestId),
    account,
    bindingHash: sha256Hex(binding),
    createdAtMs: now,
    expiresAtMs,
    consumedAtMs: null,
  };
}

function assertSessionOpen(session, now = Date.now()) {
  if (!session || session.providerId !== 'digital-shield') throw new Error('DIGITAL_SHIELD_SESSION_INVALID');
  if (session.consumedAtMs) throw new Error('DIGITAL_SHIELD_SESSION_REPLAYED');
  if (now > session.expiresAtMs) throw new Error('DIGITAL_SHIELD_SESSION_EXPIRED');
}

function consumeSession(session, now = Date.now()) {
  return { ...session, consumedAtMs: now };
}

function assertBinding(session, binding) {
  if (sha256Hex(binding) !== session.bindingHash) throw new Error('DIGITAL_SHIELD_REQUEST_BINDING_MISMATCH');
}

export function parseDigitalShieldImport(input) {
  const ur = decodeUr(input, SUPPORTED_IMPORT_UR_TYPES);
  const decoded = CryptoMultiAccounts.fromCBOR(Buffer.from(ur.cbor));
  const masterFingerprint = decoded.getMasterFingerprint()?.toString('hex');
  const keys = decoded.getKeys().map((key) => {
    const origin = key.getOrigin();
    const sourceFingerprint = origin?.getSourceFingerprint?.();
    const publicKey = bytesToHexString(key.getKey());
    const chainCode = bytesToHexString(key.getChainCode()) ?? '';
    const parentFingerprint = bytesToHexString(key.getParentFingerprint?.()) ?? '';
    const path = origin ? `m/${origin.getPath()}` : null;
    const extendedPublicKey = path && chainCode && parentFingerprint && publicKey
      ? serializeXpub({ path, chainCode, parentFingerprint, publicKeyHex: publicKey })
      : undefined;
    return {
      path,
      publicKey,
      extendedPublicKey,
      chainCode,
      parentFingerprint,
      xfp: bytesToHexString(sourceFingerprint),
      note: key.getNote?.() ?? null,
    };
  });
  const parsed = {
    masterFingerprint,
    keys,
    device: decoded.getDevice?.() ?? null,
    deviceId: decoded.getDeviceId?.() ?? null,
    deviceVersion: decoded.getVersion?.() ?? null,
  };
  return buildImportedProfile(parsed);
}

export function buildDigitalShieldEvmRequest({ account, tx, origin = DIGITAL_SHIELD_ORIGIN, ttlMs = DEFAULT_SESSION_TTL_MS, requestId, now = Date.now() }) {
  if (!account?.xpub || account.family !== 'evm') throw new Error('DIGITAL_SHIELD_EVM_ACCOUNT_REQUIRED');
  const chainId = ensureSupportedEvmChain(tx.chainId);
  const unsigned = buildUnsignedEvmTx(tx);
  const binding = `evm:${account.address}:${account.accountPath}:${chainId}:${unsigned.unsignedHex}`;
  const session = createSession('evm', account, binding, ttlMs, requestId, now);
  const ur = ethereumSdk.generateSignRequest({
    requestId: session.requestId,
    signData: unsigned.unsignedHex,
    dataType: KeystoneEthereumSDK.DataType.typedTransaction,
    path: account.accountPath,
    xfp: account.xfp,
    chainId,
    address: account.address,
    origin,
  });
  return {
    session,
    unsignedHex: unsigned.unsignedHex,
    ur,
    urParts: encodeUrParts(ur),
  };
}

export function finalizeDigitalShieldEvmResponse({ session, unsignedHex, input, now = Date.now() }) {
  assertSessionOpen(session, now);
  assertBinding(session, `evm:${session.account.address}:${session.account.accountPath}:${Transaction.from(unsignedHex).chainId}:${unsignedHex}`);
  const ur = decodeUr(input, SUPPORTED_EVM_RESPONSE_UR_TYPES);
  const parsedSig = ETHSignature.fromCBOR(Buffer.from(ur.cbor));
  const parsed = {
    requestId: uuidStringify(parsedSig.getRequestId()),
    signature: `0x${Buffer.from(parsedSig.getSignature()).toString('hex')}`,
  };
  if (ensureUuid(parsed.requestId) !== session.requestId) throw new Error('DIGITAL_SHIELD_REQUEST_ID_MISMATCH');
  const unsigned = Transaction.from(unsignedHex);
  const signature = Signature.from(parsed.signature);
  const signed = Transaction.from({
    type: Number(unsigned.type),
    chainId: Number(unsigned.chainId),
    nonce: unsigned.nonce,
    to: unsigned.to,
    value: unsigned.value,
    data: unsigned.data,
    gasLimit: unsigned.gasLimit,
    maxFeePerGas: unsigned.maxFeePerGas,
    maxPriorityFeePerGas: unsigned.maxPriorityFeePerGas,
    accessList: unsigned.accessList,
    signature,
  });
  if (signed.unsignedSerialized !== unsigned.unsignedSerialized) throw new Error('DIGITAL_SHIELD_EVM_UNSIGNED_TX_MISMATCH');
  if (!signed.from || getAddress(signed.from) !== getAddress(session.account.address)) {
    throw new Error('DIGITAL_SHIELD_SIGNER_ADDRESS_MISMATCH');
  }
  return {
    signedHex: signed.serialized,
    txHash: signed.hash,
    session: consumeSession(session, now),
  };
}

export function buildDigitalShieldBtcPsbt({ account, plan, networkKey = 'mainnet', ttlMs = DEFAULT_SESSION_TTL_MS, requestId, now = Date.now() }) {
  if (!account?.xpub || account.family !== 'btc') throw new Error('DIGITAL_SHIELD_BTC_ACCOUNT_REQUIRED');
  if (networkKey !== 'mainnet') throw new Error('DIGITAL_SHIELD_BTC_NETWORK_UNSUPPORTED');
  const net = getBtcNetworkInfo(networkKey);
  const pubKey = HDKey.fromExtendedKey(account.xpub).derive('m/0/0').publicKey;
  const owner = p2wpkh(pubKey, net.params);
  const tx = new BtcTransaction();
  for (const input of plan.inputs) {
    tx.addInput({
      txid: hex.decode(input.txid),
      index: input.vout,
      witnessUtxo: { script: owner.script, amount: BigInt(input.value) },
    });
  }
  for (const output of plan.outputs) {
    tx.addOutputAddress(output.address, BigInt(output.value), net.params);
  }
  const derivation = [[pubKey, { fingerprint: parseInt(account.xfp, 16), path: bip32Path(account.accountPath) }]];
  for (let i = 0; i < plan.inputs.length; i += 1) tx.updateInput(i, { bip32Derivation: derivation });
  const psbtBytes = tx.toPSBT();
  const psbtHex = hex.encode(psbtBytes);
  const binding = `btc:${account.address}:${account.accountPath}:${psbtHex}`;
  const session = createSession('btc', account, binding, ttlMs, requestId, now);
  const ur = new CryptoPSBT(psbtBytes).toUR();
  return {
    session,
    psbtHex,
    ur,
    urParts: encodeUrParts(ur),
  };
}

export function finalizeDigitalShieldBtcResponse({ session, unsignedPsbtHex, input, now = Date.now() }) {
  assertSessionOpen(session, now);
  assertBinding(session, `btc:${session.account.address}:${session.account.accountPath}:${unsignedPsbtHex}`);
  const ur = decodeUr(input, SUPPORTED_BTC_RESPONSE_UR_TYPES);
  const signedPsbtHex = bytesToHexString(CryptoPSBT.fromCBOR(Buffer.from(ur.cbor)).getPSBT());
  const signedPsbtBytes = hex.decode(signedPsbtHex);
  const original = BtcTransaction.fromPSBT(hex.decode(unsignedPsbtHex));
  const signed = BtcTransaction.fromPSBT(signedPsbtBytes);
  if (original.inputsLength !== signed.inputsLength || original.outputsLength !== signed.outputsLength) {
    throw new Error('DIGITAL_SHIELD_BTC_PSBT_SHAPE_MISMATCH');
  }
  for (let i = 0; i < original.inputsLength; i += 1) {
    const a = original.getInput(i);
    const b = signed.getInput(i);
    if (bytesToHex(a.txid) !== bytesToHex(b.txid) || a.index !== b.index || a.sequence !== b.sequence) {
      throw new Error('DIGITAL_SHIELD_BTC_INPUT_MISMATCH');
    }
  }
  for (let i = 0; i < original.outputsLength; i += 1) {
    const a = original.getOutput(i);
    const b = signed.getOutput(i);
    if (a.amount !== b.amount || bytesToHex(a.script) !== bytesToHex(b.script)) {
      throw new Error('DIGITAL_SHIELD_BTC_OUTPUT_MISMATCH');
    }
  }
  if (!signed.isFinal) signed.finalize();
  return {
    signedPsbtHex,
    finalizedTxHex: signed.hex,
    txid: signed.id,
    session: consumeSession(session, now),
  };
}

export function buildDigitalShieldSolRequest({ account, signDataHex, origin = DIGITAL_SHIELD_ORIGIN, ttlMs = DEFAULT_SESSION_TTL_MS, requestId, now = Date.now() }) {
  if (!account?.publicKeyHex || account.family !== 'solana') throw new Error('DIGITAL_SHIELD_SOL_ACCOUNT_REQUIRED');
  const normalizedSignData = ensureHex(signDataHex, 'sol_sign_data');
  if (normalizedSignData.length / 2 > MAX_SIGN_DATA_BYTES) throw new Error('DIGITAL_SHIELD_SOL_SIGN_DATA_TOO_LARGE');
  const binding = `sol:${account.address}:${account.accountPath}:${normalizedSignData}`;
  const session = createSession('solana', account, binding, ttlMs, requestId, now);
  const ur = solanaSdk.generateSignRequest({
    requestId: session.requestId,
    signData: normalizedSignData,
    dataType: KeystoneSolanaSDK.DataType.Transaction,
    path: account.accountPath,
    xfp: account.xfp,
    address: account.address,
    origin,
  });
  return {
    session,
    signDataHex: normalizedSignData,
    ur,
    urParts: encodeUrParts(ur),
  };
}

export function finalizeDigitalShieldSolResponse({ session, signDataHex, input, now = Date.now() }) {
  assertSessionOpen(session, now);
  const normalizedSignData = ensureHex(signDataHex, 'sol_sign_data');
  assertBinding(session, `sol:${session.account.address}:${session.account.accountPath}:${normalizedSignData}`);
  const ur = decodeUr(input, SUPPORTED_SOL_RESPONSE_UR_TYPES);
  const parsedSig = SolSignature.fromCBOR(Buffer.from(ur.cbor));
  const parsed = {
    requestId: uuidStringify(parsedSig.getRequestId()),
    signature: bytesToHexString(parsedSig.getSignature()),
  };
  if (ensureUuid(parsed.requestId) !== session.requestId) throw new Error('DIGITAL_SHIELD_REQUEST_ID_MISMATCH');
  const signature = hex.decode(ensureHex(parsed.signature, 'sol_signature'));
  const publicKey = hex.decode(session.account.publicKeyHex);
  const message = hex.decode(normalizedSignData);
  if (!ed25519.verify(signature, message, publicKey)) throw new Error('DIGITAL_SHIELD_SOL_SIGNATURE_INVALID');
  if (deriveSolAddressFromPublicKey(session.account.publicKeyHex) !== session.account.address) {
    throw new Error('DIGITAL_SHIELD_SOL_ADDRESS_BINDING_MISMATCH');
  }
  return {
    signatureHex: `0x${bytesToHex(signature)}`,
    session: consumeSession(session, now),
  };
}

export function getDigitalShieldNetworkSupport() {
  return {
    evm: [...SUPPORTED_EVM_CHAIN_IDS].map((chainId) => getNetworkInfo(getNetworkByChainId(chainId).key)?.key).filter(Boolean),
    btc: ['mainnet'],
    solana: ['mainnet'],
  };
}

export const digitalShieldProvider = Object.freeze({
  id: 'digital-shield',
  name: 'Digital Shield',
  parseImport: parseDigitalShieldImport,
  buildEvmRequest: buildDigitalShieldEvmRequest,
  finalizeEvmResponse: finalizeDigitalShieldEvmResponse,
  buildBtcPsbt: buildDigitalShieldBtcPsbt,
  finalizeBtcResponse: finalizeDigitalShieldBtcResponse,
  buildSolRequest: buildDigitalShieldSolRequest,
  finalizeSolResponse: finalizeDigitalShieldSolResponse,
  getNetworkSupport: getDigitalShieldNetworkSupport,
});
