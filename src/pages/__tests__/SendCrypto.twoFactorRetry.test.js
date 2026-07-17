// src/pages/__tests__/SendCrypto.twoFactorRetry.test.js
//
// S1-S4 audit M-4: when sendTx fails after 2FA was consumed, the onError handler
// re-shows the TwoFactorGate step but previously gave no in-context explanation.
// This source scan pins that a toast.info is emitted BEFORE setStep("verify") so
// the user understands why they are back at the 2FA screen.
//
// "Retry affordance" = the existing setStep("verify") path (already BUILT).
// "Clarity message"  = the new toast.info call that M-4 adds.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, '../SendCrypto.jsx'), 'utf8');

describe('SendCrypto — M-4 2FA retry clarity message', () => {
  it('re-shows the TwoFactorGate step when the send gate throws TWO_FACTOR', () => {
    // The retry path (already BUILT): onError bounces the user back to "verify".
    expect(src).toMatch(/SEND_GATE\.TWO_FACTOR/);
    expect(src).toMatch(/setStep\(['"]verify['"]\)/);
  });

  it('emits a toast.info or toast.warn with a user-readable message in the TWO_FACTOR branch', () => {
    // M-4 gap: without this, the user silently lands back at the 2FA screen with
    // no indication that the send failed — they may assume the 2FA itself failed.
    // The clarity message must live in the same code block as setStep("verify").
    // We pin that toast.info (or toast.warn) appears BEFORE setStep in the source.
    const twoFactorBlock = src.match(
      /SEND_GATE\.TWO_FACTOR[\s\S]*?setStep\(['"]verify['"]\)/
    )?.[0] ?? '';
    expect(twoFactorBlock).toMatch(/toast\.(info|warn)\(/);
  });
});
