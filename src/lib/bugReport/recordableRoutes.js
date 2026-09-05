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
//
// EVERY literal below is a real path declared in src/App.jsx. That is not a
// convention, it is enforced: routesMatchRouter.test.js parses App.jsx and
// fails if any entry matches no declared route.
//
// It is enforced because the original lists were written against a route table
// this app does not have. Of 24 literals, 3 were real; ALL SIXTEEN denylist
// entries matched zero routes (`/pin`, `/seed`, `/wc`, `/decoy`, `/settings/wipe`,
// …). The real routes are `/duress-pin`, `/panic-wipe`, `/stealth-wallets`,
// `/wallet-seed-qr`, `/crypto-signing`. Nothing was exploitable, because a
// denylist of phantoms sitting behind an allowlist of phantoms fails closed —
// but the moment Slice 1b made the allowlist real, the denylist would have
// stopped nothing. The segment-boundary rule made it worse rather than better:
// a naive startsWith would have caught `/duress-pin` under `/duress`; requiring
// `prefix + '/'` means it does not.
//
// The old tests could not catch this. They were thorough and mutation-checked
// on the MATCHING LOGIC, and every path they asserted was invented, so they
// were self-consistent with the module and never touched the router.

// ALLOWLIST IS EXACT-MATCH. DENYLIST IS PREFIX-MATCH. The asymmetry is the
// point: broad matching in the deny direction fails safe, broad matching in the
// allow direction is how an unreviewed route becomes recordable.
//
// The design doc originally read "/settings (top level and all subroutes)" and
// guarded the inheritance with a `/settings/wipe` denylist entry — a path that
// is not a route. That guard was gesturing at a real hazard: with prefix
// allow-matching, ANY future `/settings/<x>` route is recordable the moment it
// is added, silently, which contradicts this module's own promise that new
// routes default to DENIED. Replacing one phantom with another would have left
// the hazard; making the allowlist exact removes it. Every entry below is a
// leaf route, so this costs nothing today and forces a conscious line change
// the day a subroute appears.
const ALLOWLIST = Object.freeze([
  '/',          // Dashboard
  '/receive',
  // Settings — DECIDED 2026-09-05, kept recordable. See the note below.
  '/settings',
  '/plans',
  // `/docs` is the real Documentation route. The design doc asked for `/help`
  // and `/documentation`; neither exists. `/features` redirects here.
  '/docs',
]);

// Why /settings stays allowed, having been flagged for re-decision:
//
//  1. The coercion concern is absent. Settings renders NO duress, stealth or
//     panic state — those pages are separate routes and all three are denied
//     below. It does not even link to them. The rehearsal row is deliberately
//     built to disclose nothing ("must read as ordinary — no wallet/set count,
//     no multi-set hint, no 'decoy' wording", RehearsalSettingsRow.jsx).
//  2. What it does render is posture booleans — KEK enrolled, biometric on,
//     2FA on. The #2256 Advisor review judged exactly these non-coercion-
//     relevant while removing `duress_configured` and `stealth_pool_present`
//     from the same payload. Same threat model, same answer.
//  3. Denying it would break the feature outright, not merely narrow it. The
//     bug-report button lives in Settings, and useRouteKillSwitch aborts
//     immediately when armed on a denied route — every recording would abort
//     the instant it started.
//
// Residual, stated rather than hidden: WhitelistManager renders inline here and
// lists counterparty addresses. That is a real disclosure to support, but it is
// the class the design already accepted for `/receive` (the address QR) and `/`
// (balances), with the accepted v1 mitigation being preview-and-re-record —
// "In-app redaction UI. (Skipped for v1 — user deletes and re-records if a
// sensitive detail lands in frame)". Denying /settings over a weaker disclosure
// than one already allowlisted would be incoherent. If v1 redaction is ever
// reconsidered, WhitelistManager is the first candidate.

const DENYLIST = Object.freeze([
  // Seed and backup material.
  '/wallet-seed-qr',      // WalletSeedQR — the seed, on screen, as a QR
  '/verify',              // SeedVerificationPage — seed-word quiz
  '/personal-backup',     // PersonalBackup — shard export + passphrase entry
  '/onboarding',          // prefix: covers /onboarding/restore-shares
  '/hd-wallet',           // HDWalletManager — derivation paths / account tree

  // Coercion configuration. Recording any of these proves the user configured
  // the coercion stack, which is the one thing deniability must never leak.
  '/duress-pin',
  '/stealth-wallets',
  '/panic-wipe',
  '/wallet-access',       // WalletAccessReset — PIN reset / recovery

  // Signing and money movement.
  //
  // `/send` is denied WHOLE, which is stricter than the design doc asked for.
  // The doc wanted `/send/form` recordable and `/send/confirm` + `/send/sign`
  // denied. Those are not routes: SendCrypto.jsx is a single `/send` route and
  // the confirm and sign steps are component state inside it, so there is no
  // path the gate can distinguish. Splitting SendCrypto into real subroutes is
  // the prerequisite for recording the form, and until that happens the honest
  // answer is to deny the route rather than record through the signing step.
  '/send',
  '/crypto-signing',
  '/walletconnect',
  '/connect',             // ConnectWallet — pairing + session approval

  // Authentication posture.
  '/biometric-auth',
  '/hardware-wallet',     // device pairing; /hardware-wallets redirects here

  // Dev-only routes. Prefix: covers /dev/prf-spike.
  '/dev',
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
 * The decision, over arbitrary lists. Denylist is consulted FIRST, so a path on
 * both lists is denied.
 *
 * Parameterised on the lists only so the deny-wins ordering stays testable. The
 * real lists deliberately do not overlap — routesMatchRouter.test.js asserts no
 * allowlist entry covers a denylist entry — which means the ordering cannot be
 * exercised through canRecordOnRoute() and would otherwise be untested until the
 * day someone introduces an overlap. The previous suite covered it with
 * `/settings/wipe`, a path that is not a route.
 */
function evaluate(path, allowlist, denylist) {
  if (typeof path !== 'string' || path.length === 0) return false;
  // Deny by PREFIX — broad matching fails safe, and `/onboarding` and `/dev`
  // rely on it to cover their subroutes.
  if (listMatches(path, denylist)) return false;
  // Allow by EXACT MATCH ONLY. A subroute of an allowed route is a new route,
  // and new routes default to DENIED.
  return allowlist.includes(path);
}

/**
 * True iff a recording MAY happen on this route. Denylist wins.
 * A non-string, empty, or unknown path is DENIED (I4).
 *
 * @param {string} path — a location.pathname value
 */
export function canRecordOnRoute(path) {
  return evaluate(path, ALLOWLIST, DENYLIST);
}

// Exposed for tests + Feature-Status audits. NOT for runtime consumers — call
// canRecordOnRoute() instead.
export const _internals = Object.freeze({ ALLOWLIST, DENYLIST, matchesPrefix, evaluate });
