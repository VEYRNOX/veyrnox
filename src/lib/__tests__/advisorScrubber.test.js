// Codex P1 2026-08-15 — pin the scrubber contract. Failing here means the
// SecurityAdvisor chat has stopped stripping seed/PIN/private-key patterns
// before egress. Do NOT relax an assertion to make a pass — a slipped
// secret is exactly the failure mode this fix exists to prevent.

import { describe, it, expect } from 'vitest';
import { scrubSecrets, __test__ } from '@/lib/advisorScrubber.js';

const { REDACTED } = __test__;

describe('scrubSecrets — Security Advisor outbound redaction', () => {
  it('redacts a 12-word BIP-39 mnemonic embedded in a question', () => {
    const q = 'my seed is abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about — is that safe?';
    const out = scrubSecrets(q);
    expect(out).toContain(REDACTED);
    expect(out).not.toMatch(/abandon abandon/);
    expect(out).toMatch(/is that safe/);
  });

  it('redacts a 24-word BIP-39 mnemonic', () => {
    const twenty4 = Array(24).fill('abandon').join(' ');
    const out = scrubSecrets(`help ${twenty4} thanks`);
    expect(out).toContain(REDACTED);
    expect(out).not.toContain('abandon abandon abandon');
  });

  it('redacts a 4-word BIP-39 run (short but still suspicious)', () => {
    const out = scrubSecrets('is abandon ability able about a valid seed?');
    expect(out).toContain(REDACTED);
    expect(out).not.toMatch(/abandon ability|able about/);
    // Preserves the trailing question the user actually asked.
    expect(out).toMatch(/valid seed\?$/);
  });

  it('does NOT over-redact a normal 3-word English phrase that happens to overlap the wordlist', () => {
    // "always awake" are both BIP-39 words; only 2, not the 4-in-a-row threshold.
    const out = scrubSecrets('I am always awake');
    expect(out).toBe('I am always awake');
  });

  it('redacts an EVM private key (0x + 64 hex)', () => {
    const key = '0x' + 'a'.repeat(64);
    const out = scrubSecrets(`my key is ${key}`);
    expect(out).toContain(REDACTED);
    expect(out).not.toContain(key);
  });

  it('redacts a bare 64-hex private key (no 0x prefix)', () => {
    const key = 'b'.repeat(64);
    const out = scrubSecrets(`raw: ${key}`);
    expect(out).toContain(REDACTED);
    expect(out).not.toContain(key);
  });

  it('redacts a PIN-shaped digit run', () => {
    const out = scrubSecrets('my PIN is 48273951');
    expect(out).toContain(REDACTED);
    expect(out).not.toMatch(/48273951/);
  });

  it('does NOT redact short numbers (< 4 digits)', () => {
    expect(scrubSecrets('page 42, section 7')).toBe('page 42, section 7');
  });

  it('handles empty / non-string input without throwing', () => {
    expect(scrubSecrets('')).toBe('');
    expect(scrubSecrets(null)).toBe('');
    expect(scrubSecrets(undefined)).toBe('');
    expect(scrubSecrets(42)).toBe('42');
  });
});
