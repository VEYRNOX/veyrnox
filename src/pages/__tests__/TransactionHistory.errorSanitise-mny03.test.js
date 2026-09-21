// MNY-03 — the Solana tab of Transaction History rendered the raw upstream
// JSON-RPC error body verbatim (HTTP code + full JSON + a request uuid) via
// `error?.message || t("tx.history.error_generic_reason")`. Any error whose
// message didn't happen to contain "fetch" fell through to that raw text.
//
// Source-scan test, matching this file's existing sibling tests
// (refetch-i3, i3-egress) which pin TransactionHistory.jsx the same way.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, '../TransactionHistory.jsx'), 'utf8');

describe('TransactionHistory MNY-03 — no raw upstream error text reaches the UI', () => {
  it('the error_prefix reason resolves only through the two sanctioned, client-safe reason keys', () => {
    const idx = src.indexOf('t("tx.history.error_prefix"');
    expect(idx).toBeGreaterThan(-1);
    // Bounded window around the ternary, not the whole file (CLAUDE.md
    // "source pins need structural bounds") -- big enough to hold the whole
    // `{ reason: ... }` expression, small enough not to spill into the next
    // JSX block.
    const reasonExpr = src.slice(idx, idx + 300);
    expect(reasonExpr).toMatch(/error_fetch_reason/);
    expect(reasonExpr).toMatch(/error_generic_reason/);
    // Must NOT fall back to interpolating the raw Error#message.
    expect(reasonExpr).not.toMatch(/error\?\.message\s*\|\|/);
  });

  it('DEV-logs the real error for debugging instead of dropping it silently (OWASP: sanitise, don\'t swallow)', () => {
    expect(src).toMatch(/import\.meta\.env\.DEV\s*&&\s*isError\s*&&\s*error\s*\)/);
    expect(src).toMatch(/console\.error\(\s*['"]\[TransactionHistory\]/);
  });
});
