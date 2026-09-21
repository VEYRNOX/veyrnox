import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// @capacitor/app has no openUrl(). It was dropped after Capacitor v2 and is
// absent from both the TS surface and the native plugin's method table, so any
// call rejects at the bridge at runtime. It shipped anyway in redeemCode.js and
// purchases.js because their unit tests mocked openUrl into existence — the
// mock made a non-existent method look real, and three green tests described a
// feature that had never worked on a device.
//
// This pin is deliberately scoped to CODE, not to whole files: the fix commit
// documents what it removed, so those files legitimately contain the string
// "App.openUrl" in prose forever. Matching the raw file would fire on the very
// comments that explain the bug.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

function sourceFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(js|jsx|ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

describe('@capacitor/app has no openUrl', () => {
  it('is not called anywhere in src/', () => {
    const offenders = sourceFiles('src').filter((f) =>
      /\bApp\.openUrl\s*\(/.test(stripComments(readFileSync(f, 'utf8')))
    );
    expect(offenders).toEqual([]);
  });

  it('strips comments rather than whole files, so prose about the bug survives', () => {
    // Guards the pin itself: if stripComments ever stopped working, the test
    // above would fire on redeemCode.js's explanatory comment and someone
    // would "fix" it by deleting the explanation.
    // Built by concatenation on purpose: a literal here would be matched by
    // the scan above, and this file would fail its own pin.
    const call = `App.${'openUrl'}({ url });`;
    expect(stripComments(`// ${call}\nconst a = 1;`)).not.toMatch(/App\.openUrl/);
    expect(stripComments(call)).toMatch(/App\.openUrl/);
  });
});
