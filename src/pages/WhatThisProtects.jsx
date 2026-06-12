import { Lock, KeyRound, Smartphone, Cpu, Shield } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// "What your PIN protects — and what it doesn't" (Phase 2 — seized-device PIN
// disclosure, C-screen). A purpose-built, plain-language explainer of the
// 6-digit-PIN offline-brute-force limit, linked from the Security Dashboard.
//
// HONESTY: states the real limit (a seized device can be analysed offline; 6
// digits is a small space) without inducing false despair — paired with the
// genuine mitigations. Hardware key-binding is framed as NOT in this version
// (TARGET, audit-gated — never asserted as shipped).
//
// DENIABILITY (load-bearing): this copy is STATIC and session-independent. It
// reads identically in real and decoy sessions, names no set's existence, and
// never touches coercion/decoy/hidden. It speaks ONLY about the single wallet
// on a taken device. Guarded by src/__tests__/security-framing.test.js.
// ─────────────────────────────────────────────────────────────────────────────

function Section({ icon: Icon, title, children }) {
  return (
    <div className="p-5 rounded-xl border border-border bg-card">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-lg bg-secondary flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{children}</p>
        </div>
      </div>
    </div>
  );
}

export default function WhatThisProtects() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Shield className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">What your PIN protects — and what it doesn't</h1>
          <p className="text-sm text-muted-foreground">An honest look at the lock on your wallet.</p>
        </div>
      </div>

      <div className="space-y-3">
        <Section icon={Lock} title="What your PIN does">
          Your wallet is encrypted on this device with your 6-digit PIN. Nothing leaves the
          device; even we can't read it. For everyday risks — a glance over your shoulder, a
          phone grabbed for a moment — the PIN is the lock.
        </Section>

        <Section icon={KeyRound} title="What it can't do (yet)">
          A 6-digit PIN is a small number of combinations. If someone keeps your device and
          has the time and tools to copy its storage, they can try PINs offline until one
          works. Each guess is deliberately slow, which buys time — but it does not make a
          6-digit PIN unbreakable.
        </Section>

        <Section icon={Smartphone} title="What helps now">
          Use your phone's own lock screen and storage encryption — that's a second barrier
          before anyone reaches the wallet. Keep the device physically secure.
        </Section>

        <Section icon={Cpu} title="What's coming">
          A future version will bind the key to this device's secure hardware, so the PIN
          can't be tried offline on a copy of the storage. That isn't in this version yet.
        </Section>
      </div>
    </div>
  );
}
