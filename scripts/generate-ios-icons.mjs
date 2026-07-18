#!/usr/bin/env node
// Regenerate the iOS AppIcon asset catalog from the brand master SVG.
// Produces default (RGB — no alpha), dark, and tinted 1024x1024 variants
// and rewrites Contents.json so Xcode 15+ / iOS 18+ picks them up.
// Closes ECC audit findings I-P1-1 (alpha channel), I-P2-1 (dark/tinted),
// I-P3-1 (regen pipeline). See docs/audits/ecc-multi-lens-2026-07-18.md.

import sharp from "sharp";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const SVG_MASTER = join(REPO, "public", "veyrnox-icon.svg");
const OUT_DIR = join(
  REPO,
  "ios",
  "App",
  "App",
  "Assets.xcassets",
  "AppIcon.appiconset",
);
const SIZE = 1024;
const DEFAULT_PNG = "AppIcon-512@2x.png";
const DARK_PNG = "AppIcon-dark-512@2x.png";
const TINTED_PNG = "AppIcon-tinted-512@2x.png";

async function main() {
  const svg = await readFile(SVG_MASTER);
  await mkdir(OUT_DIR, { recursive: true });

  // Default: strip alpha (App Store rejects alpha channels on the icon),
  // flatten onto the brand hex fill so any anti-aliased edges land on
  // the same near-black surface the SVG rounded-rect uses.
  await sharp(svg, { density: 512 })
    .resize(SIZE, SIZE)
    .flatten({ background: "#0B0F14" })
    .png({ compressionLevel: 9 })
    .toFile(join(OUT_DIR, DEFAULT_PNG));

  // Dark: same mark, flattened onto pure black so the mark reads against
  // the iOS 18 dark home-screen glyph rendering pipeline.
  await sharp(svg, { density: 512 })
    .resize(SIZE, SIZE)
    .flatten({ background: "#000000" })
    .png({ compressionLevel: 9 })
    .toFile(join(OUT_DIR, DARK_PNG));

  // Tinted: grayscale on transparent, so iOS applies its system tint.
  // The mark must stay legible under any hue the system chooses.
  await sharp(svg, { density: 512 })
    .resize(SIZE, SIZE)
    .grayscale()
    .png({ compressionLevel: 9 })
    .toFile(join(OUT_DIR, TINTED_PNG));

  const contents = {
    images: [
      {
        filename: DEFAULT_PNG,
        idiom: "universal",
        platform: "ios",
        size: "1024x1024",
      },
      {
        appearances: [{ appearance: "luminosity", value: "dark" }],
        filename: DARK_PNG,
        idiom: "universal",
        platform: "ios",
        size: "1024x1024",
      },
      {
        appearances: [{ appearance: "luminosity", value: "tinted" }],
        filename: TINTED_PNG,
        idiom: "universal",
        platform: "ios",
        size: "1024x1024",
      },
    ],
    info: { author: "xcode", version: 1 },
  };
  await writeFile(
    join(OUT_DIR, "Contents.json"),
    JSON.stringify(contents, null, 2) + "\n",
  );

  console.log(`Wrote ${DEFAULT_PNG}, ${DARK_PNG}, ${TINTED_PNG}, Contents.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
