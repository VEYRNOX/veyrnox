// src/api/__tests__/tipEdge.chatRoute.test.js
//
// Two guarantees about the TIP edge functions, asserted against their source
// the way tipScreen.proxy.test.js already does (these are Deno functions; the
// vitest env cannot execute them, but the properties that matter here are
// structural).
//
// 1. tip-screen must NOT carry a chat route.
//
//    It used to. #1614 repointed SecurityAdvisor at the TIP Worker's
//    /api/v1/chat directly, which left `action: 'chat'` in tip-screen with no
//    caller — but still deployed and anon-reachable, and worse than merely
//    unused:
//
//      - it forwarded `messages` upstream with no validation at all;
//      - tip-screen HMAC-signs its requests, which is PRECISELY why Cloudflare
//        Bot Fight Mode lets them through (#1614 established that the unsigned
//        tip-chat function gets a 403 challenge instead);
//      - it carried no device_id, so the Worker's per-device 30-turns/24h cap
//        never applied.
//
//    So it was a signed, uncapped path to the LLM, protecting a route nobody
//    called. Removed rather than hardened. This test stops it coming back by
//    the same route it arrived: a small "just add an action" edit.
//
// 2. tip-chat must validate messages per-entry.
//
//    A body-size cap is not a message cap. 128 KB is one body, but it can be
//    ten thousand tiny messages, or one message with a role upstream treats as
//    an instruction.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const screenSrc = readFileSync(
  join(root, 'supabase', 'functions', 'tip-screen', 'index.ts'), 'utf8');
const chatSrc = readFileSync(
  join(root, 'supabase', 'functions', 'tip-chat', 'index.ts'), 'utf8');

/**
 * Source with comments stripped.
 *
 * The removal in tip-screen is documented by a comment that necessarily NAMES
 * the endpoint and the `action === 'chat'` branch it removed — so a naive
 * `not.toMatch` on the raw file matches its own explanation and fails. Same
 * shape as the EXP_TABLE case in shamir.doc-drift.test.js: assert on what the
 * code DOES, not on whether a string appears anywhere.
 *
 * Deleting that comment to satisfy a regex would be the wrong trade — it is the
 * only place the signed-bypass reasoning is written down.
 */
const codeOnly = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((line) => !line.trim().startsWith('//'))
  .join('\n');

const screenCode = codeOnly(screenSrc);
const chatCode = codeOnly(chatSrc);

describe('wiring guard', () => {
  it('read both edge function sources', () => {
    // Without this a bad path would make every negative assertion below pass
    // against an empty string.
    expect(screenSrc.length).toBeGreaterThan(1000);
    expect(chatSrc.length).toBeGreaterThan(1000);
  });
});

describe('tip-screen carries no chat route', () => {
  it('does not branch on an action of "chat"', () => {
    expect(screenCode).not.toMatch(/action\s*===\s*['"]chat['"]/);
  });

  it('does not reference the advisor chat endpoint', () => {
    expect(screenCode).not.toMatch(/agents\/security-advisor\/chat/);
  });

  it('does not stream an SSE passthrough', () => {
    // The chat branch returned upstream.body as text/event-stream. Screening is
    // JSON only, so an event-stream response here means the route is back.
    expect(screenCode).not.toMatch(/text\/event-stream/);
  });

  it('still screens — the removal must not have taken the real route with it', () => {
    expect(screenCode).toMatch(/\/api\/v1\/screen/);
    expect(screenCode).toMatch(/X-Signature/);
  });
});

describe('tip-chat validates messages per entry', () => {
  it('caps how many messages one request may carry', () => {
    expect(chatCode).toMatch(/MAX_CHAT_MESSAGES/);
    expect(chatCode).toMatch(/too_many_messages/);
  });

  it('caps the length of any single message', () => {
    // Split into MAX_USER_CONTENT (8K) + MAX_SYSTEM_CONTENT (32K) so Advisor's
    // KB+advisories system prompt fits without lifting the user-input cap.
    expect(chatCode).toMatch(/MAX_USER_CONTENT/);
    expect(chatCode).toMatch(/MAX_SYSTEM_CONTENT/);
    expect(chatCode).toMatch(/message_too_long/);
  });

  it('allowlists roles rather than denylisting them', () => {
    expect(chatCode).toMatch(/role !== 'system' && role !== 'user' && role !== 'assistant'/);
    expect(chatCode).toMatch(/bad_message_role/);
  });

  it('rejects empty or non-string content', () => {
    expect(chatCode).toMatch(/bad_message_content/);
  });

  it('requires a RevenueCat user id and the AI Security Protection entitlement', () => {
    expect(chatCode).toMatch(/x-rc-user-id/);
    expect(chatCode).toMatch(/REQUIRED_ENTITLEMENT = 'ai_security_protection'/);
    expect(chatCode).toMatch(/REVENUECAT_V1_SECRET_KEY/);
    expect(chatCode).toMatch(/entitlement_required/);
  });

  it('rejects the request instead of filtering bad entries out', () => {
    // Silently dropping messages would change the conversation the caller
    // believes it sent. Every failure path must return, not continue.
    expect(chatCode).not.toMatch(/messages\s*\.\s*filter\s*\(/);
  });
});

describe('tip-chat does not hand upstream diagnostics to the caller', () => {
  // The `!upstream.ok` branch shipped carrying a comment that labelled itself
  // temporary — "TEMP DEBUG: relay upstream body ... Revert to generic 502 once
  // diagnosed" — and returned upstream's status, content-type and 500 chars of
  // its body straight to whoever called. Flagged in
  // docs/security-diffs/diff-2026-08-08.md.
  //
  // A `// TEMP` comment is not a control. Nothing expires it, no check fails
  // when it survives, and the same repo removed exactly this pattern from
  // functions/api/buy/session.js five commits earlier (#1605) while adding it
  // here (#1614). These assertions are what makes the removal stick.

  it('does not return the upstream body to the caller', () => {
    expect(chatCode).not.toMatch(/upstream_body/);
  });

  it('does not return the upstream content-type to the caller', () => {
    expect(chatCode).not.toMatch(/upstream_ct/);
  });

  it('logs the upstream detail server-side instead', () => {
    // The detail is not discarded — it goes where operators can read it and
    // callers cannot. Same shape as buy/session.js `upstreamErr()`.
    expect(chatCode).toMatch(/console\.error/);
  });

  it('gives the caller a correlation ref so a report can be tied to a log line', () => {
    expect(chatCode).toMatch(/\bref\b/);
  });

  it('KEEPS the deliberate 402 body relay — that one is a contract, not a leak', () => {
    // 402 is the Advisor cap. Its JSON body drives the upgrade prompt, so the
    // client genuinely needs it. This test exists so a later "stop relaying
    // upstream bodies" sweep does not take the cap UX with it.
    expect(chatCode).toMatch(/upstream\.status === 402/);
    expect(chatCode).toMatch(/status: 402/);
  });
});

describe('tip-chat header describes the wiring that actually exists', () => {
  // Paired assertion: SecurityAdvisor.jsx must call /api/edge/tip-chat
  // AND this file's header must state WIRED. Flipping one without the other
  // fails the pair, which is what stops the header drifting from reality.
  //
  // Asserted on the RAW source, not the comment-stripped copy above: the
  // claim under test IS a comment.
  const advisorSrc = readFileSync(
    join(root, 'src', 'components', 'SecurityAdvisor.jsx'), 'utf8');

  it('read the advisor source', () => {
    expect(advisorSrc.length).toBeGreaterThan(1000);
  });

  it('the wallet routes through this function', () => {
    expect(advisorSrc).toMatch(/\/api\/edge\/tip-chat/);
  });

  it('the header states it IS wired', () => {
    // Marker rather than prose match — reworded prose would silently drift.
    expect(chatSrc).toMatch(/STATUS: BUILT, WIRED/);
  });
});

describe('edge proxy allows streaming tip-chat', () => {
  const edgeProxySrc = readFileSync(
    join(root, 'functions', 'api', 'edge', '[fn].js'), 'utf8');

  it('allowlists tip-chat', () => {
    expect(edgeProxySrc).toMatch(/'tip-chat'/);
  });

  it('passes through SSE responses without buffering them into text', () => {
    expect(edgeProxySrc).toMatch(/text\/event-stream/);
    expect(edgeProxySrc).toMatch(/new Response\(res\.body/);
  });
});

// The entitlement gate's input is an unauthenticated request header, and its
// verdict is an outbound call to RevenueCat on OUR API key. Two properties have
// to hold, and neither is visible from the happy path.
//
// Asserted against `chatCode` (comments stripped) throughout: the reasoning for
// each of these lives in a comment in the source that necessarily NAMES the
// thing it replaced, so a raw-source assertion would match its own explanation.
describe('tip-chat entitlement lookup is bounded and cached in both directions', () => {
  it('screens X-Rc-User-Id before it reaches a URL path segment', () => {
    // The value is interpolated into api.revenuecat.com/v1/subscribers/<id>.
    // Bounds + control-character screening, same rule as safeRcUserId() in
    // functions/api/edge/[fn].js — this function is reachable directly via
    // SecurityAdvisor's LEGACY_TIP_CHAT_URL, so it cannot lean on the proxy's.
    expect(chatCode).toMatch(/function safeRcUserId/);
    expect(chatCode).toMatch(/MAX_RC_USER_ID = 1500/);
    expect(chatCode).toMatch(/safeRcUserId\(req\.headers\.get\('x-rc-user-id'\)\)/);
  });

  it('does not read the raw header straight into the lookup', () => {
    // The pre-fix form. Scoped to the assignment rather than the header name,
    // which legitimately still appears in the CORS allow-headers list.
    expect(chatCode).not.toMatch(/rcUserId\s*=\s*\(req\.headers\.get\('x-rc-user-id'\)\s*\?\?\s*''\)/);
  });

  it('caches negative verdicts, not only positive ones', () => {
    // Only the `ok` path used to cache, so every unentitled or unknown id
    // re-hit RevenueCat — one outbound call per inbound request, on an id any
    // caller supplies. Both verdicts now go through one writer.
    expect(chatCode).toMatch(/function rememberEntitlement/);
    expect(chatCode).toMatch(/rememberEntitlement\(appUserId, false\)/);
    expect(chatCode).toMatch(/rememberEntitlement\(appUserId, ok\)/);
    expect(chatCode).toMatch(/ENTITLEMENT_NEG_CACHE_TTL_MS/);
  });

  it('writes the cache in exactly one place', () => {
    // A second `entitlementCache.set(` would be a write that skips the size cap
    // and the positive/negative TTL split. One writer is the invariant.
    expect(chatCode.match(/entitlementCache\.set\(/g) ?? []).toHaveLength(1);
  });

  it('bounds the cache, which is keyed by caller-supplied ids', () => {
    // Caching a negative for an attacker-chosen key turns the map into a memory
    // sink unless it is capped.
    expect(chatCode).toMatch(/MAX_ENTITLEMENT_CACHE_ENTRIES/);
    expect(chatCode).toMatch(/entitlementCache\.clear\(\)/);
  });

  it('remembers a 404 verdict but never any other status', () => {
    // This assertion used to require `status >= 400 && status < 500`, on the
    // reasoning that any 4xx is a fact about the id. It is not: a 403 (wrong
    // RevenueCat API version for our key) and a 429 (RevenueCat throttling us)
    // are facts about US, and caching them denied paying subscribers. Narrowed
    // to 404; the reasoning lives in tipEdge.entitlementLookup.test.js.
    expect(chatCode).toMatch(/resp\.status === 404\) rememberEntitlement\(appUserId, false\)/);
  });

  it('keeps the negative TTL shorter than the positive one', () => {
    // The negative side is the one a real subscriber pays for: someone who buys
    // mid-session waits this long for the gate to notice.
    const pos = Number(/ENTITLEMENT_CACHE_TTL_MS = ([\d_]+)/.exec(chatCode)?.[1].replace(/_/g, ''));
    const neg = Number(/ENTITLEMENT_NEG_CACHE_TTL_MS = ([\d_]+)/.exec(chatCode)?.[1].replace(/_/g, ''));
    expect(Number.isFinite(pos) && Number.isFinite(neg)).toBe(true);
    expect(neg).toBeLessThan(pos);
  });
});
