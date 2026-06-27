// M8 — wc: URI passed to pairWithDapp must be structurally validated BEFORE the
// SDK is called. A non-wc URI (javascript:, https:, empty) must be rejected with
// a descriptive, machine-checkable error and client.pair must NOT be invoked.
// Asserts the error `code` (the contract), not copy.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.stubEnv('VITE_WALLETCONNECT_PROJECT_ID', 'test-project-id');

import { pairWithDapp, __setTestClient } from '../walletconnect/session.js';

describe('M8 — pairWithDapp structural URI validation', () => {
  let pairCalls;

  beforeEach(() => {
    pairCalls = [];
    __setTestClient({
      pair: vi.fn(async ({ uri }) => { pairCalls.push(uri); }),
    });
  });

  const bad = [
    ['javascript: injection', 'javascript:alert(1)'],
    ['empty string', ''],
    ['whitespace only', '   '],
    ['https URL', 'https://evil.example/wc'],
    ['wc without version', 'wc:topic'],
    ['wrong scheme prefix', 'notwc:abc@2?relay-protocol=irn'],
    ['non-string', undefined],
  ];

  for (const [label, uri] of bad) {
    it(`rejects ${label} before calling the SDK`, async () => {
      await expect(pairWithDapp(uri)).rejects.toMatchObject({
        code: 'WC_INVALID_PAIRING_URI',
      });
      expect(pairCalls).toHaveLength(0);
    });
  }

  it('accepts a well-formed wc v2 URI and passes it (trimmed) to the SDK', async () => {
    const uri =
      'wc:7f6e9b1c2d3e4f5a@2?relay-protocol=irn&symKey=deadbeef';
    await pairWithDapp(`  ${uri}  `);
    expect(pairCalls).toEqual([uri]);
  });
});
