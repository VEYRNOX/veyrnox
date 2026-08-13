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
    // Allowed imports for shardBackup: shamir.js plus the noble hashing
    // primitives used by the cross-device bundle codec (Phase 3). Any
    // OTHER import — especially KEK/hardware — is a bug.
    const ALLOWED_IMPORT_PATTERNS = [
      /['"]\.\/shamir\.js['"]/,
      /['"]@noble\/hashes\/sha256['"]/,
      /['"]@noble\/hashes\/utils['"]/,
    ];
    for (const line of importLines) {
      expect(
        ALLOWED_IMPORT_PATTERNS.some((re) => re.test(line)),
        `unexpected import in shardBackup.js: ${line}`
      ).toBe(true);
    }
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

// ── Personal Backup Phase 1 ────────────────────────────────────────────────
// Two separate gates in this module: ALLOW_SHARD_BACKUP (unchanged, off) for
// the generic wrappers, and ENABLE_PERSONAL_BACKUP_SHARDS (also off by
// default) for the Personal Backup export path used by src/pages/PersonalBackup.
// Tests below cover BOTH flag-off (throws) and flag-on (round-trip) behaviour.

describe('shardBackup — Personal Backup gate defaults off', () => {
  it('ENABLE_PERSONAL_BACKUP_SHARDS is false by default (build flag off)', async () => {
    // Same fail-the-build reasoning as ALLOW_SHARD_BACKUP above. If this
    // flips to true without the audit + restore flow + cloud transport, the
    // pre-audit gate has been silently opened.
    const mod = await import('../shardBackup.js');
    expect(mod.ENABLE_PERSONAL_BACKUP_SHARDS).toBe(false);
  });

  it('splitDekForPersonalBackup throws PERSONAL_BACKUP_SHARDS_DISABLED when flag off', async () => {
    const mod = await import('../shardBackup.js');
    const dek = randomDek();
    expect(() => mod.splitDekForPersonalBackup(dek)).toThrow(mod.PERSONAL_BACKUP_SHARDS_DISABLED);
  });

  it('combineDekForPersonalBackup throws PERSONAL_BACKUP_SHARDS_DISABLED when flag off', async () => {
    const mod = await import('../shardBackup.js');
    const s = new Uint8Array(SHARE_SIZE);
    expect(() => mod.combineDekForPersonalBackup([s, s])).toThrow(mod.PERSONAL_BACKUP_SHARDS_DISABLED);
  });

  it('exports PERSONAL_BACKUP_ROUND_TRIP_FAILED as a stable error code', async () => {
    const mod = await import('../shardBackup.js');
    expect(mod.PERSONAL_BACKUP_ROUND_TRIP_FAILED).toBe('PERSONAL_BACKUP_ROUND_TRIP_FAILED');
  });
});

describe('shardBackup — Personal Backup behaviour with flag stubbed on', () => {
  // Load a fresh copy of shardBackup.js with the flag stubbed on. The module
  // reads import.meta.env at module load — vi.stubEnv + vi.resetModules gives
  // us a second instance with the flag flipped, without ever mutating the
  // real production module the rest of the suite imported at the top.
  async function loadShardBackupEnabled() {
    const { vi: viInst } = await import('vitest');
    viInst.stubEnv('VITE_ENABLE_PERSONAL_BACKUP_SHARDS', '1');
    viInst.resetModules();
    return await import('../shardBackup.js');
  }

  it('splitDekForPersonalBackup returns 3 shares of SHARE_SIZE bytes', async () => {
    const mod = await loadShardBackupEnabled();
    const dek = randomDek();
    const shares = mod.splitDekForPersonalBackup(dek);
    expect(shares).toHaveLength(3);
    for (const s of shares) expect(s.length).toBe(SHARE_SIZE);
  });

  it('any 2 of 3 shares reconstruct the original DEK', async () => {
    const mod = await loadShardBackupEnabled();
    const dek = randomDek();
    const dekCopy = new Uint8Array(dek);
    const shares = mod.splitDekForPersonalBackup(dek);
    // Verify caller's DEK was not mutated (defensive-copy contract).
    expect(dek).toEqual(dekCopy);
    expect(mod.combineDekForPersonalBackup([shares[0], shares[1]])).toEqual(dek);
    expect(mod.combineDekForPersonalBackup([shares[0], shares[2]])).toEqual(dek);
    expect(mod.combineDekForPersonalBackup([shares[1], shares[2]])).toEqual(dek);
  });

  it('combine rejects two shares with the same index', async () => {
    const mod = await loadShardBackupEnabled();
    const dek = randomDek();
    const shares = mod.splitDekForPersonalBackup(dek);
    // Duplicate-index (both from the same slot) — shamir.combine catches this
    // via its envelope shape check; matches spec §10.4.4.
    expect(() => mod.combineDekForPersonalBackup([shares[0], shares[0]])).toThrow();
  });

  it('shares from different generations produce a different DEK', async () => {
    // Same wallet, two independent splits (e.g. the user re-split after a
    // paper loss per spec §10.5.2). Mixing shares across generations returns
    // a well-shaped 32-byte value that decrypts NOTHING — the fail-closed
    // signal is the downstream vault decrypt, not combine() itself.
    const mod = await loadShardBackupEnabled();
    const dek = randomDek();
    const genA = mod.splitDekForPersonalBackup(dek);
    const genB = mod.splitDekForPersonalBackup(dek);
    // Cross-generation combine yields something that's neither dek nor throws
    // (shamir has no cross-set awareness beyond the commitment inside a set,
    // which uses different setIds across generations so a MIXED pair with
    // distinct setIds should throw the commitment mismatch).
    expect(() => mod.combineDekForPersonalBackup([genA[0], genB[1]])).toThrow();
  });

  it('rejects a DEK of the wrong length with SHARD_INVALID_DEK', async () => {
    const mod = await loadShardBackupEnabled();
    expect(() => mod.splitDekForPersonalBackup(new Uint8Array(31))).toThrow('SHARD_INVALID_DEK');
    expect(() => mod.splitDekForPersonalBackup(new Uint8Array(33))).toThrow('SHARD_INVALID_DEK');
    expect(() => mod.splitDekForPersonalBackup('not-bytes')).toThrow('SHARD_INVALID_DEK');
  });

  it('splitDek re-verifies the round-trip and throws on a shamir regression', async () => {
    // Sanity: the built-in round-trip check has to actually run. Prove it by
    // mocking shamir.combine to return the WRONG bytes and confirming split
    // throws PERSONAL_BACKUP_ROUND_TRIP_FAILED (rather than silently returning
    // the shares). Uses vi.doMock to override just for this test's dynamic
    // import; the mock is cleared for the next case.
    const { vi: viInst } = await import('vitest');
    viInst.stubEnv('VITE_ENABLE_PERSONAL_BACKUP_SHARDS', '1');
    viInst.doMock('../shamir.js', async () => {
      const actual = await viInst.importActual('../shamir.js');
      return {
        ...actual,
        combine: () => new Uint8Array(actual.SECRET_SIZE), // wrong result
      };
    });
    viInst.resetModules();
    try {
      const mod = await import('../shardBackup.js');
      expect(() => mod.splitDekForPersonalBackup(randomDek()))
        .toThrow('PERSONAL_BACKUP_ROUND_TRIP_FAILED');
    } finally {
      viInst.doUnmock('../shamir.js');
      viInst.resetModules();
    }
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
