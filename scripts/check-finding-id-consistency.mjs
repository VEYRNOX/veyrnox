#!/usr/bin/env node
// scripts/check-finding-id-consistency.mjs
//
// CI GUARD (finding-ID drift): fail the build if a USER-FACING surface describes
// an audit finding that is RESOLVED (status != "open" in docs/findings-registry.json)
// as if it were still open / unresolved / an open CRITICAL finding — or if a
// registry entry cites a `source` doc that does not actually mention the ID.
//
// This is the automated tripwire for the 2026-07-06 C-1 drift: src/lib/featureCatalogue.js
// labelled a RESOLVED finding "OPEN CRITICAL (C-1)" and reused the C-1 ID for an
// unrelated (StrongBox tier-enforcement) gap, contradicting the audit doc and
// docs/Feature-Status.md. See docs/findings-registry.json.
//
//   node scripts/check-finding-id-consistency.mjs
//
// Wire into package.json as "check:finding-ids" and into CI (verify job) as a
// required step, same pattern as scripts/check-deniability-strings.mjs.
//
// SCOPE (deliberate): only the terse, user-facing catalogue is openness-scanned.
// docs/Feature-Status.md and the audit docs legitimately NARRATE history ("C-1
// REGRESSED … unresolved at that point, then FIXED") — sentence-level openness
// scanning would false-positive on that history. Those docs get only the lighter
// "source contains the ID" existence check. The catalogue is the surface that
// must state CURRENT truth, so it is the one held to the openness invariant.
//
// No dependencies beyond Node builtins. Pure ESM. Cross-platform.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dir, '..');

// The user-facing surface(s) held to the openness invariant. Repo-relative.
export const USER_FACING_SURFACES = ['src/lib/featureCatalogue.js'];
export const REGISTRY_PATH = 'docs/findings-registry.json';

// A finding whose registry status is one of these must NEVER be described as open
// in a user-facing surface.
export const RESOLVED_STATUSES = new Set(['fixed', 'accepted', 'evidence-gap']);

// ---------------------------------------------------------------------------
// Sentence splitting — rough but sufficient. We split on a period followed by
// whitespace, keeping semicolon/dash-joined clauses together (an openness claim
// and its finding ID usually share a sentence in this codebase's copy).
// ---------------------------------------------------------------------------

export function splitSentences(text) {
  return text
    .split(/(?<=\.)\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Word-boundary matcher for a finding ID like "C-1" (the "-" is not a \w char,
// so we build an explicit boundary rather than relying on \b around the dash).
function idRegex(id) {
  const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\w-])${esc}(?![\\w-])`, 'g');
}

// An openness ASSERTION: the copy claims the finding is still open. Kept tight so
// it matches "OPEN CRITICAL (C-1)" / "it is an open CRITICAL finding" / "remains
// unresolved" but NOT "distinct open residual gate" (which is about a TARGET, not
// the finding) or "is FIXED".
const OPEN_ASSERTION_RE = /\bopen\s+(?:critical|high|medium|low|finding|issue)\b|\bunresolved\b|\bis\s+an?\s+open\b|\bstill\s+open\b|\bnot\s+(?:yet\s+)?(?:fixed|resolved|closed)\b/i;

// A negation/resolution signal IN THE SAME SENTENCE that disclaims the finding
// being open — either it is stated FIXED/RESOLVED/CLOSED/device-verified here, or
// the sentence explicitly says this is NOT that finding.
function sentenceDisclaims(sentence, id) {
  if (/\b(?:fixed|resolved|closed|device-verified)\b/i.test(sentence)) return true;
  const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // "NOT the audit C-1", "NOT a C-1 finding", "not the C-1"
  if (new RegExp(`\\bnot\\b[^.]{0,20}${esc}`, 'i').test(sentence)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Core matcher — pure, unit-testable. Returns an array of violation objects.
// ---------------------------------------------------------------------------

/**
 * Scan one user-facing surface's text against the registry.
 * @param {string} source raw file contents of a user-facing surface
 * @param {string} filename path used only for reporting
 * @param {Record<string, {status:string, severity?:string}>} findings registry.findings
 * @returns {Array<{file:string, id:string, kind:string, sentence:string}>}
 */
export function scanSurface(source, filename, findings) {
  const violations = [];
  const sentences = splitSentences(source);
  for (const [id, meta] of Object.entries(findings)) {
    if (!RESOLVED_STATUSES.has(meta.status)) continue; // "open" findings may be called open
    const re = idRegex(id);
    for (const sentence of sentences) {
      re.lastIndex = 0;
      if (!re.test(sentence)) continue;
      if (OPEN_ASSERTION_RE.test(sentence) && !sentenceDisclaims(sentence, id)) {
        violations.push({
          file: filename,
          id,
          kind: `resolved-finding-described-as-open (registry: ${meta.status})`,
          sentence: sentence.length > 220 ? `${sentence.slice(0, 217)}…` : sentence,
        });
      }
    }
  }
  return violations;
}

/**
 * Verify every registry finding's `source` doc actually mentions the ID.
 * @param {Record<string, {source:string}>} findings registry.findings
 * @param {(p:string)=>string} read reader (repo-relative path -> contents)
 * @returns {Array<{id:string, kind:string, source:string}>}
 */
export function checkSourcesMentionIds(findings, read) {
  const violations = [];
  for (const [id, meta] of Object.entries(findings)) {
    let text;
    try {
      text = read(meta.source);
    } catch {
      violations.push({ id, kind: 'source-doc-unreadable', source: meta.source });
      continue;
    }
    if (!idRegex(id).test(text)) {
      violations.push({ id, kind: 'source-doc-does-not-mention-id', source: meta.source });
    }
  }
  return violations;
}

// ---------------------------------------------------------------------------
// CLI wrapper
// ---------------------------------------------------------------------------

function readRepo(relPath) {
  return readFileSync(join(REPO_ROOT, relPath), 'utf8');
}

function main() {
  let registry;
  try {
    registry = JSON.parse(readRepo(REGISTRY_PATH));
  } catch (err) {
    console.error(`BLOCKED: cannot read/parse ${REGISTRY_PATH}: ${err.message}`);
    process.exit(1);
  }
  const findings = registry.findings ?? {};

  const openness = [];
  for (const surface of USER_FACING_SURFACES) {
    let src;
    try {
      src = readRepo(surface);
    } catch (err) {
      console.error(`BLOCKED: cannot read user-facing surface ${surface}: ${err.message}`);
      process.exit(1);
    }
    openness.push(...scanSurface(src, surface, findings));
  }

  const sources = checkSourcesMentionIds(findings, readRepo);

  const all = [...openness, ...sources];
  if (all.length > 0) {
    for (const v of openness) {
      console.error(`${v.file}: [${v.id}] ${v.kind}\n    ${v.sentence}`);
    }
    for (const v of sources) {
      console.error(`${REGISTRY_PATH}: [${v.id}] ${v.kind} -> ${v.source}`);
    }
    console.error(`\nBLOCKED: ${all.length} finding-ID consistency violation(s). See docs/findings-registry.json.`);
    process.exit(1);
  }
  console.log(`OK: check-finding-id-consistency passed (${Object.keys(findings).length} findings, ${USER_FACING_SURFACES.length} surface(s)).`);
}

const isMain = process.argv[1] && process.argv[1].endsWith('check-finding-id-consistency.mjs');
if (isMain) main();
