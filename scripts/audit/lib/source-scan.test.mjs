// scripts/audit/lib/source-scan.test.mjs
//
// Standalone self-test (run: `node scripts/audit/lib/source-scan.test.mjs`).
// Vitest only collects src/**, so this guards the shared scanner directly.
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
