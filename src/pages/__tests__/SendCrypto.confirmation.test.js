// Structural regression guard for the EVM 1-confirmation failure path in
// SendCrypto. A full behavioural test would require mocking the entire send
// stack (signer, react-query, entities, step-up re-auth); this codebase pins
// that kind of send-flow wiring structurally instead (see
// send-gate-harness-a.test.js, which reads SendCrypto.jsx source). This guards
// against the raw.wait(1) `.catch` regressing to its previous silent swallow
// (`.catch(() => {/* … */})`) that left a failed/dropped 1-conf invisible.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, '../SendCrypto.jsx'), 'utf8');

describe('SendCrypto — EVM 1-conf failure is surfaced, not swallowed', () => {
  it('no longer carries the empty "still pending / failed" TODO swallow', () => {
    expect(src).not.toContain('surface a "still pending / failed" state in UI');
  });

  it('surfaces the unconfirmed state to the user and refreshes the tx list', () => {
    // The user-facing toast copy from the new catch handler (unique marker).
    expect(src).toContain('may still be pending');
    // The catch also refreshes the transaction list so the pending row is honest.
    expect(src).toMatch(/raw\.wait\(1\)/);
    expect(src).toContain('invalidateQueries');
  });
});
