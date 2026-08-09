// components/PinSetup.jsx — two-step PIN entry (new PIN -> confirm PIN).
//
// Extracted from WalletEntry.jsx, where this same 15-line pattern was
// duplicated in the pin-create and pin-recover views. Owns pinStep/realPin/
// realPinConfirm internally; fires ONE onDone(pin) callback once a strong PIN
// has been entered twice and matches (constant-time compare, F-11).
//
// PinSetup is pre-vault safe (no decoy session yet). If reused post-vault,
// caller MUST add its own isDeniabilityOrDemoActive() gate — this component
// does not bake in one.
//
// Props:
//   onDone:   (pin: string) => void   fires after step 1 (checkPinStrength ok)
//                                      AND step 2 (pinsEqual match)
//   onCancel: () => void              fires from either step's Cancel affordance

import { useEffect, useState } from "react";
import PinPad from "@/components/security/PinPad";
import { checkPinStrength } from "@/lib/pinStrength";

// Constant-time PIN equality for the confirm step (F-11). Same pattern as
// WalletEntry.jsx's pinsEqual — both operands are local strings with no
// remote attacker; this is a codebase consistency fix, not a timing defense
// against a network adversary.
const _enc = new TextEncoder();
function pinsEqual(a, b) {
  const ab = _enc.encode(a), bb = _enc.encode(b);
  if (ab.length !== bb.length) return false;
  let d = 0; for (let i = 0; i < ab.length; i++) d |= ab[i] ^ bb[i];
  return d === 0;
}

export default function PinSetup({ onDone, onCancel }) {
  const [pinStep, setPinStep] = useState("real");
  const [realPin, setRealPin] = useState("");
  const [realPinConfirm, setRealPinConfirm] = useState("");
  const [error, setError] = useState("");

  const reset = () => {
    setRealPin(""); setRealPinConfirm(""); setPinStep("real"); setError("");
  };

  // Zeroize on unmount — mirrors the reset-on-entry contract every WalletEntry
  // caller relies on, but now happens automatically wherever PinSetup mounts.
  useEffect(() => () => { setRealPin(""); setRealPinConfirm(""); }, []);

  const handleCancel = () => { reset(); onCancel?.(); };

  return (
    <div className="space-y-5">
      {pinStep === "real" && (
        <div className="space-y-3 text-center">
          <h2 className="text-sm font-medium">Choose an 8-digit PIN</h2>
          <p className="text-xs text-muted-foreground">This unlocks your wallet. An 8-digit PIN. Always guard your device.</p>
          {error && (
            <p role="alert" className="text-xs text-destructive">{error}</p>
          )}
          <PinPad
            value={realPin}
            onChange={(v) => { setRealPin(v); if (error) setError(""); }}
            onComplete={(p) => {
              const s = checkPinStrength(p);
              if (!s.ok) { setError(s.reason); setRealPin(""); setPinStep("real"); return; }
              setError(""); setRealPinConfirm(""); setPinStep("real-confirm");
            }}
          />
          <button type="button" onClick={handleCancel} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
        </div>
      )}

      {pinStep === "real-confirm" && (
        <div className="space-y-3 text-center">
          <h2 className="text-sm font-medium">Confirm your PIN</h2>
          {error && (
            <p role="alert" className="text-xs text-destructive">{error}</p>
          )}
          <PinPad
            value={realPinConfirm}
            onChange={(v) => { setRealPinConfirm(v); if (error) setError(""); }}
            onComplete={(p) => {
              if (!pinsEqual(p, realPin)) {
                // Reset BOTH pins and return to step 1.
                // ponytail: matches original WalletEntry semantics so a shoulder-surfed step-1
                // PIN doesn't get an unlimited-retry surface on step 2. Reviewer P2, Slice B.
                setError("PINs didn't match. Start again.");
                setRealPin(""); setRealPinConfirm(""); setPinStep("real");
                return;
              }
              const confirmed = realPin;
              setRealPin(""); setRealPinConfirm(""); setError("");
              onDone?.(confirmed);
            }}
          />
          <button type="button" onClick={handleCancel} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
        </div>
      )}
    </div>
  );
}
