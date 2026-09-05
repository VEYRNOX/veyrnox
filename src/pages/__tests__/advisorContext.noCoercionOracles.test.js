// No coercion oracles in any Security Advisor payload (#2256).
//
// WHY A SOURCE SCAN AND NOT A RENDER TEST. Each publisher builds its own object
// inline inside a component effect; there is no shared builder to assert
// against. A render test would need every page mounted with the right provider
// state and would still only cover the publishers someone remembered to add to
// it — which is exactly the failure this guards. Scanning every file that
// imports advisorBridge covers publisher number seven, written six months from
// now by someone who never read #2256.
//
// WHAT IT PROTECTS — UPDATED 2026-09-05, because the paragraph that used to sit
// here is now false and a false rationale is worse than none.
//
// It read: "publishAdvisorContext does not stay on the device: SecurityAdvisor
// merges the payload into `effectivePageSnapshot` and POSTs it to tip-chat as
// `context.page_snapshot`, alongside a PERSISTENT `device_id`." That was true
// when written and is the exact disclosure the 2026-09-03 security diff rated a
// REGRESSION — the consent copy promised only the typed question, the current
// screen and the selected chain, while 62 pages were publishing 196 keys.
//
// The snapshot is no longer transmitted at all. SecurityAdvisor's send path
// carries `current_screen` and `wallet_chain` and nothing else from this bus,
// pinned by SecurityAdvisor.noSnapshotEgress.test.jsx.
//
// So this file is now DEFENCE IN DEPTH, and it is kept for two reasons rather
// than retired. First, the egress cut is one edit away from being undone, and
// this is the layer that would still refuse a coercion oracle if it were.
// Second, a properly-disclosed version of per-page awareness is a live
// possibility; the day someone rebuilds it, this pin is what stops
// `duress_configured` riding along again.
//
// KNOWN GAP, recorded rather than fixed here: this scan parses only literal
// `publishAdvisorContext({ ... })` calls, so it does not see the objects passed
// through `useAdvisorSnapshot()`. That mattered while those objects egressed;
// it does not today. If snapshot transmission is ever restored, widening this
// scan to the hook's callers is a prerequisite, not a follow-up.
//
// The two removed in #2256:
//   Settings.jsx          duress_configured   — device HAS a duress wallet
//   SecurityDashboard.jsx stealth_pool_present — device HAS hidden wallets
// Both defeat the claim the deniability stack exists to make credible: that
// under coercion there is nothing else on this device.
//
// SCOPE — this is about EGRESS, not display. Rendering either fact on screen is
// a separate question with a different answer (SecurityDashboard still shows
// the stealth FeatureRow, correctly). This test only reads files that publish.
//
// ROBUSTNESS. It matches KEY NAMES, not source layout, so reformatting or
// reordering a payload cannot turn it red — the failure mode that made the iOS
// XCUITest guard brittle (#2253). It will false-positive on a legitimate
// identifier that happens to contain a banned word; if that ever happens the
// right fix is a narrower pattern, never deleting the case.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'src');

// Key fragments that identify a coercion-relevant fact. A payload key
// CONTAINING any of these is a disclosure about the user's deniability setup.
const BANNED_KEY_FRAGMENTS = [
  'duress',
  'stealth',
  'decoy',
  'panic',
  'hidden_wallet',
  'hidden_pool',
];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '__tests__') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(js|jsx)$/.test(entry)) out.push(full);
  }
  return out;
}

/** Every source file that publishes into the advisor context. */
function publisherFiles() {
  return walk(SRC).filter((f) => {
    const src = readFileSync(f, 'utf8');
    return src.includes('publishAdvisorContext(') && !f.endsWith('advisorBridge.js');
  });
}

/**
 * Extract the object-literal body of each publishAdvisorContext({...}) call.
 * Brace-counting from the opening `{`, so nested objects are included and a
 * `publishAdvisorContext(null)` suppression call is skipped.
 */
function publishedBodies(src) {
  const bodies = [];
  const marker = 'publishAdvisorContext(';
  let i = src.indexOf(marker);
  while (i !== -1) {
    let j = i + marker.length;
    while (j < src.length && /\s/.test(src[j])) j += 1;
    if (src[j] === '{') {
      let depth = 0;
      const start = j;
      for (; j < src.length; j += 1) {
        if (src[j] === '{') depth += 1;
        else if (src[j] === '}') {
          depth -= 1;
          if (depth === 0) { bodies.push(src.slice(start, j + 1)); break; }
        }
      }
    }
    i = src.indexOf(marker, i + marker.length);
  }
  return bodies;
}

describe('Security Advisor context — no coercion oracles (#2256)', () => {
  const files = publisherFiles();

  it('finds the publisher files (guards against the scan silently matching nothing)', () => {
    // Without this, a rename of publishAdvisorContext would make every case
    // below pass vacuously — the "disabled flag made a whole block pass" shape
    // from the 2026-07-28 diff. Six publishers existed when this was written.
    expect(files.length).toBeGreaterThanOrEqual(5);
  });

  it.each(BANNED_KEY_FRAGMENTS)(
    'no advisor payload publishes a key containing "%s"',
    (fragment) => {
      const offenders = [];
      for (const file of files) {
        for (const body of publishedBodies(readFileSync(file, 'utf8'))) {
          // Match `someKey:` where the key contains the banned fragment.
          const re = new RegExp(`(^|[\\s{,])([A-Za-z0-9_$]*${fragment}[A-Za-z0-9_$]*)\\s*:`, 'i');
          const hit = re.exec(body);
          if (hit) offenders.push(`${file.replace(SRC, 'src')} → ${hit[2]}`);
        }
      }
      expect(
        offenders,
        `Coercion-oracle key reaching the tip-chat backend. This payload is sent ` +
          `off-device with a persistent device_id — see the header of this file. ` +
          `Offenders:\n  ${offenders.join('\n  ')}`,
      ).toEqual([]);
    },
  );

  it('still detects a banned key when one is present (the scan actually bites)', () => {
    // Mutation check: the extractor + matcher must fire on a synthetic payload.
    // Without this the suite would pass just as happily if publishedBodies()
    // returned nothing for every file.
    const synthetic = `
      publishAdvisorContext({
        settings: { kek_enrolled: true, duress_configured: true },
      });
    `;
    const bodies = publishedBodies(synthetic);
    expect(bodies).toHaveLength(1);
    const re = new RegExp(`(^|[\\s{,])([A-Za-z0-9_$]*duress[A-Za-z0-9_$]*)\\s*:`, 'i');
    expect(re.test(bodies[0])).toBe(true);
  });
});
