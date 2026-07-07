// src/lib/__tests__/findingIdConsistency.test.js
//
// Unit tests for the pure core of scripts/check-finding-id-consistency.mjs — the
// finding-ID drift gate. Hermetic: no filesystem, no network. Also runs the gate
// over the REAL registry + catalogue to prove the shipped state is consistent
// (and that the reconciled C-1 text is not a false positive).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  scanSurface,
  checkSourcesMentionIds,
  splitSentences,
} from '../../../scripts/check-finding-id-consistency.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const readRepo = (p) => readFileSync(join(REPO_ROOT, p), 'utf8');

const REGISTRY = { 'C-1': { status: 'fixed', severity: 'CRITICAL' } };

describe('scanSurface — openness contradiction detection', () => {
  it('flags a resolved finding described as an open CRITICAL (the original C-1 bug)', () => {
    const buggy =
      'OPEN CRITICAL (C-1): Android SOFTWARE-tier keys are not yet refused — a ' +
      'software-tier key can satisfy KEK enrollment with no hardware element; this ' +
      'is not a "known gap", it is an open CRITICAL finding (docs/audit.md).';
    const hits = scanSurface(buggy, 'catalogue.js', REGISTRY);
    expect(hits).toHaveLength(1);
    expect(hits[0].id).toBe('C-1');
  });

  it('does NOT flag the reconciled text that says the gap is NOT C-1 and C-1 is FIXED', () => {
    const reconciled =
      'OPEN GAP — StrongBox tier enforcement (TARGET, not built): Android ' +
      'SOFTWARE-tier / non-StrongBox keys are not yet refused, weakening the I6 ' +
      'invariant. This is a distinct open residual gate, NOT the audit C-1 finding: ' +
      'the audit C-1 CRITICAL (missing per-enrollment kekSalt binding) is FIXED / ' +
      'device-verified (v3, PR #568).';
    expect(scanSurface(reconciled, 'catalogue.js', REGISTRY)).toHaveLength(0);
  });

  it('does not flag a plain factual mention with no openness assertion', () => {
    const ok = 'The C-1 CRITICAL was fixed in PR #568 and device-verified.';
    expect(scanSurface(ok, 'catalogue.js', REGISTRY)).toHaveLength(0);
  });

  it('flags "remains unresolved" phrasing for a resolved finding', () => {
    const bad = 'The C-1 issue remains unresolved on Android.';
    expect(scanSurface(bad, 'catalogue.js', REGISTRY)).toHaveLength(1);
  });

  it('ignores findings whose registry status is still open', () => {
    const openReg = { 'X-9': { status: 'open', severity: 'HIGH' } };
    const text = 'X-9 is an open HIGH finding still being worked.';
    expect(scanSurface(text, 'catalogue.js', openReg)).toHaveLength(0);
  });

  it('does not let one ID substring-match another (C-1 vs C-10)', () => {
    const reg = { 'C-1': { status: 'fixed' } };
    const text = 'C-10 is an open CRITICAL finding.';
    expect(scanSurface(text, 'catalogue.js', reg)).toHaveLength(0);
  });
});

describe('splitSentences', () => {
  it('splits on sentence boundaries and trims', () => {
    expect(splitSentences('One. Two.  Three.')).toEqual(['One.', 'Two.', 'Three.']);
  });
});

describe('checkSourcesMentionIds', () => {
  it('passes when the source text mentions the ID', () => {
    const findings = { 'C-1': { source: 'x.md' } };
    const read = () => 'the C-1 finding is here';
    expect(checkSourcesMentionIds(findings, read)).toHaveLength(0);
  });

  it('flags when the source text does not mention the ID', () => {
    const findings = { 'C-1': { source: 'x.md' } };
    const read = () => 'no finding id in this doc';
    const v = checkSourcesMentionIds(findings, read);
    expect(v).toHaveLength(1);
    expect(v[0].kind).toBe('source-doc-does-not-mention-id');
  });

  it('flags an unreadable source doc', () => {
    const findings = { 'C-1': { source: 'missing.md' } };
    const read = () => { throw new Error('ENOENT'); };
    expect(checkSourcesMentionIds(findings, read)[0].kind).toBe('source-doc-unreadable');
  });
});

describe('real registry + catalogue are consistent (shipped state)', () => {
  const registry = JSON.parse(readRepo('docs/findings-registry.json'));
  const findings = registry.findings;

  it('the real catalogue has zero openness contradictions', () => {
    const src = readRepo('src/lib/featureCatalogue.js');
    expect(scanSurface(src, 'src/lib/featureCatalogue.js', findings)).toEqual([]);
  });

  it('every registry finding is mentioned in its cited source doc', () => {
    expect(checkSourcesMentionIds(findings, readRepo)).toEqual([]);
  });
});
