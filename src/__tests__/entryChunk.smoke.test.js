/**
 * entryChunk.smoke — assert post-unlock heavy modules are NOT statically
 * imported into the entry chunk.
 *
 * The task-file has to survive future imports being re-tangled: instead of
 * parsing the built manifest (which requires `npm run build` and is slow /
 * fragile in CI), we grep the sources for the STATIC import forms that would
 * pull a heavy module into the entry graph. React.lazy() / dynamic import()
 * do NOT match, so a lazy-loaded module is invisible to these regexes.
 *
 * If this test fires, someone re-added a static import of a post-unlock heavy
 * module to a file that is statically reachable from src/App.jsx — the same
 * mistake this branch fixed for SecurityAdvisor.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const layoutSrc = readFileSync(join(here, '../components/Layout.jsx'), 'utf8');

describe('entry-chunk hygiene — Layout.jsx', () => {
  it('does NOT statically import SecurityAdvisor', () => {
    // A regressed `import SecurityAdvisor from "./SecurityAdvisor"` would put
    // ~245 KB of RC/TIP/threat-intel code back into the cold-unlock parse.
    expect(layoutSrc).not.toMatch(/^import\s+SecurityAdvisor\s+from\s+["'][^"']*SecurityAdvisor["'];?\s*$/m);
  });

  it('uses React.lazy() to route SecurityAdvisor through its own chunk', () => {
    expect(layoutSrc).toMatch(/lazy\s*\(\s*\(\)\s*=>\s*import\s*\(\s*["']\.?\/?SecurityAdvisor["']\s*\)\s*\)/);
  });

  it('wraps SecurityAdvisor in a Suspense boundary so the shell paints while the chunk streams', () => {
    // SafeSuspense (or a Suspense) must sit around the lazy component so a
    // slow chunk fetch does not blow up rendering.
    const idx = layoutSrc.indexOf('<SecurityAdvisor');
    expect(idx).toBeGreaterThan(-1);
    // Look for a Suspense-shaped wrapper opening tag within a small window
    // ABOVE the SecurityAdvisor usage — SafeSuspense/Suspense are both fine.
    const before = layoutSrc.slice(Math.max(0, idx - 400), idx);
    expect(before).toMatch(/<(SafeSuspense|Suspense)\b/);
  });
});
