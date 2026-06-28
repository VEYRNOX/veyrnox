import { createContext, useContext, useState, useCallback } from 'react';
import { getTransport } from '../wallet-core/hw/transport.js';
import { getTrezorEvmAddress, getTrezorBtcAddress, getTrezorSolAddress } from '../wallet-core/hw/trezorAddress.js';

const TrezorContext = createContext(null);

export function TrezorProvider({ children }) {
  const platform = getTransport().type;
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [evmAddress, setEvmAddress] = useState(null);
  const [btcAddress, setBtcAddress] = useState(null);
  const [solAddress, setSolAddress] = useState(null);

  const connect = useCallback(async (btcNetworkKey = 'btc-testnet') => {
    if (platform === 'unsupported') { setError('TREZOR_UNSUPPORTED'); return; }
    setConnecting(true);
    setError(null);
    try {
      const [evm, btc, sol] = await Promise.all([
        getTrezorEvmAddress(),
        getTrezorBtcAddress(btcNetworkKey),
        getTrezorSolAddress(),
      ]);
      setEvmAddress(evm);
      setBtcAddress(btc);
      setSolAddress(sol);
      setConnected(true);
    } catch (err) {
      setError(err.message);
      setConnected(false);
    } finally {
      setConnecting(false);
    }
  }, [platform]);

  const disconnect = useCallback(() => {
    setConnected(false);
    setEvmAddress(null);
    setBtcAddress(null);
    setSolAddress(null);
    setError(null);
  }, []);

  return (
    <TrezorContext.Provider value={{ connected, connecting, error, platform, evmAddress, btcAddress, solAddress, connect, disconnect }}>
      {children}
    </TrezorContext.Provider>
  );
}

export function useTrezor() {
  const ctx = useContext(TrezorContext);
  if (!ctx) throw new Error('useTrezor must be used within TrezorProvider');
  return ctx;
}
