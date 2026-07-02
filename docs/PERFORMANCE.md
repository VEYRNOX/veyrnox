# Veyrnox Performance Optimization Guide

## Build Performance

### What Changed
- **Minifier:** Switched to `esbuild` (faster than terser, ~1s vs ~3-4s for builds)
- **Target:** Set to `es2020` (uses modern JS, smaller bundles, faster parsing)
- **Source Maps:** Disabled in production builds (saves 2-3s + disk space)
- **Pre-bundling:** Optimized `optimizeDeps` with `esbuild` target

### Build Times (Baseline)
```bash
npm run build          # Typically 8-12s (was 12-15s)
npm run build:release  # Typically 10-14s (was 15-20s)
```

**Estimated improvement: 20-30% faster builds**

---

## Dev Server Performance

### Optimizations Applied
- **Watch ignore:** Excludes `.git/`, `node_modules/`, `.claude/` from file watchers
- **Chunk size warnings:** Suppressed for faster feedback
- **Modern JS target:** Faster transpilation during dev

### Tips for Faster Dev Sessions
1. **Use Chrome DevTools throttling** instead of relying on slow network simulation
2. **Keep browser open** — HMR reloads are instant for small changes
3. **Edit React/CSS first** — these have the fastest HMR
4. **Avoid full-page reloads** when possible — they're ~5x slower than HMR

---

## Test Performance

### Vitest Optimizations
- **Globals enabled:** No need for `import { test, expect }`
- **Coverage disabled by default:** Run with `--coverage` flag only when needed
- **Single worker:** Required for Argon2id memory safety (can't parallelize)

### Test Times
```bash
npm run test           # ~30-60s (depends on KDF tests)
npm run test -- unit   # Only non-KDF tests: ~5-10s
```

**To speed up development:**
```bash
# Run a specific test file
npx vitest src/lib/vault.test.js

# Watch mode (re-runs on save)
npx vitest --watch
```

---

## Code Splitting Strategy

### Automatic Chunks
- **`charts.js`** (~350KB) — recharts + d3 only load when needed on dashboard
- **`vendor.js`** (~200KB) — node_modules (pre-bundled)
- **`main.js`** — app code + critical deps

### How to Add More Chunks
```javascript
// In vite.config.js, add to manualChunks():
if (id.includes('node_modules/my-big-lib')) {
  return 'my-lib'; // Creates my-lib.js
}
```

---

## Bundle Size Analysis

### Commands
```bash
# See dependencies size
npm run analyze:deps

# Build with Rollup's built-in stats
npm run build -- --stats
```

### Target Sizes
- **Main bundle:** < 200KB (gzipped)
- **Charts chunk:** 100-150KB (gzipped)
- **Total initial load:** < 350KB (gzipped)

---

## Dependency Management

### Avoid Adding
- **Large UI libraries** without code splitting (prefer Radix UI over Material-UI)
- **Entire frameworks** as deps (use dynamic imports instead)
- **Duplicate polyfills** (check if already in tree via transitive deps)

### Check Before Adding
```bash
npm pack /path/to/pkg && tar tzf pkg-name.tgz | wc -l
# ^ Shows file count; > 1000 files is worth investigating
```

---

## Common Bottlenecks & Fixes

| Problem | Cause | Fix |
|---------|-------|-----|
| Dev server slow | File watching too many files | Restart server; check `.gitignore` |
| Build takes > 20s | Too much JS to minify | Split into more chunks |
| First page load > 3s | Large initial bundle | Lazy-load routes/charts |
| Hot reload takes > 1s | Complex component tree | Use React.memo, extract smaller components |
| Tests take > 2m | Multiple Argon2id derivations | Run specific test file instead |

---

## Profiling Tools

### Build Analysis
```bash
# See what's in your bundle (visual breakdown)
npx rollup-plugin-visualizer dist/stats.html
npm run build -- --stats
```

### Runtime Performance
```javascript
// In any React component:
import { useEffect } from 'react';

useEffect(() => {
  const start = performance.now();
  // ... expensive operation
  console.log(`Took ${performance.now() - start}ms`);
}, []);
```

### Dev Server Timing
Look at Vite's terminal output:
```
  ✓ 12 modules transformed (482ms)  ← HMR speed target: < 500ms
  ➜  Local:   http://localhost:5173/
```

---

## CI/CD Performance

### GitHub Actions
```yaml
# cache node_modules + dist for faster runs
- uses: actions/setup-node@v3
  with:
    cache: 'npm'
    cache-dependency-path: 'package-lock.json'

# Parallel jobs for build + test
- run: npm run build
- run: npm run test  # These can run in parallel
```

---

## Regression Prevention

### Monitor These Metrics
- `npm run build` time (should stay < 15s)
- `npm run test` time (should stay < 2m)
- Bundle size (watch with `npm run analyze:build`)

### Before Shipping
```bash
npm run lint         # Catch unused imports
npm run typecheck    # Catch type errors early
npm run build        # Full build test
npm run test         # All tests pass
npm run test:e2e     # Real browser tests
```

---

## References
- [Vite Performance Guide](https://vitejs.dev/guide/performance.html)
- [esbuild Docs](https://esbuild.github.io/)
- [Vitest Performance](https://vitest.dev/)
