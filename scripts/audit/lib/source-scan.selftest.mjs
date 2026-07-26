// scripts/audit/lib/source-scan.selftest.mjs
//
// Standalone self-test for the shared audit scanner. Run: `npm run check:source-scan`
// (dedicated required CI step, and first in the `pretest` chain).
//
// NOT a vitest file, and deliberately not named *.test.mjs. It is a plain Node
// script: assertions run at import time and it signals via process.exit(1). Vitest
// cannot collect it — adding `scripts/**/*.test.mjs` to the vitest `include` makes
// the run FAIL with "No test suite found in file" (0 tests), and a genuine assertion
// failure would process.exit() the worker mid-run rather than report a test failure.
// If you want these covered by vitest, port them to describe/it first.
//
// It was named *.test.mjs from 2026-06-17 to 2026-07-26 and run by nothing — the
// header said "run it manually", which is not a guard. Wiring it to CI is the fix.
//
// Why it earns a required step: `stripCommentsAndStrings` is the shared scanner
// behind `check:rng` and `scripts/audit/eth-wallet-audit.mjs`. When it breaks it
// breaks OPEN — it blanks real code, so the greps find nothing and every dependent
// gate reports green. Reverting the regex-literal state fix (the bug this file's
// case 1 pins) leaves `check:rng` passing with "✓ no insecure randomness" while
// silently scanning nothing. These assertions are the only thing that fails.
//
// Each case asserts that a BANNED token in real code survives stripping (so the
// scanner would catch it) and that the same token in a comment/string is blanked.

import { stripCommentsAndStrings } from './source-scan.mjs';

let fail = 0;
const has = (s, needle) => s.includes(needle);
function check(name, cond) {
  if (cond) { console.log(`  ok  ${name}`); }
  else { console.error(`  FAIL ${name}`); fail++; }
}

const stripped = (s) => stripCommentsAndStrings(s);

// 1. Regex literal containing a quote must NOT swallow following code (bug #1).
{
  const src = `const re = /['"]/;\ncallFetch(mnemonic);`;
  const out = stripped(src);
  check('regex-with-quote: following code preserved', has(out, 'callFetch(mnemonic)'));
  check('regex-with-quote: regex body blanked', !has(out, `/['"]/`));
}

// 2. Template interpolation code must be scanned, not blanked (bug #2).
{
  const src = 'const u = `https://x/${privateKey}`;\nconst r = `v=${Math.random()}`;';
  const out = stripped(src);
  check('template interp: secret identifier visible', has(out, 'privateKey'));
  check('template interp: Math.random visible', has(out, 'Math.random()'));
  check('template interp: literal text blanked', !has(out, 'https://x/'));
}

// 3. Line numbers preserved across a multiline template (bug #3 / line drift).
{
  const src = 'const t = `a\nb\nc`;\nMath.random();';
  const out = stripped(src);
  const lineOfBanned = out.split('\n').findIndex((l) => l.includes('Math.random()'));
  check('multiline template: line numbers preserved', lineOfBanned === 3);
}

// 4. Comments and plain strings are still blanked (no false positives).
{
  const src = `// Math.random() is bad\nconst s = "use Math.random() here";\nlet ok = 1;`;
  const out = stripped(src);
  check('comment: banned token blanked', !has(out, 'Math.random()'));
  check('string: banned token blanked', out.split('\n')[1] && !out.split('\n')[1].includes('Math.random()'));
  check('comment/string: real code kept', has(out, 'let ok = 1'));
}

// 5. Division is not mistaken for a regex (no over-blanking of real code).
{
  const src = `const a = b / c; fetch(seed);`;
  const out = stripped(src);
  check('division: following code preserved', has(out, 'fetch(seed)'));
}

if (fail > 0) { console.error(`\nsource-scan self-test: ${fail} FAILED`); process.exit(1); }
console.log('\nsource-scan self-test: all passed');
