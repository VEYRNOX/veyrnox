import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Store descriptions are user-facing security claims (I4). Two claims were false on
// both stores and were removed in #2757; #2826 then copied the App Store Connect text
// back into the repo and brought both back. These pins stop a "sync from the store"
// from doing that again. See store-metadata/README.md.
const en = JSON.parse(readFileSync(join(process.cwd(), 'store-metadata', 'en.json'), 'utf8'));
const descriptions = {
  'apple.description': en.apple.description.value,
  'play.fullDescription': en.play.fullDescription.value,
};

describe.each(Object.entries(descriptions))('%s', (_name, text) => {
  it('does not call the Security Advisor on-device (it posts to tip-chat)', () => {
    expect(text).not.toMatch(/on-device (security )?assistant/i);
  });

  it('does not say Buy happens inside the app (checkout opens a system browser)', () => {
    expect(text).not.toMatch(/buy crypto in-app/i);
    expect(text).not.toMatch(/directly from the app/i);
  });

  it('discloses that the Advisor talks to a server', () => {
    expect(text).toMatch(/talks to a server/i);
  });
});

describe('apple.description', () => {
  it('fits the App Store limit', () => {
    expect(en.apple.description.value.length).toBeLessThanOrEqual(en.apple.description.limit);
  });
});
