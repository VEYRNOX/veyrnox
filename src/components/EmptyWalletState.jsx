// src/components/EmptyWalletState.jsx — Zero-balance replacement screen.
// Priority 1 recommendation: single-purpose "Add funds" with named on-ramp routes.
import { Download, ArrowRightLeft, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { emit, FunnelEvent } from '@/lib/analytics';
import { useEffect } from 'react';

const routes = [
  { key: 'exchange', icon: ArrowRightLeft, label: 'From an exchange', desc: 'Send from Coinbase, Binance, Kraken, or any exchange to your address.' },
  { key: 'wallet', icon: Download, label: 'From another wallet', desc: 'Scan the QR or paste your address in any wallet app.' },
];

const transakRoute = { key: 'card', icon: CreditCard, label: 'Buy with card', desc: 'Purchase crypto directly with a debit or credit card.' };

export default function EmptyWalletState({ receiveAddress, onReceive, transakReady = false }) {
  useEffect(() => {
    Promise.resolve(emit(FunnelEvent.RECEIVE_ADDRESS_VIEWED, { source: 'empty_state' })).catch(() => {});
  }, []);

  const allRoutes = transakReady ? [...routes, transakRoute] : routes;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-6 text-center space-y-4">
        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
          <Download className="h-6 w-6 text-primary" />
        </div>
        <div className="space-y-1">
          <p className="text-base font-semibold">Add funds to get started</p>
          <p className="text-sm text-muted-foreground">
            Scan or share your address to receive crypto. Your keys never leave this device.
          </p>
        </div>
        <Button className="w-full gap-2" onClick={onReceive}>
          <Download className="h-4 w-4" /> Receive
        </Button>
      </div>

      <div className="space-y-2">
        {allRoutes.map((r) => (
          <div key={r.key} className="flex items-start gap-3 p-3 rounded-xl bg-card border border-border">
            <r.icon className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">{r.label}</p>
              <p className="text-xs text-muted-foreground">{r.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
