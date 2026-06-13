// Validation sweep — PIN pad input boundaries (functional I/O).
//
// PinPad (src/components/security/PinPad.jsx) is a PURE, controlled component (no
// hooks), so it can be rendered with react-dom/server renderToStaticMarkup in the
// jsdom gate. We use React.createElement (no JSX) so this stays a plain .js file —
// the committed vitest.config.js has no @vitejs/plugin-react, so JSX would compile
// with the classic runtime and need a globalThis.React shim (see landing-guard.test.jsx).
//
// What is testable here (rendered contract) vs not (live interaction) is itself a
// finding — the dynamic boundaries (6-digit cap firing onComplete exactly once,
// rapid double-tap, confirm-mismatch reset) live inside the un-exported press()
// closure and the stateful PARENT (WalletEntry, hook-driven). With no RTL/Playwright
// in the gate they are NOT unit-testable. See report: FLAG T-INFRA-1.

import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import PinPad from '@/components/security/PinPad';

// The committed vitest.config.js has no @vitejs/plugin-react, so PinPad's JSX is
// compiled with the CLASSIC runtime (`React.createElement` as a free identifier).
// Expose React as a global so it resolves at render time — a no-op under the
// automatic runtime, identical shim to src/components/__tests__/landing-guard.test.jsx.
globalThis.React = React;

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const html = (props) => renderToStaticMarkup(React.createElement(PinPad, props));

describe('PIN pad — rendered keypad composition (numeric-only, no paste surface)', () => {
  it('renders exactly digits 0-9 plus Re-enter and Delete — no free-text input to paste into', () => {
    const out = html({ value: '' });
    for (const d of ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']) {
      expect(out).toContain(`>${d}</button>`);
    }
    // There is NO <input>/<textarea>: paste / non-numeric keystrokes are physically
    // impossible. The brief's "paste into PIN" and "non-numeric" cases are N/A by
    // construction (a genuine strength — recorded, not a defect).
    expect(out).not.toMatch(/<input/);
    expect(out).not.toMatch(/<textarea/);
    expect(out).toContain('Re-enter');
  });

  it('exposes ARIA on the entry surface (status dots, clear, delete)', () => {
    const out = html({ value: '12' });
    expect(out).toContain('role="status"');
    expect(out).toContain('aria-label="2 of 6 digits entered"'); // live, value-derived
    expect(out).toContain('aria-label="Clear — re-enter PIN"');
    expect(out).toContain('aria-label="Delete last digit"');
  });

  it('the status dots reflect the controlled value length (no value echoed)', () => {
    // 0, partial, and full states — the dot fill count tracks value.length and the
    // digits themselves are never rendered into the DOM (shoulder-surf resistant).
    expect(html({ value: '' })).toContain('aria-label="0 of 6 digits entered"');
    expect(html({ value: '123' })).toContain('aria-label="3 of 6 digits entered"');
    expect(html({ value: '123456' })).toContain('aria-label="6 of 6 digits entered"');
    expect(html({ value: '123456' })).not.toContain('123456');
  });

  it('disabled prop disables every key (clear/delete also disabled when value empty)', () => {
    const disabledAll = html({ value: '12', disabled: true });
    expect((disabledAll.match(/disabled/g) || []).length).toBeGreaterThanOrEqual(12);
    const emptyEnabled = html({ value: '' });
    // clear + back are disabled at empty even when the pad is enabled
    expect(emptyEnabled).toMatch(/aria-label="Clear — re-enter PIN"[^>]*disabled/);
    expect(emptyEnabled).toMatch(/aria-label="Delete last digit"[^>]*disabled/);
  });
});

describe('PIN pad — boundary logic is present in source (cap + auto-submit)', () => {
  const src = read('../../components/security/PinPad.jsx');

  it('blocks input at length and fires onComplete exactly at length', () => {
    // Source contract for the boundaries we cannot drive live in the gate.
    expect(src).toContain('if (value.length >= length) return;');
    expect(src).toContain('if (next.length === length) onComplete?.(next);');
  });

  // FLAG A11Y-PIN-1 — keyboard-only entry: there is NO keydown handler, so physical
  // number-key / paste entry is impossible; a keyboard user must Tab to each of the
  // 12 buttons and press Space/Enter. Documented as a flag, not asserted-away.
  it('CONFIRMED: no physical-keyboard digit handler (onKeyDown/onKeyPress absent)', () => {
    expect(src).not.toMatch(/onKeyDown|onKeyPress|addEventListener\(['"]key/);
  });
});
