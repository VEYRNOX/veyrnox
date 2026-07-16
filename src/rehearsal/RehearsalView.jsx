// @ts-nocheck
// src/rehearsal/RehearsalView.jsx — Deniability Rehearsal Simulator (brief §4).
//
// A thin, read-only LENS over the already-unlocked active set. It mounts the
// PRODUCTION dashboard (WalletPortfolioPage) verbatim, so Al confirms the ACTUAL
// decoy an adversary would see after a coerced unlock — not a mock (LLD #3). It
// adds nothing to the surface except an exit affordance and, on failure, an
// honest leak message: no "real vs decoy" framing, no set count, no credential
// label (brief §2/§7).
//
// It NEVER prompts for a credential, never decrypts, never writes. It reads the
// in-memory display state the live screen already holds (useWallet/usePortfolio)
// and runs the D2/D4/D7 checks over the snapshot. On any assertion failure it
// FAILS HONEST — surfaces "Deniability leak detected: <rule>" and never
// downgrades to a silent pass (I4, LLD #4). If no unlocked state is present it
// fails closed with a plain message rather than attempting a decrypt.

import { X } from 'lucide-react';
import { useWallet } from '@/lib/WalletProvider';
import { usePortfolio } from '@/lib/portfolioBalances';
import WalletPortfolioPage from '@/pages/WalletPortfolioPage';
import { buildRehearsalSnapshot } from './snapshot.js';
import { runDeniabilityChecks } from './assert.js';

// Plain-language rendering of which rule failed — sentence case, no jargon and
// no disclosure of session type or credential.
const RULE_PHRASE = {
  D2: 'the number of wallet sets could be inferred',
  D4: 'the way the wallet was unlocked could be inferred',
  D7: 'a size or storage-footprint difference is exposed',
  indeterminate: 'the view state could not be verified',
};

// Truncate-middle any 0x address that turns up in the evidence (brief §7).
const truncMiddle = (s) =>
  /^0x[0-9a-fA-F]{6,}$/.test(s) ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;

export default function RehearsalView({ onClose }) {
  const walletState = useWallet();
  const { wallets, walletAddresses } = walletState;
  // Read-only: the same hook the live dashboard uses. No write, no decrypt.
  const { data: portfolio } = usePortfolio(wallets, walletAddresses);

  const snapshot = buildRehearsalSnapshot(walletState, portfolio);
  const check = runDeniabilityChecks(snapshot);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-background">
      <div className="sticky top-0 z-10 flex items-center justify-end bg-background/90 backdrop-blur px-3 py-2 border-b border-border">
        <button
          onClick={onClose}
          aria-label="Close"
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="px-4 pb-12 pt-2">
        {!snapshot.available ? (
          <p className="max-w-lg mx-auto pt-10 text-sm text-muted-foreground text-center">
            No unlocked session to rehearse.
          </p>
        ) : (
          <>
            {!check.pass && (
              <div className="max-w-lg mx-auto mb-4 p-3 rounded-xl border border-[hsl(var(--risk))]/30 bg-[hsl(var(--risk))]/10">
                <p className="text-sm text-[hsl(var(--risk))]">
                  Deniability leak detected: {RULE_PHRASE[check.leak.rule] || check.leak.rule}.
                </p>
                {check.leak.evidence?.length > 0 && (
                  <p className="mt-1 font-mono text-xs text-[hsl(var(--risk))]/80 break-all">
                    {check.leak.evidence.map(truncMiddle).join(', ')}
                  </p>
                )}
              </div>
            )}
            {/* The rehearsal surface IS the production dashboard, unchanged. */}
            <WalletPortfolioPage />
          </>
        )}
      </div>
    </div>
  );
}
