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
    expect(chatCode).toMatch(/MAX_CHAT_CONTENT/);
    expect(chatCode).toMatch(/message_too_long/);
  });

  it('allowlists roles rather than denylisting them', () => {
    expect(chatCode).toMatch(/role !== 'system' && role !== 'user' && role !== 'assistant'/);
    expect(chatCode).toMatch(/bad_message_role/);
  });

  it('rejects empty or non-string content', () => {
    expect(chatCode).toMatch(/bad_message_content/);
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
