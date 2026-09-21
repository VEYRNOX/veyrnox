// @ts-nocheck
// components/security/TheftProtectionSettings.jsx
//
// Opt-in "Theft Protection" toggle: adds an OS-biometric factor on top of the
// existing PIN + KEK at every unlock. See src/lib/theftProtection.js for the
// gate itself. The write helper is I3-guarded (K-2); the surrounding
// security-block wrapper in Settings.jsx also renders a neutral placeholder
// in decoy/demo, so this component never mounts there.
//
// HONEST COPY: iOS is face-strict (Touch-ID-only devices refuse enrolment).
// Android accepts any BIOMETRIC_STRONG class — no public API to require face
// specifically. Do not soften that asymmetry in the label.
//
// #2515: switching ON runs getTheftProtectionSupport first. A device the gate
// would refuse at EVERY unlock (web, no enrolled biometric, Touch-ID iPhone)
// must not be able to opt in — the setting can only be turned off from inside
// the unlocked wallet. Switching OFF is never gated.

import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import {
  isTheftProtectionEnabled,
  setTheftProtectionEnabled,
  getTheftProtectionSupport,
  runTheftProtectionGate,
  theftProtectionMessage,
} from '@/lib/theftProtection';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';

/**
 * Default per-transaction cap (USD) seeded when Theft Protection is switched on
 * and the user has NO spend limits at all. Without an enabled limit the
 * send-side leg of Theft Protection is inert — sendGate's
 * THEFT_PROTECTION_REQUIRED branch only fires when evaluateSendAgainstLimits()
 * blocks — so enabling the feature used to protect unlock and nothing else.
 *
 * It is a STARTING POINT, not a policy: it is an ordinary TransactionLimit row,
 * editable and deletable from Security Center → Spend Limits like any other.
 * A user who already has limits (enabled OR disabled) keeps exactly what they
 * configured — we never add a second row or re-enable one they turned off.
 */
export const DEFAULT_THEFT_PROTECTION_PER_TX_USD = 500;

/**
 * Seed the default cap. Returns the seeded amount, or null when nothing was
 * written (limits already exist, or the entity layer failed).
 *
 * Dynamically imported so the entity layer is not pulled into this settings
 * component's static graph, and fully swallowed: a seed failure must never
 * block Theft Protection itself, which still protects unlock on its own.
 */
async function seedDefaultSpendLimit() {
  try {
    const { base44 } = await import('@/api/base44Client');
    const existing = await base44.entities.TransactionLimit.list();
    if (Array.isArray(existing) && existing.length > 0) return null;
    await base44.entities.TransactionLimit.create({
      currency: 'ALL',
      daily_limit: null,
      per_transaction_limit: DEFAULT_THEFT_PROTECTION_PER_TX_USD,
      enabled: true,
    });
    return DEFAULT_THEFT_PROTECTION_PER_TX_USD;
  } catch {
    return null;
  }
}

const UNSUPPORTED_COPY = {
  'not-native': 'Theft Protection needs the Veyrnox app on iPhone or Android.',
  'no-biometric': 'Set up Face ID, face unlock or a fingerprint in your device settings first.',
  'requires-face': "Theft Protection on iPhone needs Face ID, which this device doesn't have.",
};

export default function TheftProtectionSettings() {
  const [on, setOn] = useState(() => isTheftProtectionEnabled());
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState('');
  const [noteIsError, setNoteIsError] = useState(true);

  const toggle = async (next) => {
    setNote('');
    setNoteIsError(true);
    if (next) {
      setChecking(true);
      try {
        const { supported, reason } = await getTheftProtectionSupport();
        if (!supported) {
          setNote(UNSUPPORTED_COPY[reason] ?? UNSUPPORTED_COPY['no-biometric']);
          return;
        }
      } finally {
        setChecking(false);
      }
    } else if (isTheftProtectionEnabled()) {
      // Turning it OFF needs the same biometric it enforces — otherwise someone
      // holding an unlocked phone switches it off here and sends freely. Fails
      // closed; a silent no-op in decoy/demo, where the setter is a no-op too.
      // EXCEPT on a device that cannot run the gate at all: #2515's escape
      // hatch — a device that can never pass the biometric must still be able
      // to switch the feature off, and the gate enforces nothing there anyway.
      setChecking(true);
      try {
        const { supported } = await getTheftProtectionSupport();
        if (supported) await runTheftProtectionGate({ isPrimary: !isDeniabilityOrDemoActive() });
      } catch (err) {
        setNote(theftProtectionMessage(err));
        return;
      } finally {
        setChecking(false);
      }
    }
    setTheftProtectionEnabled(next);
    const persisted = isTheftProtectionEnabled();
    setOn(persisted); // reflect what actually persisted
    // Seed the starter cap only when the setting ACTUALLY persisted. In a
    // decoy/demo session setTheftProtectionEnabled() is an I3 no-op, so
    // `persisted` stays false there and no entity row is written either —
    // the guard is inherited rather than duplicated (K-2).
    if (next && persisted) {
      const seeded = await seedDefaultSpendLimit();
      if (seeded) {
        setNoteIsError(false);
        setNote(
          `Added a $${seeded.toLocaleString()} per-transaction limit so Theft Protection also covers sending. Change or remove it in Security Center → Spend Limits.`,
        );
      }
    }
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-primary" />
            <h3 className="font-medium">Theft Protection</h3>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            After your PIN, ask the OS for Face on iOS or a strong biometric on
            Android before opening the wallet. Falls back to a closed unlock if
            the check fails or the device looks compromised (BUILT — not
            device-verified).
          </p>
          <p className="text-xs text-muted-foreground/80 mt-1">
            Turning this on also adds a $500 per-transaction limit if you have
            none, so an over-limit send needs the same biometric check before it
            can sign. Change or remove that limit any time in Security Center →
            Spend Limits.
          </p>
        </div>
        <Switch
          checked={on}
          disabled={checking}
          onCheckedChange={toggle}
          aria-label="Enable Theft Protection"
          data-testid="theft-protection-toggle"
        />
      </div>
      {note && (
        <p
          role="status"
          className={`text-sm mt-2 ${noteIsError ? 'text-destructive' : 'text-muted-foreground'}`}
          data-testid={noteIsError ? 'theft-protection-unsupported' : 'theft-protection-seeded-limit'}
        >
          {note}
        </p>
      )}
    </div>
  );
}
