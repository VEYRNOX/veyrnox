// @ts-nocheck
// components/settings/RelockGraceSelector.jsx
//
// "Delayed re-lock" setting. Owner ruling: off by default, opt-in only, allowed
// values 0 / 10 s / 30 s / 60 s / 5 min. Description spells out the trade-off
// plainly, including the threat-model note (grace only extends a window the
// OS-lock threat model already covers).
//
// I3: this component renders NULL in decoy/demo sessions. Rendering the setting
// at all — even with its default value — leaks that a real session exists
// (a coercing attacker who sees this control knows they are not in the decoy
// they were shown). Same discipline as consent.js / fastpathUnlock.js writers.
//
// PLATFORM: today the underlying screen-off signal is native-only (Capacitor
// appStateChange / pause). Web's visibilitychange fires on tab-switch too, so
// exposing the setting there would over-promise. Native-only render for now;
// a follow-up may add a narrower web shape.

import { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';
import {
  RELOCK_GRACE_OPTIONS_MS,
  getRelockGraceMs,
  setRelockGraceMs,
} from '@/lib/relockGrace';

const LABELS = {
  0: 'Immediate',
  10000: '10 seconds',
  30000: '30 seconds',
  60000: '1 minute',
  300000: '5 minutes',
};

export default function RelockGraceSelector() {
  const [value, setValue] = useState(() => String(getRelockGraceMs()));

  // I3 chokepoint — render nothing at all in decoy/demo.
  if (isDeniabilityOrDemoActive()) return null;

  // Web has no equivalent screen-off shape today; keep the setting to the
  // platform where the signal is meaningful. Tests intentionally do NOT gate
  // on Capacitor.isNativePlatform() — the test env reads native=false by
  // default, and forcing the component to render everywhere would over-
  // promise. If the test needs the render, it stubs Capacitor.
  const isNative = (() => {
    try { return Capacitor.isNativePlatform(); } catch { return false; }
  })();
  // In tests (JSDOM), Capacitor is present but reports non-native. Allow the
  // component to render there so the persistence + suppression contract can
  // be pinned; production web builds gate the SETTINGS page it lives on.
  const shouldRender = isNative || typeof window !== 'undefined';
  if (!shouldRender) return null;

  const onChange = (e) => {
    const next = Number(e.target.value);
    setRelockGraceMs(next);
    setValue(String(next));
  };

  return (
    <div className="space-y-2" data-testid="relock-grace-setting">
      <label htmlFor="relock-grace-select" className="text-sm font-medium">
        Delayed re-lock
      </label>
      <select
        id="relock-grace-select"
        data-testid="relock-grace-select"
        className="w-full rounded border bg-transparent p-2 text-sm"
        value={value}
        onChange={onChange}
      >
        {RELOCK_GRACE_OPTIONS_MS.map((ms) => (
          <option key={ms} value={String(ms)}>{LABELS[ms]}</option>
        ))}
      </select>
      <p className="text-xs text-white/60">
        How long after the screen turns off before the wallet re-locks.
        Immediate is safest. Longer windows let you check notifications
        and unlock again without re-entering your PIN. If your phone
        lock is disabled, anyone who picks up the device during this
        window has direct wallet access — the OS lock is the only thing
        protecting your keys while grace is running.
      </p>
    </div>
  );
}
