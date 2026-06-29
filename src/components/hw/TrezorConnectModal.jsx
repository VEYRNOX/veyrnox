import { useEffect } from 'react';
import { useTrezor } from '../../context/TrezorContext.jsx';

export function TrezorConnectModal({ open, onClose, onConnected, btcNetworkKey = 'btc-testnet' }) {
  const { connected, connecting, error, evmAddress, btcAddress, solAddress, connect, disconnect } = useTrezor();

  useEffect(() => {
    if (connected && onConnected) onConnected();
  }, [connected, onConnected]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Connect Trezor"
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(5,6,8,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div style={{ background: '#0D1117', border: '1px solid #1D222B', borderRadius: 12, padding: '32px 28px', width: 360, maxWidth: '90vw' }}>
        <h2 style={{ color: '#E8EAF0', fontFamily: 'Schibsted Grotesk, sans-serif', margin: '0 0 8px' }}>Connect Trezor</h2>
        <p style={{ color: '#8B929E', fontFamily: 'Schibsted Grotesk, sans-serif', fontSize: 14, margin: '0 0 24px' }}>
          {error
            ? <span style={{ color: '#FF6B6B' }}>{friendlyError(error)}</span>
            : connected ? 'Ready' : connecting ? 'Confirm addresses on your Trezor screen…' : 'Plug in your Trezor and unlock it'}
        </p>
        {connected && (
          <div style={{ marginBottom: 24 }}>
            <AddressRow label="EVM" address={evmAddress} />
            <AddressRow label="BTC" address={btcAddress} />
            <AddressRow label="SOL" address={solAddress} />
          </div>
        )}
        <div style={{ display: 'flex', gap: 12 }}>
          {!connected && (
            <button
              onClick={() => connect(btcNetworkKey)}
              disabled={connecting}
              style={{ flex: 1, padding: '12px 0', background: connecting ? '#1D222B' : '#4ADAC2', color: connecting ? '#8B929E' : '#050608', border: 'none', borderRadius: 8, fontFamily: 'Schibsted Grotesk, sans-serif', fontWeight: 600, fontSize: 15, cursor: connecting ? 'not-allowed' : 'pointer' }}
            >
              {connecting ? 'Connecting…' : 'Connect'}
            </button>
          )}
          {connected && (
            <button onClick={() => { disconnect(); onClose(); }} style={{ flex: 1, padding: '12px 0', background: '#1D222B', color: '#8B929E', border: 'none', borderRadius: 8, fontFamily: 'Schibsted Grotesk, sans-serif', fontWeight: 600, fontSize: 15, cursor: 'pointer' }}>
              Disconnect
            </button>
          )}
          <button onClick={onClose} style={{ flex: 1, padding: '12px 0', background: '#1D222B', color: '#8B929E', border: 'none', borderRadius: 8, fontFamily: 'Schibsted Grotesk, sans-serif', fontWeight: 600, fontSize: 15, cursor: 'pointer' }}>
            {connected ? 'Done' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddressRow({ label, address }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <span style={{ color: '#8B929E', fontFamily: 'Schibsted Grotesk, sans-serif', fontSize: 12 }}>{label} </span>
      <span style={{ color: '#4ADAC2', fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, wordBreak: 'break-all' }}>{address}</span>
    </div>
  );
}

function friendlyError(err) {
  if (err === 'TREZOR_UNSUPPORTED') return 'Trezor is not supported on this platform.';
  if (err === 'TREZOR_DENIABILITY_BLOCKED' || err.toLowerCase().includes('deniability')) {
    return 'Not available in this wallet mode.';
  }
  if (err.toLowerCase().includes('cancel')) return 'Cancelled on device.';
  if (err.toLowerCase().includes('firmware')) return 'Firmware update required. Open Trezor Suite to update.';
  return err;
}
