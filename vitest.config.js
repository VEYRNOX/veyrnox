import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Test config for the wallet-core slice.
//  - jsdom gives us window.crypto.subtle + DOM globals so vault.js (WebCrypto
//    AES-GCM) and the WalletProvider can be exercised.
//  - fake-indexeddb/auto installs an in-memory IndexedDB so vaultStore tests
//    run without a browser.
//  - The '@/...' alias mirrors jsconfig.json so wallet-core imports resolve.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
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
  },
});
