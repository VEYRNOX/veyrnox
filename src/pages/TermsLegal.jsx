// pages/TermsLegal.jsx
//
// TERMS / LEGAL — a static reference screen reachable from Settings. It
// consolidates the app's legal surface (terms of use, not-financial-advice,
// provisional status & security audits, and the honest limits of the coercion features)
// in one place.
//
// DELIBERATELY NOT an acceptance gate. Nothing here is written to disk: no
// acceptance flag, no per-set state, no onboarding prompt. Because nothing is
// stored, the screen renders identically in real and decoy sessions (I3 — no
// deniability surface, no flag a forensic dump or coercer could read). It is a
// content page, not a storage feature. If a future version ever needs to persist
// "user has seen terms", that is a SEPARATE, counsel-gated decision — not this
// screen.
//
// §A / §B are owner/counsel-supplied legal text. Claude is not a lawyer: these
// render as clearly-marked "to be supplied" placeholders, never invented terms.
// §C reuses the existing honest status language (LandingPage caveat family). §D
// is a condensed REFERENCE COPY of the honest limits already shown inline on the
// DuressPin / StealthWallets / PanicWipe screens — it does not replace them;
// decision-point honesty stays where the user acts.

import { Scale, FileText, AlertTriangle, ShieldAlert, EyeOff } from "lucide-react";
import BackButton from "@/components/BackButton";

// A normal content section: prose in the default (Schibsted Grotesk) face,
// sentence case, calm near-black card surface, one teal accent on the icon.
function Section({ icon: Icon, title, children }) {
  return (
    <div className="p-5 rounded-xl border border-border bg-card">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-lg bg-secondary flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold">{title}</p>
          <div className="text-xs text-muted-foreground mt-1 leading-relaxed space-y-2">{children}</div>
        </div>
      </div>
    </div>
  );
}

// A placeholder section for owner/counsel-supplied legal text. Visibly a stub
// (dashed border, muted icon, "Placeholder" tag) so a reader never mistakes it
// for the real terms. The body states plainly what it is NOT.
function PlaceholderSection({ icon: Icon, title, children }) {
  return (
    <div className="p-5 rounded-xl border border-dashed border-border bg-card/50">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-lg bg-secondary flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold">{title}</p>
            <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
              Placeholder
            </span>
          </div>
          <div className="text-xs text-muted-foreground mt-1 leading-relaxed space-y-2">{children}</div>
        </div>
      </div>
    </div>
  );
}

export default function TermsLegal() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <BackButton />

      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Scale className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Terms &amp; legal</h1>
          <p className="text-sm text-muted-foreground">
            Terms, disclosures, and the honest limits — in one place, for reference.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {/* §A — Terms of use (placeholder, owner/counsel-supplied) */}
        <PlaceholderSection icon={FileText} title="Terms of use">
          <p>
            The full terms of use for <strong>VEYRNOX</strong> are <b>to be supplied</b> by the project before
            any non-testnet release. This is a placeholder — <b>not the terms of use</b>, and
            not a contract.
          </p>
        </PlaceholderSection>

        {/* §B — Not financial advice / use at your own risk (placeholder) */}
        <PlaceholderSection icon={AlertTriangle} title="Not financial advice / use at your own risk">
          <p>
            A &ldquo;not financial advice / use at your own risk&rdquo; statement is{" "}
            <b>to be supplied</b> by the project. This is a placeholder — it is{" "}
            <b>not financial advice</b> and not a liability waiver.
          </p>
        </PlaceholderSection>

        {/* §C — Provisional status & security audits (reuse existing honest language) */}
        <Section icon={ShieldAlert} title="Provisional status &amp; security audits">
          <p>
            <strong>VEYRNOX</strong> is a self-custody, coercion-resistant crypto wallet in <b>testnet beta</b> —{" "}
            <b>testnet funds only</b>. Its security features are <b>provisional</b>. An internal
            security audit was completed 2026-06-17 and an independent third-party audit was
            completed 2026-06-23 (all findings remediated). Audits reduce risk; they are{" "}
            <b>not a guarantee</b>. Your private keys never leave your device, and the app holds
            none of them server-side.
          </p>
        </Section>

        {/* §D — Honest limits of the coercion features (condensed reference copy) */}
        <Section icon={EyeOff} title="Honest limits of the coercion features">
          <p>
            The duress, stealth, and panic-wipe features are real but bounded. The same honest
            limits are shown inline where you set each one up; this is a <b>reference copy</b> in
            one place, not a replacement.
          </p>
          <ul className="list-disc pl-4 space-y-1.5">
            <li>
              <b>Duress / decoy</b> is runtime deniability, <b>not hidden-volume storage</b>: a
              forensic inspection of device storage can reveal a <b>second vault</b> exists.
            </li>
            <li>
              <b>Stealth / hidden wallets</b> hide a wallet in the app, <b>not on-chain</b>: every
              address stays public — anyone who knows one can see its balance and history on a{" "}
              <b>block explorer</b>.
            </li>
            <li>
              <b>Panic wipe</b> destroys the local device copy only. It <b>protects the device,
              not the seed</b> — a seed backup held elsewhere still recovers the wallet, and
              on-chain history stays public regardless.
            </li>
          </ul>
        </Section>
      </div>

      {/* I3 reinforcement, and a quiet honesty note: this screen stores nothing. */}
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        This is a reference screen. Nothing on it is saved to your device, and it reads the same
        on every device — there is no record of whether you have viewed it.
      </p>
    </div>
  );
}
