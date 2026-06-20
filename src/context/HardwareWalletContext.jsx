// context/HardwareWalletContext.jsx
//
// Shared hardware wallet session: device type, WebHID transport (Ledger only),
// and all three chain addresses derived from the connected device. Consumed by
// HardwareWalletPage and the hw-send modules. Mounted in App above WalletGate
// so the connected device persists across route changes.
//
// Security invariants preserved:
//   I1 — no private key ever reaches this context. Only public addresses / keys.
//   I3 — Trezor makes no backend calls from this context (Connect popup is user-gated).

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import TransportWebHID from '@ledgerhq/hw-transport-webhid';
import Eth from '@ledgerhq/hw-app-eth';
import AppBtc from '@ledgerhq/hw-app-btc';
import AppSolana from '@ledgerhq/hw-app-solana';
import TrezorConnect from '@trezor/connect-web';
import { PublicKey } from '@solana/web3.js';
import { hex } from '@scure/base';

export const DEVICE = { LEDGER: 'ledger', TREZOR: 'trezor' };

// BIP-44/84 paths (testnet coin-type 1 for BTC; SOL uses 501)
const EVM_PATH  = "44'/60'/0'/0/0";
const BTC_PATH  = "84'/1'/0'/0/0";      // P2WPKH testnet; mainnet = 84'/0'/0'/0/0
const SOL_PATH  = "44'/501'/0'/0'";

// BIP32 xpub version bytes for testnet (tpub)
const TPUB_VERSION = 0x043587CF;

let trezorInitialised = false;
function ensureTrezorInit() {
  if (trezorInitialised) return;
  TrezorConnect.init({
    manifest: {
      appName: 'Veyrnox',
      email: 'al.jobson@21stclick.co.uk',
      appUrl: typeof window !== 'undefined' ? window.location.origin : 'https://veyrnox.app',
    },
    lazyLoad: true,
  });
  trezorInitialised = true;
}

const HardwareWalletContext = createContext(null);

export function HardwareWalletProvider({ children }) {
  const [deviceType, setDeviceType] = useState(DEVICE.TREZOR);
  const [status, setStatus]         = useState('idle'); // idle | connecting | connected | error
  const [errorMsg, setErrorMsg]     = useState(null);
  const [deviceName, setDeviceName] = useState(null);

  // Derived addresses (public — safe to hold in state)
  const [ethAddress, setEthAddress] = useState(null);
  const [btcAddress, setBtcAddress] = useState(null);
  const [solAddress, setSolAddress] = useState(null);

  // BTC compressed public key (hex) — needed by btc/hw-send for P2WPKH witness script
  const [btcPublicKeyHex, setBtcPublicKeyHex] = useState(null);
  // SOL public key (base58) == solAddress, kept separate for clarity
  const [solPublicKeyHex, setSolPublicKeyHex] = useState(null);

  // Ledger WebHID transport — kept as a ref so it doesn't trigger re-renders
  const transportRef = useRef(null);

  const reset = useCallback(() => {
    setStatus('idle');
    setErrorMsg(null);
    setDeviceName(null);
    setEthAddress(null);
    setBtcAddress(null);
    setSolAddress(null);
    setBtcPublicKeyHex(null);
    setSolPublicKeyHex(null);
  }, []);

  // ── Ledger ────────────────────────────────────────────────────────────────

  async function connectLedger() {
    const transport = await TransportWebHID.create();
    transportRef.current = transport;

    const rawDevice = /** @type {any} */ (transport).device;
    if (rawDevice?.productName) setDeviceName(rawDevice.productName);

    // ETH
    const eth = new Eth(transport);
    const ethResult = await eth.getAddress(EVM_PATH);
    setEthAddress(ethResult.address);

    // BTC
    const btc = new AppBtc({ transport, currency: 'bitcoin_testnet' });
    const btcResult = await btc.getWalletPublicKey(BTC_PATH, { format: 'bech32' });
    setBtcAddress(btcResult.bitcoinAddress);
    setBtcPublicKeyHex(btcResult.publicKey);

    // SOL
    const sol = new AppSolana(transport);
    const solResult = await sol.getAddress(SOL_PATH);
    const solPubkey = new PublicKey(solResult.address); // address is raw 32-byte Buffer
    setSolAddress(solPubkey.toBase58());
    setSolPublicKeyHex(Buffer.from(solResult.address).toString('hex'));
  }

  // ── Trezor ────────────────────────────────────────────────────────────────

  async function connectTrezor() {
    ensureTrezorInit();

    // Request all three addresses in parallel — each opens the Trezor popup once
    const [ethRes, btcRes, solRes] = await Promise.all([
      TrezorConnect.ethereumGetAddress({ path: `m/${EVM_PATH}`, showOnTrezor: true }),
      TrezorConnect.getAddress({ path: `m/${BTC_PATH}`, coin: 'test', showOnTrezor: true }),
      TrezorConnect.solanaGetAddress({ path: `m/${SOL_PATH}`, showOnTrezor: true }),
    ]);

    if (!ethRes.success) throw new Error((ethRes.payload && 'error' in ethRes.payload ? ethRes.payload.error : null) ?? 'ETH address failed');
    if (!btcRes.success) throw new Error((btcRes.payload && 'error' in btcRes.payload ? btcRes.payload.error : null) ?? 'BTC address failed');
    if (!solRes.success) throw new Error((solRes.payload && 'error' in solRes.payload ? solRes.payload.error : null) ?? 'SOL address failed');

    setDeviceName('Trezor');
    setEthAddress(ethRes.payload.address);
    setBtcAddress(btcRes.payload.address);
    setSolAddress(solRes.payload.address);

    // Trezor: fetch public keys for signing
    const btcPkRes = await TrezorConnect.getPublicKey({ path: `m/${BTC_PATH}`, coin: 'test' });
    if (btcPkRes.success) setBtcPublicKeyHex(btcPkRes.payload.publicKey);

    // SOL pubkey == address bytes (ed25519 public key in base58)
    setSolPublicKeyHex(
      Buffer.from(new PublicKey(solRes.payload.address).toBytes()).toString('hex')
    );
  }

  // ── Public API ────────────────────────────────────────────────────────────

  const connect = useCallback(async () => {
    setStatus('connecting');
    setErrorMsg(null);
    try {
      if (deviceType === DEVICE.LEDGER) {
        await connectLedger();
      } else {
        await connectTrezor();
      }
      setStatus('connected');
    } catch (err) {
      setErrorMsg(classifyError(err, deviceType));
      setStatus('error');
      if (transportRef.current) {
        try { await transportRef.current.close(); } catch (_) {}
        transportRef.current = null;
      }
    }
  }, [deviceType]); // eslint-disable-line react-hooks/exhaustive-deps

  const disconnect = useCallback(async () => {
    if (transportRef.current) {
      try { await transportRef.current.close(); } catch (_) {}
      transportRef.current = null;
    }
    reset();
  }, [reset]);

  const selectDevice = useCallback((type) => {
    if (status === 'connected' || status === 'connecting') return;
    setDeviceType(type);
    reset();
  }, [status, reset]);

  return (
    <HardwareWalletContext.Provider value={{
      // State
      deviceType, status, errorMsg, deviceName,
      ethAddress, btcAddress, solAddress,
      btcPublicKeyHex, solPublicKeyHex,
      // Transport ref — passed to hw-send for Ledger signing
      transport: transportRef,
      // Actions
      connect, disconnect, selectDevice,
      webHidSupported: typeof navigator !== 'undefined' && 'hid' in navigator,
    }}>
      {children}
    </HardwareWalletContext.Provider>
  );
}

export function useHardwareWallet() {
  const ctx = useContext(HardwareWalletContext);
  if (!ctx) throw new Error('useHardwareWallet must be used inside HardwareWalletProvider');
  return ctx;
}

function classifyError(err, deviceType) {
  const msg = err?.message ?? '';
  if (msg.includes('No device selected') || msg.includes('denied') || msg.toLowerCase().includes('permission')) {
    return 'Device permission denied.';
  }
  if (deviceType === DEVICE.LEDGER) {
    if (msg.toLowerCase().includes('locked') || msg.includes('0x6b0c') || msg.includes('0x6d00')) {
      return 'Unlock your Ledger and open the required app.';
    }
    if (msg.toLowerCase().includes('0x6e01') || msg.toLowerCase().includes('app')) {
      return 'Open the correct app on your Ledger (Ethereum / Bitcoin / Solana).';
    }
  }
  if (msg.toLowerCase().includes('cancel') || msg.toLowerCase().includes('popup closed')) {
    return 'Connection cancelled.';
  }
  return msg || 'An unexpected error occurred.';
}
