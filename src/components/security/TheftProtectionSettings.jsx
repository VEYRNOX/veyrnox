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

import { useState, useEffect, useCallback } from 'react';
import { ShieldAlert } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useActionGuard } from '@/components/security/useActionGuard';
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

/**
 * Read the spend-limit row Theft Protection's send-side leg actually rides on.
 *
 * evaluateSendAgainstLimits() blocks if ANY matching limit is breached, so the
 * row that matters for the currency-agnostic cap is the enabled `ALL` one. If a
 * user has several, the SMALLEST per-transaction cap is the one that will fire
 * first — showing anything else here would display a number that never gates.
 * Returns null when there is nothing to edit yet.
 */
async function loadTheftProtectionLimit() {
  try {
    const { base44 } = await import('@/api/base44Client');
    const rows = await base44.entities.TransactionLimit.list();
    if (!Array.isArray(rows)) return null;
    const candidates = rows.filter(
      (r) => r && r.enabled && (r.currency === 'ALL' || !r.currency) && r.per_transaction_limit != null,
    );
    if (candidates.length === 0) return null;
    return candidates.reduce((a, b) =>
      Number(b.per_transaction_limit) < Number(a.per_transaction_limit) ? b : a,
    );
  } catch {
    return null;
  }
}

/** Positive, finite, and inside a range a real cap can occupy. */
export function parseSpendLimitInput(raw) {
  const trimmed = String(raw ?? '').trim().replace(/[$,\s]/g, '');
  if (trimmed === '') return { ok: false, reason: 'Enter an amount.' };
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return { ok: false, reason: 'Enter a plain number, like 500.' };
  if (n <= 0) return { ok: false, reason: 'The limit must be more than $0.' };
  if (n > 1_000_000_000) return { ok: false, reason: 'That limit is too large.' };
  return { ok: true, value: n };
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
  // The cap that Theft Protection's send-side leg rides on, surfaced HERE so it
  // is adjustable where the feature that depends on it lives. It is the same
  // TransactionLimit row Security Center → Spend Limits edits; this is a second
  // door onto one value, not a second setting.
  const [limitRow, setLimitRow] = useState(/** @type {any} */ (null));
  const [draft, setDraft] = useState('');
  const [savingLimit, setSavingLimit] = useState(false);
  const [limitNote, setLimitNote] = useState('');
  const [limitNoteIsError, setLimitNoteIsError] = useState(true);
  const { requireTwoFactor, gateModal } = useActionGuard();

  const refreshLimit = useCallback(async () => {
    const row = await loadTheftProtectionLimit();
    setLimitRow(row);
    setDraft(row?.per_transaction_limit != null ? String(row.per_transaction_limit) : '');
  }, []);

  useEffect(() => {
    if (on) void refreshLimit();
  }, [on, refreshLimit]);

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

  const saveLimit = async () => {
    setLimitNote('');
    setLimitNoteIsError(true);
    const parsed = parseSpendLimitInput(draft);
    if (!parsed.ok) {
      setLimitNote(parsed.reason);
      return;
    }
    const next = parsed.value;
    const current =
      limitRow?.per_transaction_limit != null ? Number(limitRow.per_transaction_limit) : null;
    if (current != null && next === current) {
      setLimitNoteIsError(false);
      setLimitNote(`Already set to $${next.toLocaleString()}.`);
      return;
    }

    const write = async () => {
      setSavingLimit(true);
      try {
        const { base44 } = await import('@/api/base44Client');
        if (limitRow?.id) {
          await base44.entities.TransactionLimit.update(limitRow.id, {
            per_transaction_limit: next,
            enabled: true,
          });
        } else {
          await base44.entities.TransactionLimit.create({
            currency: 'ALL',
            daily_limit: null,
            per_transaction_limit: next,
            enabled: true,
          });
        }
        await refreshLimit();
        setLimitNoteIsError(false);
        setLimitNote(`Limit set to $${next.toLocaleString()}.`);
      } catch {
        setLimitNote('Could not save that limit. Try again.');
      } finally {
        setSavingLimit(false);
      }
    };

    // Same rule as SecurityCenter.guardLoosening: only a change that can LOOSEN
    // the cap is gated. Raising the number lets more value through without a
    // biometric, so it needs the biometric first; lowering it (or setting one
    // where there was none) only tightens and stays ungated. Without this split
    // this field would be a way to raise the cap from an unlocked phone and
    // then send freely — exactly the hole guardLoosening closes.
    const loosening = current != null && next > current;
    if (!loosening) {
      await write();
      return;
    }
    if (isTheftProtectionEnabled()) {
      try {
        const { supported } = await getTheftProtectionSupport();
        if (supported) await runTheftProtectionGate({ isPrimary: !isDeniabilityOrDemoActive() });
      } catch (err) {
        setLimitNote(theftProtectionMessage(err));
        return;
      }
    }
    requireTwoFactor(() => { void write(); }, { title: 'Raise spend limit' });
  };

  return (
    <div>
      {gateModal}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-primary" />
            <h3 className="font-medium">Theft Protection</h3>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            After your PIN, ask the OS for Face on iOS or a strong biometric on
            Android before opening the wallet. Falls back to a closed unlock if
            the check fails or the device looks compromised.
          </p>
          <p className="text-xs text-muted-foreground/80 mt-1">
            Turning this on also adds a $500 per-transaction limit if you have
            none, so an over-limit send needs the same biometric check before it
            can sign.
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

      {/* The cap lives here, next to the feature that depends on it. It was
          previously only reachable through Security Center → Spend Limits,
          which is a different screen behind a tab — so the number that decides
          when Theft Protection challenges a send was effectively unfindable
          from the toggle that turns it on. Same underlying TransactionLimit
          row; editing either place edits the one value. */}
      {on && (
        <div className="mt-4 rounded-lg border border-border p-3">
          <Label htmlFor="theft-protection-spend-limit" className="text-sm font-medium">
            Ask for the biometric above
          </Label>
          <p className="text-xs text-muted-foreground mt-1">
            A send worth more than this needs the Theft Protection check before it
            can sign. Raising it asks for the biometric first; lowering it does not.
          </p>
          <div className="flex items-center gap-2 mt-2">
            <div className="relative flex-1 min-w-0">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-muted-foreground"
              >
                $
              </span>
              <Input
                id="theft-protection-spend-limit"
                className="ps-6 mono-value"
                inputMode="decimal"
                maxLength={16}
                placeholder={String(DEFAULT_THEFT_PROTECTION_PER_TX_USD)}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                disabled={savingLimit}
                aria-describedby="theft-protection-spend-limit-note"
                data-testid="theft-protection-limit-input"
              />
            </div>
            <Button
              type="button"
              onClick={saveLimit}
              disabled={savingLimit}
              data-testid="theft-protection-limit-save"
            >
              {savingLimit ? 'Saving…' : 'Save'}
            </Button>
          </div>
          <p
            id="theft-protection-spend-limit-note"
            role="status"
            className={`text-xs mt-2 ${limitNoteIsError ? 'text-destructive' : 'text-muted-foreground'}`}
            data-testid="theft-protection-limit-note"
          >
            {limitNote ||
              (limitRow
                ? 'Also editable in Security Center → Spend Limits.'
                : 'No limit set yet — sends are not challenged by amount.')}
          </p>
        </div>
      )}
    </div>
  );
}
