// src/wallet-core/__tests__/vaultBackup-opacity.test.js
//
// Regression guard for the readable-backup report (PR #239) + combined-credential
// model (2026-09-01). The exported veyrnox.enc must be an OPAQUE binary
// container — not human-readable JSON — and it now carries a SINGLE seal
// encrypted under Argon2id(password ‖ 0x1F ‖ pin), so both credentials are
// required to restore.
//
// This file pins:
//   1. downloadBackupFile writes an opaque binary blob (not parseable as plain JSON),
//   2. parseBackupFile round-trips that opaque blob back to the envelope,
//   3. garbage AND legacy dual-seal .enc files are rejected (no legacy read path),
//   4. real AES-GCM round-trip decrypts under the combined credential.
//
// NOTE on scope (honest): opacity here is an ENCODING, not encryption — the seed
// is protected by the per-seal AES-GCM, which the dedicated vault tests cover.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { downloadBackupFile, parseBackupFile, createBackupEnvelope, verifyBackupEnvelope, combineBackupCredential } from '../vaultBackup.js';
import { decryptVault } from '../vault.js';

// A structurally-valid envelope (isValidBackup): app/backup_v + single combined blob seal.
// Canonical (padding-exact) base64 so binary encode→decode re-emits identical
// strings — matches how real vault blobs (b64() in vault.js) are produced.
const blob = (ct) => ({ v: 1, ct, iv: 'ZGVm', salt: 'YWJj' });
const ENVELOPE = {
  app: 'veyrnox',
  backup_v: 2,
  created_at: 1700000000000,
  seals: { combined: blob('Z2hp') },
};

// Capture the text downloadBackupFile would write, by stubbing the DOM/URL bits.
let captured;
beforeEach(() => {
  captured = null;
  globalThis.URL.createObjectURL = vi.fn((b) => { captured = b; return 'blob:mock'; });
  globalThis.URL.revokeObjectURL = vi.fn();
});
afterEach(() => { vi.restoreAllMocks(); });

async function capturedBytes() {
  expect(captured, 'downloadBackupFile did not create a blob').toBeTruthy();
  return new Uint8Array(await captured.arrayBuffer());
}

describe('backup file is a BINARY encrypted-vault container (guards PR #239/#245 + 2026-09-01 combined seal)', () => {
  it('downloadBackupFile writes opaque binary, not text/JSON', async () => {
    downloadBackupFile(ENVELOPE);
    const bytes = await capturedBytes();
    // Binary magic "VYRNXENC", not a text format.
    expect([...bytes.slice(0, 8)]).toEqual([0x56, 0x59, 0x52, 0x4e, 0x58, 0x45, 0x4e, 0x43]);
    const asText = new TextDecoder().decode(bytes);
    expect(() => JSON.parse(asText)).toThrow();              // not JSON
    expect(/argon2|aes-?256|aes-gcm/i.test(asText)).toBe(false); // no scheme labels
    // Contains non-printable bytes (genuinely binary, not a base64/text blob).
    expect(bytes.some((b) => b < 0x09 || (b > 0x0d && b < 0x20))).toBe(true);
  });

  it('parseBackupFile round-trips the binary container back to the envelope', async () => {
    downloadBackupFile(ENVELOPE);
    const bytes = await capturedBytes();
    expect(parseBackupFile(bytes)).toEqual(ENVELOPE);
    // Also accepts the raw ArrayBuffer (what FileReader.readAsArrayBuffer yields).
    expect(parseBackupFile(bytes.buffer)).toEqual(ENVELOPE);
  });

  it('rejects garbage / non-Veyrnox content AND legacy dual-seal envelopes (no legacy read path — 2026-09-01)', () => {
    expect(() => parseBackupFile('not a backup at all')).toThrow();
    expect(() => parseBackupFile(JSON.stringify({ app: 'other', backup_v: 2 }))).toThrow();
    expect(() => parseBackupFile(new Uint8Array([1, 2, 3, 4, 5]))).toThrow();
    // Legacy dual-seal envelope: backup_v: 1, seals { password, pin }. Refused.
    const legacyDual = { app: 'veyrnox', backup_v: 1, seals: { password: blob('x'), pin: blob('y') } };
    expect(() => parseBackupFile(JSON.stringify(legacyDual))).toThrow();
  });

  // The integrity test that actually matters: a real AES-GCM seal must survive
  // the binary file round-trip and still decrypt under the COMBINED credential.
  // A broken format = unrecoverable backups, so this exercises real crypto
  // end-to-end (slow Argon2id — expected).
  it('REAL crypto: binary file round-trips and the combined seal decrypts', async () => {
    const container = JSON.stringify({ wallets: [{ id: 'w1', mnemonic: 'alpha bravo charlie delta echo' }] });
    const env = await createBackupEnvelope(container, 'sixteen-char-pass', '24681357');
    downloadBackupFile(env);
    const parsed = parseBackupFile(await capturedBytes());
    expect(await decryptVault(parsed.seals.combined, combineBackupCredential('sixteen-char-pass', '24681357'))).toBe(container);
  }, 60000);

  // verify-after-export: a freshly-made backup is proven restorable before the
  // user is told it succeeded. Wrong pw OR wrong pin fails — both are required.
  it('verifyBackupEnvelope passes for the chosen creds and throws for either wrong', async () => {
    const container = JSON.stringify({ wallets: [{ id: 'w1', mnemonic: 'foxtrot golf hotel india' }] });
    const env = await createBackupEnvelope(container, 'sixteen-char-pass1', '98765432');
    await expect(verifyBackupEnvelope(env, 'sixteen-char-pass1', '98765432')).resolves.toBe(true);
    await expect(verifyBackupEnvelope(env, 'wrongwrongwrong16', '98765432')).rejects.toThrow(/verification failed/i);
    await expect(verifyBackupEnvelope(env, 'sixteen-char-pass1', '00000000')).rejects.toThrow(/verification failed/i);
  }, 60000);
});
