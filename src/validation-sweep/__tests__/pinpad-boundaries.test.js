// Validation sweep — PIN pad input boundaries (functional I/O).
//
// PinPad (src/components/security/PinPad.jsx) is a PURE, controlled component (no
// hooks), so it can be rendered with react-dom/server renderToStaticMarkup in the
// jsdom gate. We use React.createElement (no JSX) so this stays a plain .js file —
// the committed vitest.config.js has no @vitejs/plugin-react, so JSX would compile
// with the classic runtime and need a globalThis.React shim (see landing-guard.test.jsx).
//
// The dynamic boundaries (8-digit display/buffer cap, EXPLICIT submit, numeric-only,
// backspace, clear) have been EXTRACTED into the pure reducer src/lib/pinPadReducer.js
// (report T-INFRA-3) and are unit-tested there without a browser — see
// src/lib/__tests__/pinPadReducer.test.js. This file asserts the rendered contract
// of PinPad itself (keypad composition, ARIA, no paste surface) plus the SOURCE
// contract that the keyboard handler and the reducer are wired in.

import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import PinPad from '@/components/security/PinPad';
import { pinPadReduce, keyToPinAction } from '@/lib/pinPadReducer';

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
    expect(out).toContain('aria-label="2 of 8 digits entered"'); // live, value-derived
    expect(out).toContain('aria-label="Clear — re-enter PIN"');
    expect(out).toContain('aria-label="Delete last digit"');
  });

  it('the status dots reflect the controlled value length (no value echoed)', () => {
    // 0, partial, and full states — the dot fill count tracks value.length and the
    // digits themselves are never rendered into the DOM (shoulder-surf resistant).
    expect(html({ value: '' })).toContain('aria-label="0 of 8 digits entered"');
    expect(html({ value: '123' })).toContain('aria-label="3 of 8 digits entered"');
    expect(html({ value: '12345678' })).toContain('aria-label="8 of 8 digits entered"');
    expect(html({ value: '12345678' })).not.toContain('12345678');
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

describe('PIN pad — boundary logic (buffer cap + explicit submit + numeric-only) via the pure reducer', () => {
  // The boundaries now live in src/lib/pinPadReducer.js (report T-INFRA-3), so the
  // gate can drive them directly instead of asserting on source strings.
  it('blocks input at the buffer cap', () => {
    expect(pinPadReduce('12345678', '9')).toEqual({ value: '12345678', changed: false, complete: false });
  });

  it('a digit NEVER auto-completes — completion is explicit only (Fix A, §9 line-item 5)', () => {
    expect(pinPadReduce('1234567', '8').complete).toBe(false);
    expect(pinPadReduce('123456', '7').complete).toBe(false);
  });

  it('explicit submit completes for ANY length (6-digit value submittable on an 8-dot pad)', () => {
    expect(pinPadReduce('123456', 'submit', 8)).toEqual({ value: '123456', changed: false, complete: true });
    expect(pinPadReduce('12345678', 'submit', 8).complete).toBe(true);
  });

  it('is numeric-only (non-digit and multi-char actions are inert)', () => {
    expect(pinPadReduce('1', 'x').changed).toBe(false);
    expect(pinPadReduce('', '12').changed).toBe(false);
  });

  it('backspace deletes the last digit; clear empties', () => {
    expect(pinPadReduce('123', 'back').value).toBe('12');
    expect(pinPadReduce('123', 'clear').value).toBe('');
  });
});

describe('PIN pad — rendered submit control is length-agnostic (no digit-count oracle)', () => {
  it('renders an always-present Submit control', () => {
    expect(html({ value: '' })).toContain('aria-label="Submit PIN"');
  });

  // Isolate the submit button's own tag so the className substring "disabled:opacity-40"
  // (a Tailwind class, not the boolean attribute) can't be mistaken for a disabled attr.
  const submitTag = (out) => out.slice(out.indexOf('aria-label="Submit PIN"')).match(/^[^>]*>/)[0];

  it('the Submit control is NOT disabled by digit count — enabled at 0, 6 and 8 digits alike', () => {
    // A "enable at N digits" rule would re-introduce the exact length oracle Fix A
    // removes; the surface must be identical regardless of how many digits are typed.
    for (const v of ['', '123456', '12345678']) {
      expect(submitTag(html({ value: v }))).not.toMatch(/\sdisabled(=|\s|>)/);
    }
  });

  it('Submit is disabled only when the whole pad is disabled (not by length)', () => {
    expect(submitTag(html({ value: '123456', disabled: true }))).toMatch(/\sdisabled(=|\s|>)/);
  });
});

// FLAG A11Y-PIN-1 — RESOLVED. PinPad now has a keydown handler on a focusable
// container so a keyboard-only user can type their PIN directly (digits enter,
// Backspace deletes, Escape/Delete clears) instead of Tab-cycling 12 buttons.
describe('PIN pad — physical-keyboard entry is present (A11Y-PIN-1 fixed)', () => {
  const src = read('../../components/security/PinPad.jsx');

  it('wires a keydown handler on a focusable group container', () => {
    expect(src).toMatch(/onKeyDown/);
    expect(src).toMatch(/tabIndex/);
    expect(src).toContain('role="group"');
  });

  it('routes keys through the shared pure reducer (one source of truth)', () => {
    expect(src).toMatch(/keyToPinAction/);
    expect(src).toMatch(/pinPadReduce/);
  });

  it('the rendered container exposes the focusable PIN-entry group', () => {
    const out = html({ value: '' });
    expect(out).toContain('role="group"');
    expect(out).toContain('aria-label="PIN entry"');
    expect(out).toMatch(/tabindex="0"/i);
  });

  it('the key->action map covers digits, Backspace, Escape/Delete and Enter->submit (and nothing else)', () => {
    expect(keyToPinAction('5')).toBe('5');
    expect(keyToPinAction('Backspace')).toBe('back');
    expect(keyToPinAction('Escape')).toBe('clear');
    expect(keyToPinAction('Delete')).toBe('clear');
    expect(keyToPinAction('Enter')).toBe('submit');
    expect(keyToPinAction('a')).toBeNull();
  });
});
