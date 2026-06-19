import { useState } from 'react';
import { Copy, Cpu, CheckCircle, XCircle, Loader2, Usb, ShieldCheck, Send } from 'lucide-react';
import { toast } from 'sonner';
import { useHardwareWallet, DEVICE } from '@/context/HardwareWalletContext';
import { signAndBroadcastEvmLedger, signAndBroadcastEvmTrezor } from '@/wallet-core/evm/hw-send';
import { signAndBroadcastBtcLedger, signAndBroadcastBtcTrezor } from '@/wallet-core/btc/hw-send';
import { signAndBroadcastSolLedger, signAndBroadcastSolTrezor } from '@/wallet-core/sol/hw-send';

// ── Helpers ───────────────────────────────────────────────────────────────────

function CopyButton({ value }) {
  function copy() {
    navigator.clipboard.writeText(value).then(() => toast.success('Copied'));
  }
  return (
    <button onClick={copy} className="shrink-0 p-1.5 rounded-md hover:bg-accent transition-colors" title="Copy">
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
        <code className="text-sm font-mono break-all flex-1 text-[#4ADAC2]">{address}</code>
        <CopyButton value={address} />
      </div>
    </div>
  );
}

// ── Inline send form ──────────────────────────────────────────────────────────

function HwSendForm({ chain, networkKey, address, publicKeyHex, transport, deviceType }) {
  const [to, setTo]         = useState('');
  const [amount, setAmount] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult]   = useState(null);
  const [err, setErr]         = useState(null);

  const isLedger = deviceType === DEVICE.LEDGER;

  async function send(e) {
    e.preventDefault();
    setSending(true);
    setErr(null);
    setResult(null);
    try {
      let res;
      if (chain === 'eth') {
        res = isLedger
          ? await signAndBroadcastEvmLedger({ transport: transport.current, networkKey, fromAddress: address, to, amountEth: amount })
          : await signAndBroadcastEvmTrezor({ networkKey, fromAddress: address, to, amountEth: amount });
        setResult({ id: res.hash, url: res.explorerUrl });
      } else if (chain === 'btc') {
        res = isLedger
          ? await signAndBroadcastBtcLedger({ transport: transport.current, networkKey, fromAddress: address, btcPublicKeyHex: publicKeyHex, toAddress: to, amountSats: Math.round(parseFloat(amount) * 1e8) })
          : await signAndBroadcastBtcTrezor({ networkKey, fromAddress: address, btcPublicKeyHex: publicKeyHex, toAddress: to, amountSats: Math.round(parseFloat(amount) * 1e8) });
        setResult({ id: res.txid, url: res.explorerUrl });
      } else {
        res = isLedger
          ? await signAndBroadcastSolLedger({ transport: transport.current, networkKey, fromAddress: address, toAddress: to, amountLamports: Math.round(parseFloat(amount) * 1e9) })
          : await signAndBroadcastSolTrezor({ networkKey, fromAddress: address, toAddress: to, amountLamports: Math.round(parseFloat(amount) * 1e9) });
        setResult({ id: res.signature, url: res.explorerUrl });
      }
      toast.success('Transaction broadcast');
    } catch (e) {
      setErr(e?.message ?? 'Send failed');
    } finally {
      setSending(false);
    }
  }

  const labels = { eth: 'ETH amount', btc: 'BTC amount', sol: 'SOL amount' };
  const placeholders = { eth: '0.001', btc: '0.0001', sol: '0.01' };

  return (
    <form onSubmit={send} className="space-y-3 pt-3 border-t border-border">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Send</p>
      <div className="space-y-2">
        <input
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="Recipient address"
          value={to}
          onChange={e => setTo(e.target.value)}
          required
        />
        <input
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder={`${labels[chain]} (e.g. ${placeholders[chain]})`}
          value={amount}
          onChange={e => setAmount(e.target.value)}
          required
          type="number"
          step="any"
          min="0"
        />
      </div>
      <button
        type="submit"
        disabled={sending}
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        {sending ? 'Waiting for device…' : `Send ${chain.toUpperCase()}`}
      </button>
      {err && (
        <div className="flex items-start gap-2 text-sm text-destructive">
          <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{err}</span>
        </div>
      )}
      {result && (
        <div className="rounded-lg bg-muted px-4 py-3 space-y-1">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1">
            <CheckCircle className="h-3.5 w-3.5 text-[#4ADAC2]" /> Broadcast
          </p>
          <div className="flex items-center gap-2">
            <code className="text-xs font-mono break-all flex-1">{result.id}</code>
            <CopyButton value={result.id} />
          </div>
          <a
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[#4ADAC2] underline underline-offset-2 hover:text-[#4ADAC2]/80"
          >
            View on explorer
          </a>
        </div>
      )}
    </form>
  );
}

// ── Chain card ────────────────────────────────────────────────────────────────

function ChainCard({ title, addressLabel, address, publicKeyHex, chain, networkKey, transport, deviceType }) {
  if (!address) return null;
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <h2 className="font-medium">{title}</h2>
      <AddressRow label={addressLabel} address={address} />
      <HwSendForm
        chain={chain}
        networkKey={networkKey}
        address={address}
        publicKeyHex={publicKeyHex}
        transport={transport}
        deviceType={deviceType}
      />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HardwareWalletPage() {
  const hw = useHardwareWallet();

  const {
    deviceType, status, errorMsg, deviceName,
    ethAddress, btcAddress, solAddress,
    btcPublicKeyHex, transport,
    connect, disconnect, selectDevice,
    webHidSupported,
  } = hw;

  const isLedger  = deviceType === DEVICE.LEDGER;
  const connected = status === 'connected';

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-muted">
          <Cpu className="h-6 w-6 text-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Hardware Wallet</h1>
          <p className="text-sm text-muted-foreground">Ledger & Trezor — ETH · BTC · SOL</p>
        </div>
      </div>

      {/* Device picker */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <p className="text-sm font-medium">Select device</p>
        <div className="flex gap-3">
          {[DEVICE.TREZOR, DEVICE.LEDGER].map((type) => {
            const active   = deviceType === type;
            const label    = type === DEVICE.TREZOR ? 'Trezor' : 'Ledger';
            const disabled = status === 'connecting' || (connected && deviceType !== type);
            return (
              <button
                key={type}
                onClick={() => selectDevice(type)}
                disabled={disabled}
                className={[
                  'flex-1 rounded-lg border px-4 py-3 text-sm font-medium transition-colors',
                  active
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-background text-muted-foreground hover:bg-accent',
                  disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
                ].join(' ')}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* WebHID warning — Ledger only */}
      {isLedger && !webHidSupported && (
        <div className="rounded-xl border border-yellow-400/40 bg-yellow-50 dark:bg-yellow-950/20 px-4 py-3 flex items-start gap-3">
          <XCircle className="h-5 w-5 text-yellow-600 mt-0.5 shrink-0" />
          <p className="text-sm text-yellow-800 dark:text-yellow-300">
            <span className="font-medium">WebHID not supported in this browser.</span>{' '}
            Chrome or Edge is required for Ledger.
          </p>
        </div>
      )}

      {/* Connection card */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Usb className="h-5 w-5 text-muted-foreground" />
          <h2 className="font-medium">{isLedger ? 'Ledger' : 'Trezor'} Connection</h2>
        </div>

        {status === 'idle' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {isLedger
                ? 'Connect your Ledger, unlock it, and open the relevant app before clicking below.'
                : 'Click below — a Trezor Connect popup will open. Approve each address on your device.'}
            </p>
            <button
              onClick={connect}
              disabled={isLedger && !webHidSupported}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Usb className="h-4 w-4" />
              Connect {isLedger ? 'Ledger' : 'Trezor'}
            </button>
          </div>
        )}

        {status === 'connecting' && (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span>
              {isLedger
                ? 'Connecting — approve the HID request, then approve each address on the device.'
                : 'Waiting for Trezor Connect popup — approve each address on your device.'}
            </span>
          </div>
        )}

        {connected && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-[#4ADAC2] font-medium">
              <CheckCircle className="h-4 w-4" />
              <span>Connected{deviceName ? ` — ${deviceName}` : ''}</span>
            </div>
            <button
              onClick={disconnect}
              className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
            >
              Disconnect
            </button>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 text-sm text-destructive">
              <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button
              onClick={connect}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
            >
              <Loader2 className="h-4 w-4" />
              Retry
            </button>
          </div>
        )}
      </div>

      {/* Security note */}
      <div className="rounded-xl border border-border bg-card px-5 py-4 flex items-start gap-3">
        <ShieldCheck className="h-5 w-5 text-[#4ADAC2] shrink-0 mt-0.5" />
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Your private key never leaves the device.</span>{' '}
          VEYRNOX reads your public addresses only and routes unsigned transactions to the device
          for on-device signing. No seed phrase or private key is transmitted.
        </p>
      </div>

      {/* Per-chain cards — only visible when connected */}
      {connected && (
        <>
          <ChainCard
            title="Ethereum (ETH)"
            addressLabel="ETH Address (m/44'/60'/0'/0/0)"
            address={ethAddress}
            chain="eth"
            networkKey="sepolia"
            transport={transport}
            deviceType={deviceType}
          />
          <ChainCard
            title="Bitcoin (BTC)"
            addressLabel="BTC Address (m/84'/1'/0'/0/0 — testnet)"
            address={btcAddress}
            publicKeyHex={btcPublicKeyHex}
            chain="btc"
            networkKey="testnet"
            transport={transport}
            deviceType={deviceType}
          />
          <ChainCard
            title="Solana (SOL)"
            addressLabel="SOL Address (m/44'/501'/0'/0')"
            address={solAddress}
            chain="sol"
            networkKey="devnet"
            transport={transport}
            deviceType={deviceType}
          />
        </>
      )}

      {/* Honest limits */}
      <div className="rounded-xl border border-border bg-muted/40 px-5 py-3">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Status:</span>{' '}
          Address derivation and transaction signing are BUILT for ETH, BTC, and SOL on both
          Ledger and Trezor. Unverified — no on-device testnet txid confirmed yet. ERC-20
          hardware signing and multi-account paths are not yet wired.
        </p>
      </div>
    </div>
  );
}
