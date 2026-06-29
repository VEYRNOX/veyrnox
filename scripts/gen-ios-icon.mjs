/**
 * gen-ios-icon.mjs
 *
 * Converts public/veyrnox-icon.svg → the 1024×1024 PNG Xcode expects.
 * Requires librsvg (rsvg-convert) — install with: brew install librsvg
 *
 * Run automatically via the "preios" npm script before every cap sync ios.
 */

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const SRC = 'public/veyrnox-icon.svg';
const DEST = 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png';

if (!existsSync(SRC)) {
  console.error(`[gen-ios-icon] Source not found: ${SRC}`);
  process.exit(1);
}

try {
  execSync(`rsvg-convert -w 1024 -h 1024 "${SRC}" -o "${DEST}"`, { stdio: 'inherit' });
  console.log(`[gen-ios-icon] ✓ Icon written to ${DEST}`);
} catch {
  console.error('[gen-ios-icon] rsvg-convert failed — run: brew install librsvg');
  process.exit(1);
}
