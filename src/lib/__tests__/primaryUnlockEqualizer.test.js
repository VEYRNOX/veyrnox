import { describe, it, expect } from 'vitest';
import { PRIMARY_UNLOCK_EQUALIZER_MS } from '../WalletProvider.jsx';

// H3 — timing equalizer must cover one Argon2id KDF at the CURRENT KDF_PARAMS.
//
// The primary-success unlock path runs ~1 FEWER Argon2id KDF than any other
// outcome (miss/duress/panic/hidden each spend 3 via resolveDeniabilityUnlock).
// WalletProvider pads the fast path with PRIMARY_UNLOCK_EQUALIZER_MS so correct
// password and wrong password cost the same wall-clock time. If the pad is much
// shorter than one real KDF, primary success is measurably faster than a miss —
// a timing oracle survives.
//
// The audit measured one KDF at the current 192 MiB / t=3 params at ~1.7 s. The
// legacy value (300 ms) was calibrated to the old 64 MiB params and is ~1.4 s
// short. This is a FAST guard (a plain constant assertion, no KDF run) so it can
// run on every commit; deniability-timing.test.js has the heavy variant that
// measures a real KDF and compares directly.
describe('H3 — PRIMARY_UNLOCK_EQUALIZER_MS floor', () => {
  // Conservative floor: well above the legacy 300 ms (which fails this) but below
  // the ~1.7 s audit measurement, so it pins the regression without coupling to an
  // exact device-specific KDF time.
  const ONE_KDF_FLOOR_MS = 1500;

  it('is at least the conservative one-KDF floor (>= 1500 ms)', () => {
    expect(PRIMARY_UNLOCK_EQUALIZER_MS).toBeGreaterThanOrEqual(ONE_KDF_FLOOR_MS);
  });

  // Upper sanity bound: keep the pad from being absurd. One KDF at current params
  // is ~1.7 s; the constant should not be wildly larger (which would hurt UX for
  // no security gain) nor smaller than the floor.
  it('is within a sane range (< 5000 ms) so unlock UX stays reasonable', () => {
    expect(PRIMARY_UNLOCK_EQUALIZER_MS).toBeLessThan(5000);
  });
});
