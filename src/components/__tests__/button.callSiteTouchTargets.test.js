// Pins the 44px touch-target floor at CALL SITES, which the variant pin in
// button.touchTarget.test.jsx cannot see.
//
// `cn()` uses twMerge, so a `className="h-7"` on a <Button> silently beats the
// size variant's h-11. That is how 31 sub-44px buttons — six of them
// destructive, including a "Revoke approval" and four delete actions — survived
// the variant fix in #2610. See #2607.
//
// This is a source scan, not a render test, precisely because the defect lives
// in a string that never reaches the DOM in jsdom without the Tailwind
// stylesheet.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// process.cwd() is the project root under vitest; import.meta.url resolved to a
// bare "/src" after transform, which scandir rejected.
const SRC = join(process.cwd(), "src") + "/";
const MIN_PX = 44;

// Vendored shadcn primitives with zero importers in this app. They carry their
// upstream sizes; adopting one means fixing its targets and deleting it here.
const UNUSED_VENDOR = ["ui/carousel.jsx", "ui/sidebar.jsx"];

function jsxFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      return name === "__tests__" ? [] : jsxFiles(full);
    }
    return name.endsWith(".jsx") ? [full] : [];
  });
}

// `(?<!min-)` matters: `min-h-10` on an h-auto button is a floor, not a height,
// and a button with py-3 around text-sm already clears 44px. Matching it as
// `h-10` reports a false positive — it did on the first run of this scan.
const OPEN_TAG = /<Button\b[\s\S]*?>/g;
const HEIGHT = /(?<!min-)\bh-(\d+)\b/;
const MIN_HEIGHT = /\bmin-h-(\d+)\b/;

function offenders() {
  const out = [];
  for (const file of jsxFiles(SRC)) {
    const rel = file.slice(SRC.length);
    if (UNUSED_VENDOR.some((v) => rel.endsWith(v))) continue;
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(OPEN_TAG)) {
      const tag = m[0];
      const h = HEIGHT.exec(tag) || MIN_HEIGHT.exec(tag);
      if (!h) continue;
      const px = Number(h[1]) * 4;
      if (px < MIN_PX) {
        out.push(`${rel}:${src.slice(0, m.index).split("\n").length} renders ${px}px`);
      }
    }
  }
  return out;
}

describe("Button call-site touch targets", () => {
  it("has no <Button> whose className forces it below 44px", () => {
    // Grow the hit area instead of shrinking the class if a dense row is tight
    // — see the wrapped NFT card row in MultiChainNFT.jsx for the pattern.
    expect(offenders()).toEqual([]);
  });

  it("actually inspects the tree it claims to cover", () => {
    // Without this, deleting the scan's body or breaking the path would leave
    // the assertion above passing vacuously forever.
    expect(jsxFiles(SRC).length).toBeGreaterThan(100);
  });
});
