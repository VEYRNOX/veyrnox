// components/FirstReceiveCard.jsx
//
// FirstReceiveCard is post-KEK, pre-Outlet. Never renders in decoy/demo
// (WalletEntry render-branch gate) — but must NOT bake in that assumption if
// reused elsewhere. Caller owns telemetry fire via useFirstReceiveShown.
//
// One-time post-onboarding screen: the newly-created wallet's primary EVM
// receive address, a locally-generated QR (QRCodeDisplay — never a
// third-party image API), a copy-to-clipboard button, and a "You're set" CTA
// that hands off to the main wallet. Address absent (should not happen —
// WalletEntry only reaches this branch once accounts are derived) renders an
// honest error state rather than a blank/fake address (I4).
import { useState } from "react";
import { Copy, CheckCircle2, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import QRCodeDisplay from "@/components/QRCodeDisplay";
import { toast } from "@/lib/toast";

export default function FirstReceiveCard({ address, onDismiss }) {
  const [copied, setCopied] = useState(false);
  const reduceMotion = useReducedMotion();

  const copyAddress = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Reviewer P2 fund-safety: DO NOT silently swallow. If the clipboard write
      // failed, the user may believe the address was copied and paste a stale
      // destination into their sending app. Surface the failure so they retry
      // (or copy manually from the visible address string). Matches
      // ReceiveCrypto.jsx:73 shape.
      toast.error("Couldn't copy — tap the address to select and copy manually.");
    }
  };

  return (
    <div className="space-y-4 p-5 rounded-xl border border-border bg-card text-center">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Your wallet is ready</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          This is your Ethereum receive address.
        </p>
      </div>

      {address ? (
        <>
          <div className="flex justify-center">
            <QRCodeDisplay address={address} size={200} />
          </div>
          <div className="flex items-center gap-2 bg-secondary rounded-lg px-3 py-2.5 text-start">
            <code className="mono-value text-xs flex-1 break-all">{address}</code>
            <Button
              size="icon"
              variant="ghost"
              className="relative h-11 w-11 shrink-0"
              onClick={copyAddress}
              aria-label={copied ? "Address copied" : "Copy address"}
            >
              <AnimatePresence mode="wait" initial={false}>
                {copied ? (
                  <motion.span
                    key="check"
                    initial={reduceMotion ? { scale: 1, opacity: 1 } : { scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={reduceMotion ? { opacity: 0 } : { scale: 0.7, opacity: 0 }}
                    transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 18 }}
                    className="flex"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                  </motion.span>
                ) : (
                  <motion.span
                    key="copy"
                    initial={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="flex"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </motion.span>
                )}
              </AnimatePresence>
            </Button>
          </div>
        </>
      ) : (
        <div className="flex items-start gap-2 p-3 rounded-lg border border-destructive/30 bg-destructive/5 text-start">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <p className="text-xs text-destructive">Address unavailable — refresh.</p>
        </div>
      )}

      {address && (
        <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-400/30 bg-amber-400/5 text-start">
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            Only send <strong>ETH</strong> on the <strong>Ethereum Mainnet</strong>. The same address also
            receives assets on Arbitrum, Optimism, Polygon, Avalanche, and BNB — pick the right network in
            your sending app or funds may be unrecoverable.
          </p>
        </div>
      )}

      <Button className="w-full h-12 text-base" onClick={onDismiss}>
        You're set
      </Button>
    </div>
  );
}
