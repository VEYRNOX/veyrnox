import { useState } from 'react';
import { Copy, Cpu, Usb, XCircle } from 'lucide-react';
import { toast } from '@/lib/toast';
import { useTrezor } from '@/context/TrezorContext';
import { TrezorConnectModal } from '@/components/hw/TrezorConnectModal';

// Hardware-wallet page. Trezor is wired through TrezorContext (the same context that
// drives the Send-screen Trezor flow); the old multi-device HardwareWalletContext was
// removed. Address derivation runs entirely on-device (I1: no key leaves the device);
// the deniability guard in trezorAddress.js / trezor.js blocks all Trezor calls when
// deniability mode is active (I3). Ledger support is not wired on this surface.

function CopyButton({ value }) {
  function copy() {
    navigator.clipboard.writeText(value).then(() => toast.success('Copied'));
  }
  return (
    <button onClick={copy} className="shrink-0 p-1.5 rounded-md hover:bg-accent transition-colors" title="Copy" aria-label="Copy">
      <Copy className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}

function AddressRow({ label, address }) {
  if (!address) return null;
  return (
    <div className="rounded-lg bg-muted px-4 py-3 space-y-1">
      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{label}</p>
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm break-all text-foreground">{address}</span>
        <CopyButton value={address} />
      </div>
    </div>
  );
}

export default function HardwareWalletPage() {
  const { connected, platform, evmAddress, btcAddress, solAddress, disconnect } = useTrezor();
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-muted">
          <Cpu className="h-6 w-6 text-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Hardware Wallet</h1>
          <p className="text-sm text-muted-foreground">Trezor — ETH · BTC · SOL</p>
        </div>
      </div>

      {platform === 'unsupported' && (
        <div className="rounded-xl border border-caution/40 bg-caution/10 px-5 py-4 space-y-2">
          <div className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-caution shrink-0" aria-hidden="true" />
            <p className="text-sm font-medium text-caution">
              Hardware wallet not available in this app
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            Trezor uses WebUSB, which isn&apos;t available in this browser — try Chrome or Edge on desktop.
          </p>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Usb className="h-5 w-5 text-muted-foreground" />
          <h2 className="font-medium">Trezor Connection</h2>
        </div>

        {connected ? (
          <div className="space-y-3">
            <AddressRow label="EVM" address={evmAddress} />
            <AddressRow label="BTC" address={btcAddress} />
            <AddressRow label="SOL" address={solAddress} />
            <button
              onClick={disconnect}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent transition-colors"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Plug in your Trezor, unlock it, and confirm each address on the device screen.
            </p>
            <button
              onClick={() => setModalOpen(true)}
              disabled={platform === 'unsupported'}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Usb className="h-4 w-4" />
              Connect Trezor
            </button>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-muted/40 px-5 py-3">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Status:</span>{' '}
          Trezor address derivation and transaction signing are wired for ETH, BTC, and SOL.
          The private key never leaves the device (I1). Ledger and token (ERC-20) hardware
          signing are not wired on this surface.
        </p>
      </div>

      <TrezorConnectModal open={modalOpen} onClose={() => setModalOpen(false)} onConnected={() => setModalOpen(false)} />
    </div>
  );
}
