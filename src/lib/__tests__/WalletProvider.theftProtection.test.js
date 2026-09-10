// Structural pin: the Theft Protection gate is called inside the isPrimary
// branch of WalletProvider.unlock(), AFTER assertUnlockCurrent() (line 1894
// today), and is NOT called in the decoy/hidden branch. A full render-driven
// integration test of unlock() is far heavier than this file justifies —
// every scenario (RASP fail, face decline, decoy no-op, iOS face-strict) is
// pinned in theftProtection.gate.test.js against the pure helper. This test
// just proves the wiring is present in the right place, so a regression that
// removes or misplaces the call is caught.
//
// Mutation-checked at write time (deleting the runTheftProtectionGate call
// from the isPrimary branch fails each of these assertions, and moving it
// into the decoy branch fails the location assertions).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(resolve(HERE, '../WalletProvider.jsx'), 'utf8');

// Strip line comments so an explanatory `// runTheftProtectionGate(...)` in
// a comment can never satisfy a structural pin — CLAUDE.md 2026-09-03
// "absence-check must be scoped to CODE" lesson.
const CODE = SRC.split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');

describe('WalletProvider.unlock() — Theft Protection wiring', () => {
  it('imports runTheftProtectionGate from @/lib/theftProtection', () => {
    expect(CODE).toMatch(
      /import\s*\{[^}]*\brunTheftProtectionGate\b[^}]*\}\s*from\s*['"]@\/lib\/theftProtection['"]/
    );
  });

  it('calls runTheftProtectionGate exactly once in the file', () => {
    const calls = CODE.match(/\brunTheftProtectionGate\s*\(/g) ?? [];
    expect(calls.length).toBe(1);
  });

  it('the call sits inside the `if (isPrimary)` branch, not the decoy else', () => {
    // Find the primary branch bounds — from `const isPrimary = !decoy && !hidden;`
    // to `setUnlocked(true);`. The call must fall inside that window.
    const primaryStart = CODE.indexOf('const isPrimary = !decoy && !hidden');
    const setUnlocked = CODE.indexOf('setUnlocked(true)', primaryStart);
    const callIdx = CODE.indexOf('runTheftProtectionGate(');
    expect(primaryStart).toBeGreaterThan(0);
    expect(setUnlocked).toBeGreaterThan(primaryStart);
    expect(callIdx).toBeGreaterThan(primaryStart);
    expect(callIdx).toBeLessThan(setUnlocked);
  });

  it('the call is awaited (fail-closed on throw, not fire-and-forget)', () => {
    expect(CODE).toMatch(/await\s+runTheftProtectionGate\s*\(/);
  });

  it('passes isPrimary to the gate (K-2 chokepoint)', () => {
    const m = CODE.match(/runTheftProtectionGate\s*\(\s*\{[^}]*\bisPrimary\b[^}]*\}/);
    expect(m).not.toBeNull();
  });
});
