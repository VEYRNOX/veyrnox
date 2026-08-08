import { describe, it, expect } from 'vitest';

import {
  splitDekForBackup,
  combineDekFromBackup,
  ALLOW_SHARD_BACKUP,
  SHARD_BACKUP_DISABLED,
  SHARD_INVALID_DEK,
  SECRET_SIZE,
  SHARE_SIZE,
} from '../shardBackup.js';

function randomDek() {
  const buf = new Uint8Array(SECRET_SIZE);
  crypto.getRandomValues(buf);
  return buf;
}

describe('shardBackup — hard-off gate', () => {
  it('module-level flag is false by default', () => {
    // If this ever flips to true without an audit + the recovery flow + the
    // AAD v:3 migration + the deniability model being in place, the pre-audit
    // gate on docs/cloud-recovery-shard-spec.md has been silently bypassed.
    // Fail the build here rather than in production.
    expect(ALLOW_SHARD_BACKUP).toBe(false);
  });

  it('splitDekForBackup throws SHARD_BACKUP_DISABLED with no opts', () => {
    const dek = randomDek();
    expect(() => splitDekForBackup(dek)).toThrow(SHARD_BACKUP_DISABLED);
  });

  it('splitDekForBackup throws SHARD_BACKUP_DISABLED with {allow:true} while the gate is off', () => {
    const dek = randomDek();
    // The gate is *both* opts.allow AND the module flag. Belt and braces: a
    // caller with the opts alone should not be able to reach the primitive.
    expect(() => splitDekForBackup(dek, { allow: true })).toThrow(SHARD_BACKUP_DISABLED);
  });

  it('splitDekForBackup throws SHARD_BACKUP_DISABLED with a truthy-but-wrong opts', () => {
    const dek = randomDek();
    expect(() => splitDekForBackup(dek, { allow: 1 })).toThrow(SHARD_BACKUP_DISABLED);
    expect(() => splitDekForBackup(dek, { allow: 'yes' })).toThrow(SHARD_BACKUP_DISABLED);
    expect(() => splitDekForBackup(dek, {})).toThrow(SHARD_BACKUP_DISABLED);
  });

  it('combineDekFromBackup throws SHARD_BACKUP_DISABLED with no opts', () => {
    expect(() => combineDekFromBackup([new Uint8Array(SHARE_SIZE), new Uint8Array(SHARE_SIZE)]))
      .toThrow(SHARD_BACKUP_DISABLED);
  });

  it('never touches the KEK — imports only shamir.js', async () => {
    // Contract test: if a future edit adds a kek/hardware import, this fails.
    // The design principle from docs/cloud-recovery-shard-spec.md is "touch
    // the KEK zero" — that is enforced here by inspecting the source, so a
    // silent regression can't slip past unit-tests-green.
    //
    // Resolve the source path via `fileURLToPath` + `path.resolve` rather
    // than passing a `URL` to `fs.readFile`. Under vitest's Vite-served
    // module graph `import.meta.url` can resolve to `http://…` (not
    // `file://…`), which makes `fs.readFile(URL)` throw
    // `ERR_INVALID_URL_SCHEME` before any assertion runs. `fileURLToPath`
    // handles both schemes gracefully via the shared path fallback.
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    let hereDir;
    try {
      hereDir = path.dirname(fileURLToPath(import.meta.url));
    } catch {
      // Non-file scheme (Vite dev-server) — fall back to a repo-relative
      // resolution off cwd. Vitest always runs with cwd at the repo root.
      hereDir = path.resolve(process.cwd(), 'src/wallet-core/__tests__');
    }
    const src = await fs.readFile(
      path.resolve(hereDir, '..', 'shardBackup.js'),
      'utf8'
    );
    const importLines = src.split('\n').filter(l => /^\s*import\s/.test(l));
    expect(importLines).toHaveLength(1);
    expect(importLines[0]).toContain('./shamir.js');
    // Belt: no textual reference to KEK/hardware machinery even in comments
    // that would suggest wiring is intended without an audit.
    expect(/getHardwareFactor|combineKek|from ['"].\/kek/i.test(src)).toBe(false);
  });
});

// The tests below exercise the primitive with the gate temporarily lifted.
// They MUST NOT be adapted to run against production code — they exist only
// so the wrapper is not a dead black box.
describe('shardBackup — primitive behaviour under {allow:true} (documentation-only)', () => {
  // We can't flip ALLOW_SHARD_BACKUP without editing the file, so these
  // tests instead assert what the wrapper WOULD do by re-deriving via the
  // underlying shamir module — proving the shape/contract without needing
  // the gate open. This is deliberate: the gate stays off in tests too, so
  // no test file becomes an inadvertent production caller pattern.
  it('SECRET_SIZE and SHARE_SIZE match the underlying shamir envelope', async () => {
    const shamir = await import('../shamir.js');
    expect(SECRET_SIZE).toBe(shamir.SECRET_SIZE);
    expect(SHARE_SIZE).toBe(shamir.SHARE_SIZE);
  });

  it('the intended round-trip works via the primitive (2 of 3 reconstructs the DEK)', async () => {
    const shamir = await import('../shamir.js');
    const dek = randomDek();
    const shares = shamir.split(dek, 3, 2);
    expect(shares).toHaveLength(3);
    for (const s of shares) expect(s.length).toBe(SHARE_SIZE);
    // Any 2 of 3 reconstructs. This is what splitDekForBackup + combine
    // would produce end-to-end once the gate opens; asserted here so a
    // shamir envelope-format change would red this test alongside the ones
    // under shamir.test.js.
    expect(shamir.combine([shares[0], shares[1]])).toEqual(dek);
    expect(shamir.combine([shares[0], shares[2]])).toEqual(dek);
    expect(shamir.combine([shares[1], shares[2]])).toEqual(dek);
  });
});

describe('shardBackup — DEK-shape validation would trigger on a bad call', () => {
  // We can only test the gate here (SHARD_INVALID_DEK is unreachable while
  // the module flag is off, because the gate check runs first). Asserting
  // the error code STRING exists is enough to prevent a rename regression;
  // when the gate flips on for real, these will be re-armed to assert the
  // full error path.
  it('exports the SHARD_INVALID_DEK code as a stable string', () => {
    expect(typeof SHARD_INVALID_DEK).toBe('string');
    expect(SHARD_INVALID_DEK).toBe('SHARD_INVALID_DEK');
  });
});
