// G4 — structural pins: sensitiveGate wired at seed-reveal / export / import entry.
//
// RASP BLOCK tiers (HOOKED, TAMPERED, INTEGRITY_FAIL, fail-closed) populate
// `blockedActions` with ['sign', 'seed-reveal', 'export', 'import']. The
// `sensitiveGate` helper consumes that set. These tests pin that the three
// callsite files actually import and call `sensitiveGate` at the correct entry
// points — so the gate can't be silently removed by a future refactor.
//
// Structural pins only: the pure-function correctness is in sensitiveGate.test.js.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const src = join(dir, '../..');  // src/rasp/__tests__ → src/

const reveal   = readFileSync(join(src, 'components/security/useRevealWithReauth.jsx'), 'utf8');
const backup   = readFileSync(join(src, 'pages/PersonalBackup.jsx'), 'utf8');
const entry    = readFileSync(join(src, 'components/WalletEntry.jsx'), 'utf8');
const seedgrid = readFileSync(join(src, 'components/SeedGrid.jsx'), 'utf8');
const hdwallet = readFileSync(join(src, 'pages/HDWalletManager.jsx'), 'utf8');
// The restore (import) gate was extracted from PersonalBackup's inline RestoreTab
// into the shared RestoreFromFile component (rendered by BOTH PersonalBackup's
// Restore tab AND onboarding). The 'import' G4 gate lives there now.
const restore  = readFileSync(join(src, 'components/backup/RestoreFromFile.jsx'), 'utf8');

// Every LOCAL seed-material surface must gate on the ON-DEVICE leg only — i.e. pass
// { excludeAttestation: true } to useRaspArtifact — so an unavailable REMOTE
// attestation (Play Integrity 404 on any sideloaded build) can never block backup /
// export / import / reveal / restore. Owner decision 2026-07-16. Genuine on-device
// threats still block via the OS leg; the remote leg stays in force for signing only.
const EXCL = /useRaspArtifact\(\{\s*excludeAttestation:\s*true\s*\}\)/;
describe('seed-material surfaces — excludeAttestation pin (backup not gated on remote leg)', () => {
  it('useRevealWithReauth passes excludeAttestation', () => expect(reveal).toMatch(EXCL));
  it('PersonalBackup passes excludeAttestation', () => expect(backup).toMatch(EXCL));
  // WalletEntry moved off the mount-time hook entirely (L-6, audit 2026-08-25): its
  // three seed-material gates now probe FRESH at the tap via freshSensitiveGate(),
  // which composes the ON-DEVICE leg only and so carries the same owner decision by
  // construction. Pinned on the composition rather than on the hook option, because
  // there is no longer a useRaspArtifact call here to carry the flag — and a regex
  // that a mere COMMENT can satisfy is not a pin.
  it('WalletEntry gates on the on-device leg only (no attestation leg composed)', () => {
    expect(entry).toMatch(/selectPresignProbeSource\(isNative, nativeSource, browserProbeSource\)/);
    expect(entry).not.toMatch(/composeConditions|detectAttestation/);
  });
  it('SeedGrid passes excludeAttestation', () => expect(seedgrid).toMatch(EXCL));
  it('HDWalletManager passes excludeAttestation', () => expect(hdwallet).toMatch(EXCL));
  it('RestoreFromFile passes excludeAttestation', () => expect(restore).toMatch(EXCL));
});

// ── useRevealWithReauth — seed-reveal gate ───────────────────────────────────

describe('useRevealWithReauth — G4 seed-reveal gate', () => {
  it('imports sensitiveGate and useRaspArtifact from @/rasp', () => {
    expect(reveal).toMatch(/sensitiveGate/);
    expect(reveal).toMatch(/useRaspArtifact/);
  });

  it('calls useRaspArtifact with excludeAttestation (local seed-material not gated on the remote leg)', () => {
    expect(reveal).toMatch(/useRaspArtifact\(\{\s*excludeAttestation:\s*true\s*\}\)/);
  });

  it("calls sensitiveGate with 'seed-reveal' action", () => {
    expect(reveal).toMatch(/sensitiveGate\s*\(.*'seed-reveal'\s*\)/);
  });

  it('returns early when gate.blocked is true (no reveal on BLOCK tier)', () => {
    const gateIdx = reveal.indexOf("sensitiveGate(");
    const gateRegion = reveal.slice(gateIdx, gateIdx + 300);
    expect(gateRegion).toMatch(/gate\.blocked/);
    expect(gateRegion).toMatch(/return/);
  });
});

// ── PersonalBackup — export gate ─────────────────────────────────────────────

describe('PersonalBackup ExportTab — G4 export gate', () => {
  it('imports sensitiveGate and useRaspArtifact', () => {
    expect(backup).toMatch(/sensitiveGate/);
    expect(backup).toMatch(/useRaspArtifact/);
  });

  it("calls sensitiveGate with 'export' before createBackup", () => {
    const exportIdx = backup.indexOf("sensitiveGate(raspArtifact, 'export')");
    expect(exportIdx).toBeGreaterThan(-1);
    const createBackupIdx = backup.indexOf('createBackup(password, pin)');
    expect(exportIdx).toBeLessThan(createBackupIdx);
  });
});

// ── PersonalBackup — import gate ─────────────────────────────────────────────

describe('RestoreFromFile — G4 import gate (shared restore component)', () => {
  it('imports sensitiveGate and useRaspArtifact', () => {
    expect(restore).toMatch(/sensitiveGate/);
    expect(restore).toMatch(/useRaspArtifact/);
  });

  it("calls sensitiveGate with 'import' before decryptPasswordSeal / decryptPinSeal", () => {
    const importGateIdx = restore.indexOf("sensitiveGate(raspArtifact, 'import')");
    expect(importGateIdx).toBeGreaterThan(-1);
    const decryptIdx = restore.indexOf('decryptPasswordSeal(');
    expect(decryptIdx).toBeGreaterThan(-1);
    expect(importGateIdx).toBeLessThan(decryptIdx);
  });
});

// ── WalletEntry — import gate (handleImport + finishPinRecover) ──────────────

// L-6 (audit 2026-08-25): the gate call is now freshSensitiveGate() — a fresh
// on-device probe composed at the tap, wrapping the same sensitiveGate() verdict —
// so these pins match the fresh helper. The ORDERING property they exist to protect
// (gate strictly before the import) is unchanged and still asserted.
describe('WalletEntry — G4 import gate on seed import paths', () => {
  it('imports sensitiveGate and defines the fresh-at-the-tap wrapper', () => {
    expect(entry).toMatch(/sensitiveGate/);
    expect(entry).toMatch(/export async function freshSensitiveGate\(/);
  });

  it("calls freshSensitiveGate with 'import' in handleImport before importWallet", () => {
    const handleImportIdx = entry.indexOf('const handleImport');
    expect(handleImportIdx).toBeGreaterThan(-1);
    const handleImportRegion = entry.slice(handleImportIdx, handleImportIdx + 500);
    expect(handleImportRegion).toMatch(/await freshSensitiveGate\('import'\)/);
    const gateIdx = handleImportIdx + handleImportRegion.indexOf('freshSensitiveGate');
    const importWalletIdx = entry.indexOf('importWallet(phrase');
    expect(gateIdx).toBeLessThan(importWalletIdx);
  });

  it("calls freshSensitiveGate with 'import' in finishPinRecover before importWalletForPendingPin", () => {
    const recoverIdx = entry.indexOf('const finishPinRecover');
    expect(recoverIdx).toBeGreaterThan(-1);
    const recoverRegion = entry.slice(recoverIdx, recoverIdx + 400);
    expect(recoverRegion).toMatch(/await freshSensitiveGate\('import'\)/);
    const gateIdx = recoverIdx + recoverRegion.indexOf('freshSensitiveGate');
    const importForPinIdx = entry.indexOf('importWalletForPendingPin(recoverySeed)');
    expect(gateIdx).toBeLessThan(importForPinIdx);
  });
});
