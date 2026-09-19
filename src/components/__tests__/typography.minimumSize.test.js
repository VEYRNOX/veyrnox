// Pins the 12px legibility floor (#2609 item 2).
//
// 10px and 11px are below every platform legibility floor, and a hardcoded
// `text-[10px]` does not scale with the OS text-size setting the way the rem
// based `text-xs` scale does. 372 such strings existed when #2609 was filed.
//
// Two assertions with different jobs:
//
//  1. PRIMARY_SURFACES must be at ZERO, permanently. These are the screens a
//     user cannot avoid — the dashboard, the money path, wallet entry, the nav
//     chrome. A regression here is a real legibility loss, not a backlog item.
//
//  2. Everything else is a RATCHET against an exact count. Exact, not "no more
//     than", on purpose: `<=` lets the number quietly drift downward and then
//     back up within the slack, which is how a floor becomes a suggestion. A
//     migration PR is expected to lower REMAINING_BUDGET in the same commit —
//     that edit is the record that the number moved and why.
//
// Source scan rather than a render test for the same reason as
// button.callSiteTouchTargets.test.js: the defect lives in a class string that
// never reaches the DOM in jsdom without the Tailwind stylesheet.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = join(process.cwd(), "src") + "/";

// Migrated by #2609. Any sub-12px class reappearing in one of these is a
// regression, not a leftover.
const PRIMARY_SURFACES = [
  "pages/Dashboard.jsx",
  "pages/SendCrypto.jsx",
  "components/QuickAccessGrid.jsx",
  "components/FeeSelector.jsx",
  "components/WalletEntry.jsx",
  "components/TransactionIntelligencePanel.jsx",
  "components/Layout.jsx",
];

// Everything NOT in PRIMARY_SURFACES, counted after the #2609 migration.
// Lower this when you migrate more; never raise it.
const REMAINING_BUDGET = 313;

const SUB_12PX = /text-\[(?:10|11)px\]/g;

function jsxFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      return name === "__tests__" ? [] : jsxFiles(full);
    }
    return name.endsWith(".jsx") ? [full] : [];
  });
}

function countsByFile() {
  const out = new Map();
  for (const file of jsxFiles(SRC)) {
    const hits = (readFileSync(file, "utf8").match(SUB_12PX) || []).length;
    if (hits) out.set(file.slice(SRC.length), hits);
  }
  return out;
}

describe("Typography — 12px legibility floor (#2609)", () => {
  const counts = countsByFile();

  it("primary surfaces carry no sub-12px text", () => {
    const offenders = PRIMARY_SURFACES
      .filter((rel) => counts.has(rel))
      .map((rel) => `${rel} (${counts.get(rel)})`);
    expect(
      offenders,
      "sub-12px text reintroduced on a primary surface. These screens were "
      + "migrated to text-xs in #2609; 10px/11px is below every platform "
      + "legibility floor and does not scale with the OS text-size setting.",
    ).toEqual([]);
  });

  it(`the rest of the app is at exactly ${REMAINING_BUDGET} and does not grow`, () => {
    const total = [...counts.entries()]
      .filter(([rel]) => !PRIMARY_SURFACES.includes(rel))
      .reduce((n, [, hits]) => n + hits, 0);
    expect(
      total,
      total > REMAINING_BUDGET
        ? `sub-12px text grew to ${total}. New code uses text-xs (12px) or larger.`
        : `sub-12px text fell to ${total} — good. Lower REMAINING_BUDGET in this `
          + "file to match, in the same commit that migrated them.",
    ).toBe(REMAINING_BUDGET);
  });
});
