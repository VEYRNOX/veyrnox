// Pins the 12px legibility floor (#2609 item 2).
//
// 9, 10 and 11px are below every platform legibility floor, and a hardcoded
// `text-[10px]` does not scale with the OS text-size setting the way the
// rem-based `text-xs` scale does. 372 such strings existed when #2609 was
// filed; 326 were migrated in the final sweep and the count is now ZERO.
//
// This started as a ratchet against an exact count while the migration ran in
// stages. It is a hard zero now — there is no budget to spend, and no file is
// exempt.
//
// Two things a reader should know before relaxing this:
//
//  1. `src/index.css` used to carry `[class*="text-[10px]"] { font-size: 12px
//     !important }` and siblings, inside a `@media (max-width: 639px)` block.
//     Those clamps are deleted. They only ever applied below 640px, so on a
//     tablet or desktop every one of those strings rendered at its literal
//     9-11px; and on a phone they quietly rescued each new hardcoded size,
//     which is how the count reached 326 without anyone noticing.
//  2. Migrating changes rendered size in BOTH directions of the breakpoint —
//     on a phone (`:root` is 18px there) `text-xs` is 13.5px against the
//     clamp's 12px, and on desktop it is 12px against a literal 10px. This is
//     a deliberate legibility change, not a refactor.
//
// Source scan rather than a render test for the same reason as
// button.callSiteTouchTargets.test.js: the defect lives in a class string that
// never reaches the DOM in jsdom without the Tailwind stylesheet.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = join(process.cwd(), "src");

// Any arbitrary Tailwind text size below 12px: 0-11 in px, or a rem value
// under 0.75rem. Matching only `text-[10px]` and `text-[11px]` — which is what
// this test did while the migration was in progress — would have missed the 12
// `text-[9px]` strings and the single `text-[0.625rem]` that the final sweep
// found.
const SUB_12PX = /text-\[(?:\d|1[01])px\]|text-\[0\.(?:[0-6]\d*|7[0-4]\d*)rem\]/g;

const EXTENSIONS = [".jsx", ".js", ".ts", ".tsx", ".css"];

// This file is the one legitimate holder of those strings — the regex above
// and the comments explaining what was migrated both spell them out, so an
// unscoped scan matches its own source and fails on itself. That is not a
// hypothetical: it is what the first run of this test did. Only THIS file is
// exempt; every other test file is scanned, and none of them carries a
// sub-12px class today.
const SELF = join(SRC, "components/__tests__/typography.minimumSize.test.js");

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return EXTENSIONS.some((ext) => name.endsWith(ext)) ? [full] : [];
  });
}

describe("Typography — 12px legibility floor (#2609)", () => {
  it("no file under src/ declares a text size below 12px", () => {
    const offenders = [];
    for (const file of sourceFiles(SRC)) {
      if (file === SELF) continue;
      const hits = readFileSync(file, "utf8").match(SUB_12PX);
      if (hits) offenders.push(`${file.slice(SRC.length + 1)} → ${[...new Set(hits)].join(", ")}`);
    }
    expect(
      offenders,
      "a sub-12px text size was introduced. Use text-xs (12px) or larger — it is "
      + "rem-based, so it scales with the OS text-size setting, which a hardcoded "
      + "px value does not. The index.css clamp that used to paper over these on "
      + "phones has been deleted (#2609), so a 10px label now renders at 10px on "
      + "every screen.",
    ).toEqual([]);
  });
});
