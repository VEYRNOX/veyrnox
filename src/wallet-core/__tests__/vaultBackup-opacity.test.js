// src/wallet-core/__tests__/vaultBackup-opacity.test.js
//
// Regression guard for the readable-backup report (PR #239).
//
// The exported veyrnox.enc must be an OPAQUE container — not human-readable JSON
// that a text editor renders as labelled fields. This pins:
//   1. downloadBackupFile writes an opaque blob (not parseable as plain JSON),
//   2. parseBackupFile round-trips that opaque blob back to the envelope,
//   3. legacy plain-JSON backups (pre-opacity) still restore,
//   4. garbage is rejected.
//
// NOTE on scope (honest): opacity here is an ENCODING, not encryption — the seed
// is protected by the per-seal AES-GCM, which the dedicated vault tests cover.
// This file only guards the container behaviour the PR changed.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { downloadBackupFile, parseBackupFile } from '../vaultBackup.js';

// A structurally-valid envelope (isValidBackup): app/backup_v + two blob seals.
const blob = (ct) => ({ v: 1, ct, iv: 'aXY', salt: 'c2FsdA' });
const ENVELOPE = {
  app: 'veyrnox',
  backup_v: 1,
  created_at: 1700000000000,
  seals: { password: blob('cGFzcw'), pin: blob('cGlu') },
};

// Capture the text downloadBackupFile would write, by stubbing the DOM/URL bits.
let captured;
beforeEach(() => {
  captured = null;
  globalThis.URL.createObjectURL = vi.fn((b) => { captured = b; return 'blob:mock'; });
  globalThis.URL.revokeObjectURL = vi.fn();
});
afterEach(() => { vi.restoreAllMocks(); });

async function capturedText() {
  expect(captured, 'downloadBackupFile did not create a blob').toBeTruthy();
  return await captured.text();
}

describe('backup file is an opaque container (guards PR #239)', () => {
  it('downloadBackupFile output is NOT readable plain JSON', async () => {
    downloadBackupFile(ENVELOPE);
    const text = await capturedText();
    expect(() => JSON.parse(text)).toThrow();          // opaque, not JSON
    expect(/argon2|aes-?256|aes-gcm/i.test(text)).toBe(false); // no scheme labels in the clear
  });

  it('parseBackupFile round-trips the opaque container back to the envelope', async () => {
    downloadBackupFile(ENVELOPE);
    const text = await capturedText();
    expect(parseBackupFile(text)).toEqual(ENVELOPE);
  });

  it('still accepts a legacy plain-JSON backup (backward compatible)', () => {
    const legacy = JSON.stringify(ENVELOPE);
    expect(parseBackupFile(legacy)).toEqual(ENVELOPE);
  });

  it('rejects garbage / non-Veyrnox content', () => {
    expect(() => parseBackupFile('not a backup at all')).toThrow();
    expect(() => parseBackupFile(JSON.stringify({ app: 'other', backup_v: 1 }))).toThrow();
  });
});
