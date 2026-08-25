// wallet-core/__tests__/vault-kdf-migration-flag-on.test.js
//
// Pins the Personal Backup guard on the KDF profile v1 → v2 silent-migration
// flag flip (owner-ruled 2026-08-25). See:
//   - vault.js KDF_PROFILE_V2_MIGRATION_ENABLED head comment
//   - keystore/kdfMigrationGuard.js
//   - keystore/native.js _unlockInner migration hook (guard call site)
//
// The guard is a synchronous localStorage read so it can run on the hot
// unlock path without a biometric prompt or async plugin call — the guard
// helper is testable in isolation, and the native.js call site is a
// three-line if/else around it.
//
// Cases (invariant → assertion):
//   - flag flipped ON ....................... KDF_PROFILE_V2_MIGRATION_ENABLED
//   - no shares → migration allowed ......... shouldDeferKdfMigrationForShares == false
//   - shares present → migration DEFERRED ... shouldDeferKdfMigrationForShares == true
//   - detection throws → migration DEFERRED . fail-closed
//   - v2 vault no-op is the vault.js layer .. vaultNeedsKdfMigration(v2Blob) == false
//   - marker write is best-effort ........... markKdfMigrationPendingSharesWarning
//                                             does not throw when localStorage.setItem does

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { KDF_PARAMS, KDF_PROFILE_V2_MIGRATION_ENABLED, vaultNeedsKdfMigration } from '../vault.js';
import {
  shouldDeferKdfMigrationForShares,
  markKdfMigrationPendingSharesWarning,
  PERSONAL_BACKUP_EXPORTED_KEY,
  NUDGE_PENDING_KEY,
} from '../keystore/kdfMigrationGuard.js';

describe('KDF v1→v2 migration guard (owner-ruled flag flip 2026-08-25)', () => {
  beforeEach(() => {
    localStorage.removeItem(PERSONAL_BACKUP_EXPORTED_KEY);
    localStorage.removeItem(NUDGE_PENDING_KEY);
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('KDF_PROFILE_V2_MIGRATION_ENABLED is flipped ON', () => {
    // The whole point of this task; if this expectation goes red, either the
    // guard's contract also needs updating or the flip was reverted without
    // updating the guard call site.
    expect(KDF_PROFILE_V2_MIGRATION_ENABLED).toBe(true);
  });

  it('flag ON + no shares → guard allows migration (false)', () => {
    expect(localStorage.getItem(PERSONAL_BACKUP_EXPORTED_KEY)).toBeNull();
    expect(shouldDeferKdfMigrationForShares()).toBe(false);
  });

  it('flag ON + shares present → guard DEFERS (true)', () => {
    localStorage.setItem(PERSONAL_BACKUP_EXPORTED_KEY, '{"at":1,"version":1}');
    expect(shouldDeferKdfMigrationForShares()).toBe(true);
  });

  it('flag ON + shares detection throws → guard DEFERS (fail-closed)', () => {
    const orig = localStorage.getItem.bind(localStorage);
    const spy = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    try {
      expect(shouldDeferKdfMigrationForShares()).toBe(true);
    } finally {
      spy.mockImplementation(orig);
    }
  });

  it('flag ON + v2 vault → vault.js layer no-ops before guard is consulted', () => {
    // The guard only runs when vaultNeedsKdfMigration(blob) is true. A v2 vault
    // fails that check up front, so the guard is never asked — regardless of
    // share state, no rekey happens. This is the "existing v2 vaults, no-op"
    // contract that vaultNeedsKdfMigration owns.
    const v2Blob = {
      v: 2,
      kdf: { name: 'argon2id', ...KDF_PARAMS },
      salt: 'AA==', iv: 'AA==', ct: 'AA==',
    };
    localStorage.setItem(PERSONAL_BACKUP_EXPORTED_KEY, '{"at":1,"version":1}');
    expect(vaultNeedsKdfMigration(v2Blob)).toBe(false);
  });

  it('marker write is best-effort — a setItem throw is swallowed', () => {
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    try {
      expect(() => markKdfMigrationPendingSharesWarning()).not.toThrow();
    } finally {
      spy.mockRestore();
    }
  });

  it('marker write on the deferral path leaves the pending marker present', () => {
    localStorage.setItem(PERSONAL_BACKUP_EXPORTED_KEY, '{"at":1,"version":1}');
    // Simulate the exact native.js branch: guard says defer, then write marker.
    if (shouldDeferKdfMigrationForShares()) markKdfMigrationPendingSharesWarning();
    expect(localStorage.getItem(NUDGE_PENDING_KEY)).toBe('1');
  });
});
