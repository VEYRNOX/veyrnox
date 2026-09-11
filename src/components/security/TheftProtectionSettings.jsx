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
} from '@/lib/theftProtection';

const UNSUPPORTED_COPY = {
  'not-native': 'Theft Protection needs the Veyrnox app on iPhone or Android.',
  'no-biometric': 'Set up Face ID, face unlock or a fingerprint in your device settings first.',
  'requires-face': "Theft Protection on iPhone needs Face ID, which this device doesn't have.",
};

export default function TheftProtectionSettings() {
  const [on, setOn] = useState(() => isTheftProtectionEnabled());
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState('');

  const toggle = async (next) => {
    setNote('');
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
    }
    setTheftProtectionEnabled(next);
    setOn(isTheftProtectionEnabled()); // reflect what actually persisted
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
        <p role="status" className="text-sm text-destructive mt-2" data-testid="theft-protection-unsupported">
          {note}
        </p>
      )}
    </div>
  );
}
