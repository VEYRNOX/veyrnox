// src/lib/bugReport/recordableRoutes.js
//
// Fail-closed route gate for opt-in bug-report screen recording.
// See docs/bug-report-recording-plan.md — this module is a foundation for
// Slice 1a and has NO CALLERS yet. Landing it early lets Slice 1b and Slice 2
// consume a stable contract.
//
// Design rules the tests must survive:
//   - Denylist wins on any conflict (I4).
//   - Missing route (unknown path) is DENIED (I4).
//   - Prefix match is boundary-aware: `/settings/privacy` allowed via `/settings`,
//     `/settingsomething` NOT allowed — the prefix must be followed by `/` or end.
//
// The lists are hardcoded on purpose. Adding a route is a line change reviewable
// as a security-relevant diff — never a config file, never a URL param.

const ALLOWLIST = Object.freeze([
  '/dashboard',
  '/send/form',
  '/receive',
  '/settings',
  '/plans',
  '/help',
  '/documentation',
]);

const DENYLIST = Object.freeze([
  '/onboarding',
  '/seed',
  '/verify-seed',
  '/backup',
  '/recovery',
  '/pin',
  '/lock',
  '/unlock',
  '/wallet-entry',
  '/send/confirm',
  '/send/sign',
  '/wc',
  '/decoy',
  '/duress',
  '/stealth',
  '/panic',
  // Explicitly denied subroute of an allowlist prefix — a future settings
  // subpage that reveals key material must not be recordable via `/settings`
  // prefix inheritance. Tested; do not remove without moving the guard.
  '/settings/wipe',
]);

/**
 * True iff `prefix` matches `path` at a segment boundary — either exact match
 * or followed by `/`. Rejects `/settingsomething` under `/settings`.
 */
function matchesPrefix(path, prefix) {
  if (path === prefix) return true;
  return path.startsWith(prefix + '/');
}

/**
 * Does either list contain a segment-boundary match for `path`?
 */
function listMatches(path, list) {
  for (const p of list) if (matchesPrefix(path, p)) return true;
  return false;
}

/**
 * True iff a recording MAY happen on this route. Denylist wins.
 * A non-string, empty, or unknown path is DENIED (I4).
 *
 * @param {string} path — a location.pathname value
 */
export function canRecordOnRoute(path) {
  if (typeof path !== 'string' || path.length === 0) return false;
  if (listMatches(path, DENYLIST)) return false;
  return listMatches(path, ALLOWLIST);
}

// Exposed for tests + Feature-Status audits. NOT for runtime consumers — call
// canRecordOnRoute() instead.
export const _internals = Object.freeze({ ALLOWLIST, DENYLIST, matchesPrefix });
