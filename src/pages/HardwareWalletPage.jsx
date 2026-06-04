import { Cpu, ShieldCheck, Clock } from "lucide-react";

export default function HardwareWalletPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl border border-border bg-card"><Cpu className="h-6 w-6 text-primary" /></div>
        <div>
          <h1 className="text-xl font-bold">Hardware Wallets</h1>
          <p className="text-sm text-muted-foreground">Ledger / Trezor cold-key signing</p>
        </div>
      </div>

      <div className="p-5 rounded-xl border border-border bg-secondary/30">
        <div className="flex items-center gap-2 mb-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <p className="font-semibold">Planned — not yet available</p>
        </div>
        <p className="text-sm text-muted-foreground">
          Support for external hardware wallets (Ledger, Trezor and similar) is on the
          roadmap but is not built yet. This page is an honest placeholder — Veyrnox has
          no hardware-device integration today, and nothing here connects to a real device.
        </p>
      </div>

      <div className="p-5 rounded-xl border border-border bg-card space-y-2">
        <p className="font-semibold">When it ships</p>
        <p className="text-sm text-muted-foreground">
          The connected device will sign transactions itself, and the private key will
          stay on the device — it never gets imported into Veyrnox.
        </p>
      </div>

      <div className="p-5 rounded-xl border border-border bg-card space-y-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <p className="font-semibold">How your keys are secured today</p>
        </div>
        <p className="text-sm text-muted-foreground">
          For now, Veyrnox keeps your keys in its encrypted on-device vault, protected
          with Argon2id key derivation and AES-GCM encryption — not on external hardware.
        </p>
      </div>
    </div>
  );
}
