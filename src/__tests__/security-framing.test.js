// Framing guard (deniability): the Security duress/panic pages must NOT surface a
// configured-vs-not state. With slots always-provisioned, "is it set?" must have no
// observable answer in the UI — neither in copy NOR computed from blob presence.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(here, '..', rel), 'utf8');

const PAGES = ['pages/DuressPin.jsx', 'pages/PanicWipe.jsx'];

// Copy that frames the slot as a toggle / reveals configured state.
const FORBIDDEN_COPY = [
  'is active', 'No Duress PIN set', 'No panic/wipe PIN set',
  'Enable duress', 'Enable Duress', 'not configured', 'Disabled', 'Remove PIN',
];
// Logic that COMPUTES configured-vs-not from the slot for display.
const FORBIDDEN_LOGIC = ['hasDuressPin(', 'hasPanicPin('];

describe('Security framing — no configured-state oracle', () => {
  for (const page of PAGES) {
    it(`${page} has no configured-vs-not copy`, () => {
      const src = read(page);
      for (const s of FORBIDDEN_COPY) expect(src, `forbidden copy: "${s}"`).not.toContain(s);
    });
    it(`${page} does not compute configured state from slot presence`, () => {
      const src = read(page);
      for (const s of FORBIDDEN_LOGIC) expect(src, `forbidden logic: "${s}"`).not.toContain(s);
    });
  }
});
