import { useState, useRef } from 'react';
import TransportWebHID from '@ledgerhq/hw-transport-webhid';
import Eth from '@ledgerhq/hw-app-eth';
import TrezorConnect from '@trezor/connect-web';
import { Copy, Cpu, CheckCircle, XCircle, Loader2, Usb, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

const STATUS = {
  IDLE: 'idle',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  ERROR: 'error',
};

const DEVICE = {
  LEDGER: 'ledger',
  TREZOR: 'trezor',
};

let trezorInitialised = false;
function ensureTrezorInit() {
  if (trezorInitialised) return;
  TrezorConnect.init({
    manifest: {
      email: 'al.jobson@21stclick.co.uk',
      appUrl: typeof window !== 'undefined' ? window.location.origin : 'https://veyrnox.app',
    },
    lazyLoad: true,
  });
  trezorInitialised = true;
}

function classifyLedgerError(err) {
  const msg = err?.message ?? '';
  if (
    msg.includes('No device selected') ||
    msg.includes('denied') ||
    msg.toLowerCase().includes('permission')
  ) {
    return 'Device permission denied.';
  }
  if (
    msg.toLowerCase().includes('locked') ||
    msg.includes('0x6b0c') ||
    msg.includes('0x6d00') ||
    msg.toLowerCase().includes('ethereum')
  ) {
    return 'Unlock your Ledger and open the Ethereum app.';
  }
  return err?.message || 'An unexpected error occurred.';
}

function classifyTrezorError(response) {
  const payload = response?.payload;
  if (!payload) return 'No response from Trezor Connect.';
  const msg = payload.error ?? '';
  if (msg.toLowerCase().includes('cancel') || msg.toLowerCase().includes('popup closed')) {
    return 'Connection cancelled.';
  }
  if (msg.toLowerCase().includes('permissions') || msg.toLowerCase().includes('denied')) {
    return 'Device permission denied.';
  }
  return msg || 'An unexpected error occurred.';
}

export default function HardwareWalletPage() {
  const [deviceType, setDeviceType] = useState(DEVICE.TREZOR);
  const [status, setStatus] = useState(STATUS.IDLE);
  const [ethAddress, setEthAddress] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [deviceName, setDeviceName] = useState(null);
  const ledgerTransportRef = useRef(null);

  const webHidSupported = typeof navigator !== 'undefined' && 'hid' in navigator;

  function selectDevice(type) {
    if (status === STATUS.CONNECTED || status === STATUS.CONNECTING) return;
    setDeviceType(type);
    setStatus(STATUS.IDLE);
    setEthAddress(null);
    setErrorMsg(null);
    setDeviceName(null);
  }

  async function connectLedger() {
    setStatus(STATUS.CONNECTING);
    setErrorMsg(null);
    setEthAddress(null);
    setDeviceName(null);

    try {
      const transport = await TransportWebHID.create();
      ledgerTransportRef.current = transport;

      const rawDevice = /** @type {any} */ (transport).device;
      if (rawDevice?.productName) setDeviceName(rawDevice.productName);

      const eth = new Eth(transport);
      const result = await eth.getAddress("44'/60'/0'/0/0");

      setEthAddress(result.address);
      setStatus(STATUS.CONNECTED);
    } catch (err) {
      setErrorMsg(classifyLedgerError(err));
      setStatus(STATUS.ERROR);
      if (ledgerTransportRef.current) {
        try { await ledgerTransportRef.current.close(); } catch (_) {}
        ledgerTransportRef.current = null;
      }
    }
  }

  async function connectTrezor() {
    setStatus(STATUS.CONNECTING);
    setErrorMsg(null);
    setEthAddress(null);
    setDeviceName(null);

    try {
      ensureTrezorInit();
      const response = await TrezorConnect.ethereumGetAddress({
        path: "m/44'/60'/0'/0/0",
        showOnTrezor: true,
      });

      if (!response.success) {
        setErrorMsg(classifyTrezorError(response));
        setStatus(STATUS.ERROR);
        return;
      }

      setEthAddress(response.payload.address);
      setDeviceName('Trezor');
      setStatus(STATUS.CONNECTED);
    } catch (err) {
      setErrorMsg(err?.message || 'An unexpected error occurred.');
      setStatus(STATUS.ERROR);
    }
  }

  async function connect() {
    if (deviceType === DEVICE.LEDGER) {
      await connectLedger();
    } else {
      await connectTrezor();
    }
  }

  async function disconnect() {
    if (ledgerTransportRef.current) {
      try { await ledgerTransportRef.current.close(); } catch (_) {}
      ledgerTransportRef.current = null;
    }
    setStatus(STATUS.IDLE);
    setEthAddress(null);
    setDeviceName(null);
    setErrorMsg(null);
  }

  function copyAddress() {
    if (!ethAddress) return;
    navigator.clipboard.writeText(ethAddress).then(() => {
      toast.success('Address copied to clipboard');
    });
  }

  const isLedger = deviceType === DEVICE.LEDGER;
  const connectDisabled = isLedger && !webHidSupported;
  const connectLabel = isLedger ? 'Connect Ledger' : 'Connect Trezor';
  const connectHint = isLedger
    ? 'Connect your Ledger, unlock it, and open the Ethereum app before clicking below.'
    : 'Click below — a Trezor Connect popup will open. Approve on your device when prompted.';

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-muted">
          <Cpu className="h-6 w-6 text-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Hardware Wallet</h1>
          <p className="text-sm text-muted-foreground">Ledger & Trezor — ETH address derivation</p>
        </div>
      </div>

      {/* Device picker */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <p className="text-sm font-medium">Select device</p>
        <div className="flex gap-3">
          {[DEVICE.TREZOR, DEVICE.LEDGER].map((type) => {
            const active = deviceType === type;
            const label = type === DEVICE.TREZOR ? 'Trezor' : 'Ledger';
            const disabled = status === STATUS.CONNECTING ||
              (status === STATUS.CONNECTED && deviceType !== type);
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

      {/* Browser support warning — Ledger only */}
      {isLedger && !webHidSupported && (
        <div className="rounded-xl border border-yellow-400/40 bg-yellow-50 dark:bg-yellow-950/20 px-4 py-3 flex items-start gap-3">
          <XCircle className="h-5 w-5 text-yellow-600 mt-0.5 shrink-0" />
          <p className="text-sm text-yellow-800 dark:text-yellow-300">
            <span className="font-medium">WebHID not supported in this browser.</span>{' '}
            Chrome or Edge is required to connect a Ledger device.
          </p>
        </div>
      )}

      {/* Connection card */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Usb className="h-5 w-5 text-muted-foreground" />
          <h2 className="font-medium">{isLedger ? 'Ledger' : 'Trezor'} Connection</h2>
        </div>

        {/* IDLE */}
        {status === STATUS.IDLE && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{connectHint}</p>
            <button
              onClick={connect}
              disabled={connectDisabled}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Usb className="h-4 w-4" />
              {connectLabel}
            </button>
          </div>
        )}

        {/* CONNECTING */}
        {status === STATUS.CONNECTING && (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span>
              {isLedger
                ? 'Connecting… approve the HID request in your browser if prompted.'
                : 'Waiting for Trezor Connect popup… approve on your device.'}
            </span>
          </div>
        )}

        {/* CONNECTED */}
        {status === STATUS.CONNECTED && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 font-medium">
              <CheckCircle className="h-4 w-4" />
              <span>Connected{deviceName ? ` — ${deviceName}` : ''}</span>
            </div>

            {ethAddress && (
              <div className="rounded-lg bg-muted px-4 py-3 space-y-1">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                  ETH Address (m/44&apos;/60&apos;/0&apos;/0/0)
                </p>
                <div className="flex items-center gap-2">
                  <code className="text-sm font-mono break-all flex-1">{ethAddress}</code>
                  <button
                    onClick={copyAddress}
                    className="shrink-0 p-1.5 rounded-md hover:bg-accent transition-colors"
                    title="Copy address"
                  >
                    <Copy className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
              </div>
            )}

            <button
              onClick={disconnect}
              className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
            >
              Disconnect
            </button>
          </div>
        )}

        {/* ERROR */}
        {status === STATUS.ERROR && (
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
        <ShieldCheck className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Your private key never leaves the device.</span>{' '}
          VEYRNOX reads your public address only. No seed phrase or private key is transmitted.
        </p>
      </div>

      {/* Transaction signing — coming soon */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3 opacity-60">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="h-5 w-5 text-muted-foreground" />
            <h2 className="font-medium">Transaction Signing</h2>
          </div>
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
            Coming soon
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          When you send ETH, the unsigned transaction will be routed to your connected hardware
          wallet for on-device signing. Your key stays on the device — VEYRNOX only broadcasts the
          signed transaction.
        </p>
      </div>

      {/* Honest limits */}
      <div className="rounded-xl border border-border bg-muted/40 px-5 py-3">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Current limits:</span>{' '}
          BTC and SOL hardware wallet signing are not yet wired. This release supports ETH address
          derivation only (Ledger and Trezor).
        </p>
      </div>
    </div>
  );
}
