import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Test config for the wallet-core slice.
//  - jsdom gives us window.crypto.subtle + DOM globals so vault.js (WebCrypto
//    AES-GCM) and the WalletProvider can be exercised.
//  - fake-indexeddb/auto installs an in-memory IndexedDB so vaultStore tests
//    run without a browser.
//  - The '@/...' alias mirrors jsconfig.json so wallet-core imports resolve.
//  - Git worktrees share the root node_modules (worktree node_modules/ is empty).
//    Vite's /@fs/ server only serves files within the worktree root by default, so
//    it cannot resolve packages from the repo-root node_modules (three levels up).
//    Whitelisting repoRoot via server.fs.allow lets Vite serve those files without
//    disabling fs.strict entirely. Normal Node resolution already finds fake-indexeddb
//    there; no alias is needed.
const __dir = fileURLToPath(new URL('.', import.meta.url));
// This worktree lives at Veyrnox/.claude/worktrees/<name>; the repo root is ../../..
const repoRoot = path.resolve(__dir, '../../..');

export default defineConfig({
  plugins: [react()],
  server: {
    fs: {
      allow: [__dir, repoRoot],
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['fake-indexeddb/auto', './vitest.setup.js'],
    include: ['src/**/*.test.{js,jsx}'],
    // The at-rest Argon2id KDF was raised to 192 MiB / t=3 (SAST M3). The pure-JS
    // WASM build in the Node/jsdom test env runs that KDF much slower than the
    // browser's native WASM (~2-3 s per derivation vs ~440 ms), and several tests
    // chain multiple real encrypt/decrypt operations. Raise the per-test and
    // per-hook budgets so genuine multi-KDF tests don't false-fail on timeout —
    // this reflects the heavier (intended) KDF cost, not slow test logic.
    testTimeout: 60000,
    hookTimeout: 60000,
    // After each test file's tests complete, vitest sends SIGTERM to the fork and
    // waits this long for a clean exit before force-killing. jsdom + WASM handles
    // (Argon2id) can take 20–30 s to release; raising to 45 s eliminates the
    // "[vitest-pool]: Timeout terminating forks worker" warning on slower machines.
    teardownTimeout: 45000,
    // Cap parallelism so concurrent 192 MiB Argon2id KDF allocations don't
    // exhaust the WASM heap (the pre-existing `RangeError: Invalid typed array
    // length` OOM flake). Vitest 4 removed `poolOptions`; the cap is now set via
    // the top-level `maxWorkers`/`minWorkers`. Pin to 1 (not 2) — two concurrent
    // 192 MiB derivations were enough to exhaust the heap, so we run the KDF
    // tests strictly serially with a single fork.
    pool: 'forks',
    maxWorkers: 1,
    minWorkers: 1,
  },
});
