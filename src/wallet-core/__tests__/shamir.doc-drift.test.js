// wallet-core/__tests__/shamir.doc-drift.test.js
//
// Tripwire against the public API docs drifting back behind the implementation.
//
// WHY: the 2026-08-03 audit added a SHA-256 commitment (H-6) and replaced the
// table-driven, zero-branching GF arithmetic (M-7) — but the JSDoc on combine()
// and split() was not updated with either. It went on stating the pre-audit
// position as fact, directly above code that contradicted it:
//
//   "integrity rests on CRC32 ... not cryptographic authentication"
//   "The caller MUST authenticate the reconstructed DEK against the vault's AAD"
//   "a hash commitment would leak information about the secret"
//   "NOT constant-time: gfMul branches on zero, table lookups are cache-visible"
//   "@param ... envelope v1"  (the format is v2; v1 is REJECTED, not migrated)
//
// That matters more than a normal stale comment because this is the docstring an
// IDE shows on hover, the module has NO callers yet, and its first integrator
// would have been told to add an AAD check the module already performs — and
// that adding a commitment would leak the secret, which is an argument for
// REMOVING the H-6 fix.
//
// Same class as L-3 in the 2026-07-28 wave (PlayIntegrityPlugin KDoc still
// describing a pre-#1097 bypass). Asserting on source text is the pattern
// already used by advisorConsent.test.js, which reads panic.js to prove a
// residue key is registered.
//
// These assertions are about DOC/CODE AGREEMENT, not prose style. If the
// implementation ever genuinely loses the commitment or reverts to table-driven
// GF, fix the code — or, if that is deliberate, this file is the thing that
// forces the docs to say so.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Resolved from the vitest root rather than `import.meta.url`: under the jsdom
// environment this project uses, `import.meta.url` is not a file: URL, so
// fileURLToPath() throws "The URL must be of scheme file" at module load and the
// whole suite reports 0 tests rather than failing usefully.
const SHAMIR_PATH = join(process.cwd(), 'src', 'wallet-core', 'shamir.js');
const SRC = readFileSync(SHAMIR_PATH, 'utf8');

describe('doc-drift tripwire wiring', () => {
  it('actually read the module source', () => {
    // Without this, a bad path would make every `not.toMatch` below pass
    // vacuously against an empty string — a tripwire that can never fire.
    expect(SRC.length).toBeGreaterThan(1000);
    expect(SRC).toContain('export function combine(');
  });
});

/** The JSDoc block immediately preceding `export function combine`. */
function docBlockFor(fnName) {
  const idx = SRC.indexOf(`export function ${fnName}(`);
  expect(idx, `${fnName} not found`).toBeGreaterThan(-1);
  const before = SRC.slice(0, idx);
  const start = before.lastIndexOf('/**');
  expect(start, `no JSDoc block above ${fnName}`).toBeGreaterThan(-1);
  return before.slice(start);
}

describe('shamir public JSDoc agrees with the implementation', () => {
  it('combine() does not claim CRC-32 is the authentication boundary', () => {
    const doc = docBlockFor('combine');
    // H-6 put a SHA-256 commitment check inside combine(); CRC-32 is corruption
    // detection only and the docs must not present it as the integrity ceiling.
    expect(doc).not.toMatch(/integrity rests on CRC32/i);
    expect(doc).not.toMatch(/AUTHENTICATION BOUNDARY/i);
  });

  it('combine() does not delegate authentication to the caller', () => {
    const doc = docBlockFor('combine');
    // The module header records why this was pulled in-module: "an advisory
    // contract no caller is obliged to honour is not a control".
    expect(doc).not.toMatch(/caller MUST authenticate/i);
  });

  it('combine() does not claim a hash commitment would leak the secret', () => {
    const doc = docBlockFor('combine');
    // Contradicted by computeCommitment's own reasoning, and reads as an
    // argument for removing H-6.
    expect(doc).not.toMatch(/commitment would leak/i);
  });

  it('combine() does not describe the GF arithmetic as branching or table-driven', () => {
    const doc = docBlockFor('combine');
    // M-7 removed both the zero-branch and the EXP/LOG tables.
    expect(doc).not.toMatch(/gfMul branches on zero/i);
    expect(doc).not.toMatch(/table lookups are cache-visible/i);
  });

  it('no JSDoc annotation still describes the envelope as v1', () => {
    // v1 (56 bytes, no commitment) is REJECTED, not migrated — see the header.
    expect(SRC).not.toMatch(/envelope v1/i);
  });

  it('the implementation actually has the properties the docs now claim', () => {
    // Guards the other direction: these assertions must fail if someone
    // "fixes" the drift by weakening the CODE to match old docs.
    expect(SRC).toContain('computeCommitment');
    expect(SRC).toContain('COMMITMENT_MISMATCH');
    // M-7: branch-free, table-free multiply. Match DECLARATIONS, not any
    // mention — the module header legitimately names EXP_TABLE/LOG_TABLE when
    // explaining what M-7 removed, and that history is worth keeping.
    expect(SRC).not.toMatch(/(?:const|let|var)\s+EXP_TABLE\b/);
    expect(SRC).not.toMatch(/(?:const|let|var)\s+LOG_TABLE\b/);
  });
});
