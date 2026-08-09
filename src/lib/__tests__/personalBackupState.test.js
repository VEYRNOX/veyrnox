// personalBackupState.js — Phase 5 posture-input persistence.
//
// Coverage:
//   - default read is { exported:false, passphrase:false }
//   - markPersonalBackupExported flips the exported flag; passphrase branch is
//     opt-in
//   - I3 chokepoint: writes from a decoy/demo session are no-ops
//   - malformed / unknown-version stored values read as absent
//   - PERSONAL_BACKUP_RESIDUE_KEYS lists every key the module writes (guards
//     against a new writer sneaking in without a matching panic-list entry)

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/wallet-core/deniabilitySession', () => ({
  isDeniabilityOrDemoActive: vi.fn(() => false),
}));

let mod;
let deniabilityMod;

beforeEach(async () => {
  vi.resetModules();
  vi.doMock('@/wallet-core/deniabilitySession', () => ({
    isDeniabilityOrDemoActive: vi.fn(() => false),
  }));
  vi.doMock('../../wallet-core/deniabilitySession', () => ({
    isDeniabilityOrDemoActive: vi.fn(() => false),
  }));
  mod = await import('../personalBackupState.js');
  deniabilityMod = await import('../../wallet-core/deniabilitySession.js');
  try { localStorage.clear(); } catch { /* shimmed */ }
});

afterEach(() => {
  vi.resetAllMocks();
  try { localStorage.clear(); } catch { /* shimmed */ }
});

describe('personalBackupState — read', () => {
  it('returns { exported:false, passphrase:false } when nothing is stored', () => {
    expect(mod.readPersonalBackupState()).toEqual({ exported: false, passphrase: false });
  });

  it('reads back a value written by markPersonalBackupExported({withPassphrase:false})', () => {
    mod.markPersonalBackupExported({ withPassphrase: false });
    expect(mod.readPersonalBackupState()).toEqual({ exported: true, passphrase: false });
  });

  it('reads back both flags when {withPassphrase:true}', () => {
    mod.markPersonalBackupExported({ withPassphrase: true });
    expect(mod.readPersonalBackupState()).toEqual({ exported: true, passphrase: true });
  });

  it('rejects stored JSON with a schema version we do not know', () => {
    localStorage.setItem(
      mod.PERSONAL_BACKUP_EXPORTED_KEY,
      JSON.stringify({ at: Date.now(), version: 999 }),
    );
    expect(mod.readPersonalBackupState().exported).toBe(false);
  });

  it('rejects a stored future timestamp (clock-skew / tamper)', () => {
    localStorage.setItem(
      mod.PERSONAL_BACKUP_EXPORTED_KEY,
      JSON.stringify({ at: Date.now() + 1_000_000_000, version: 1 }),
    );
    expect(mod.readPersonalBackupState().exported).toBe(false);
  });

  it('rejects malformed JSON without throwing', () => {
    localStorage.setItem(mod.PERSONAL_BACKUP_EXPORTED_KEY, '{not json');
    expect(mod.readPersonalBackupState().exported).toBe(false);
  });
});

describe('personalBackupState — I3 write chokepoint', () => {
  it('markPersonalBackupExported is a no-op when isDeniabilityOrDemoActive() returns true', () => {
    deniabilityMod.isDeniabilityOrDemoActive.mockReturnValue(true);
    mod.markPersonalBackupExported({ withPassphrase: true });
    expect(localStorage.getItem(mod.PERSONAL_BACKUP_EXPORTED_KEY)).toBeNull();
    expect(localStorage.getItem(mod.PERSONAL_BACKUP_PASSPHRASE_KEY)).toBeNull();
  });
});

describe('personalBackupState — I3 read chokepoint (Codex P1 2026-08-09)', () => {
  it('readPersonalBackupState returns false-flags in a decoy session even when primary state exists', () => {
    // Primary session writes real state.
    mod.markPersonalBackupExported({ withPassphrase: true });
    expect(mod.readPersonalBackupState()).toEqual({ exported: true, passphrase: true });
    // Switch to decoy. Reading MUST return conservative false so the posture
    // score cannot leak primary-wallet activity via a Recovery-dimension delta.
    deniabilityMod.isDeniabilityOrDemoActive.mockReturnValue(true);
    expect(mod.readPersonalBackupState()).toEqual({ exported: false, passphrase: false });
  });
});

describe('personalBackupState — panic residue contract', () => {
  it('PERSONAL_BACKUP_RESIDUE_KEYS lists every key the module writes', async () => {
    expect(mod.PERSONAL_BACKUP_RESIDUE_KEYS).toEqual([
      'veyrnox-personal-backup-exported',
      'veyrnox-personal-backup-passphrase-set',
    ]);
  });

  it('every key from PERSONAL_BACKUP_RESIDUE_KEYS is included in wallet-core/panic.js METADATA_RESIDUE_KEYS', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    let hereDir;
    try {
      hereDir = path.dirname(fileURLToPath(import.meta.url));
    } catch {
      hereDir = path.resolve(process.cwd(), 'src/lib/__tests__');
    }
    const src = await fs.readFile(
      path.resolve(hereDir, '..', '..', 'wallet-core', 'panic.js'),
      'utf8',
    );
    for (const key of mod.PERSONAL_BACKUP_RESIDUE_KEYS) {
      expect(src).toContain(`'${key}'`);
    }
  });
});
