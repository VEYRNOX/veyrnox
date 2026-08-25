// @ts-nocheck
import { useMemo, useState } from 'react';
import { Copy, Cpu, QrCode, Shield, Trash2 } from 'lucide-react';
import { toast } from '@/lib/toast';
import { useDigitalShield } from '@/context/DigitalShieldContext';
import QRScanner from '@/components/QRScanner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

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

function AddressRow({ label, address, path }) {
  if (!address) return null;
  return (
    <div className="rounded-lg bg-muted px-4 py-3 space-y-1">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{label}</p>
        {path ? <span className="text-[10px] text-muted-foreground font-mono">{path}</span> : null}
      </div>
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm break-all text-foreground">{address}</span>
        <CopyButton value={address} />
      </div>
    </div>
  );
}

function normalizeUrScan(raw) {
  const trimmed = String(raw || '').trim();
  if (!/^ur:/i.test(trimmed) || trimmed.length > 2048) return null;
  return trimmed.toUpperCase();
}

export default function HardwareWalletPage() {
  const {
    connected: digitalShieldConnected,
    profile,
    importProfile,
    clearProfile,
    evmAccount,
    btcAccount,
    solAccount,
  } = useDigitalShield();
  const [importOpen, setImportOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [importParts, setImportParts] = useState([]);
  const [importDraft, setImportDraft] = useState('');
  const [importError, setImportError] = useState('');

  const importPreview = useMemo(() => importParts.join('\n'), [importParts]);

  function openScanner() {
    // Avoid stacking the dialog focus trap behind the full-screen scanner on
    // Android; monkey exposed this as an ANR with no focused window.
    setImportOpen(false);
    setScannerOpen(true);
  }

  const tryImport = async (input) => {
    try {
      const parsed = await importProfile(input);
      setImportError('');
      setImportParts([]);
      setImportDraft('');
      setImportOpen(false);
      toast.success('Digital Shield imported');
      return parsed;
    } catch (err) {
      const msg = err?.message || 'Could not import this Digital Shield QR.';
      setImportError(msg);
      return null;
    }
  };

  const addImportPart = (part) => {
    setImportParts((current) => {
      const next = current.includes(part) ? current : [...current, part];
      void tryImport(next);
      return next;
    });
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-muted">
          <Cpu className="h-6 w-6 text-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Hardware Wallet</h1>
          <p className="text-sm text-muted-foreground">Digital Shield air-gap signing</p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-muted-foreground" />
          <h2 className="font-medium">Digital Shield Air-Gap</h2>
        </div>

        {digitalShieldConnected ? (
          <div className="space-y-3">
            <div className="rounded-lg bg-secondary/40 border border-border px-4 py-3 text-xs text-muted-foreground">
              Imported public account data only. Private keys stay on the Digital Shield device.
            </div>
            <AddressRow label="EVM" address={evmAccount?.address} path={evmAccount?.accountPath} />
            <AddressRow label="BTC" address={btcAccount?.address} path={btcAccount?.accountPath} />
            <AddressRow label="SOL" address={solAccount?.address} path={solAccount?.accountPath} />
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              {profile?.masterFingerprint ? <span className="font-mono">XFP {profile.masterFingerprint.toUpperCase()}</span> : null}
              {profile?.device ? <span>{profile.device}</span> : null}
              {profile?.deviceVersion ? <span>v{profile.deviceVersion}</span> : null}
            </div>
            <Button variant="outline" className="gap-2" onClick={clearProfile}>
              <Trash2 className="h-4 w-4" />
              Clear Digital Shield
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Import the device&apos;s `crypto-multi-accounts` QR to use Digital Shield as an air-gapped signer for supported networks.
            </p>
            <Button onClick={() => setImportOpen(true)} className="gap-2">
              <QrCode className="h-4 w-4" />
              Import Digital Shield
            </Button>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-muted/40 px-5 py-3">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Status:</span>{' '}
          Digital Shield import plus QR-based signing is wired for supported air-gap flows and rejects ambiguous EVM account imports instead of guessing.
        </p>
      </div>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import Digital Shield</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <p className="text-sm text-muted-foreground">
              Scan or paste the `crypto-multi-accounts` UR from your Digital Shield device. Veyrnox will import public account data only.
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="gap-2" onClick={openScanner}>
                <QrCode className="h-4 w-4" />
                Scan QR
              </Button>
              {importParts.length > 0 && (
                <Button type="button" variant="ghost" onClick={() => { setImportParts([]); setImportError(''); }}>
                  Clear scanned parts
                </Button>
              )}
            </div>
            {importParts.length > 0 && (
              <div className="rounded-lg bg-secondary/40 border border-border p-3 text-xs text-muted-foreground">
                Scanned parts: {importParts.length}
              </div>
            )}
            <Label htmlFor="digital-shield-import-ur">Digital Shield account UR</Label>
            <textarea
              id="digital-shield-import-ur"
              value={importDraft || importPreview}
              onChange={(e) => setImportDraft(e.target.value)}
              placeholder="Paste one UR or multiple UR parts here"
              className="min-h-32 w-full rounded-lg border border-input bg-background px-3 py-2 text-xs font-mono"
            />
            {importError ? (
              <p className="text-xs text-destructive break-all">{importError}</p>
            ) : null}
            <Button className="w-full" onClick={() => { void tryImport(importDraft || importParts); }}>
              Import Public Accounts
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {scannerOpen && (
        <QRScanner
          parse={normalizeUrScan}
          title="Scan Digital Shield QR"
          helperText="Scan each UR fragment from the device. If the import uses multiple parts, reopen the scanner for the next fragment."
          onScan={(value) => {
            addImportPart(value);
            setScannerOpen(false);
            setImportOpen(true);
          }}
          onClose={() => {
            setScannerOpen(false);
            setImportOpen(true);
          }}
        />
      )}
    </div>
  );
}
