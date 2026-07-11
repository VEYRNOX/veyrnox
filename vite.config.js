import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import inject from '@rollup/plugin-inject'

// logLevel 'error' suppresses Vite's startup banner too, so the
// "Local: http://localhost:5173/" line never prints. This tiny plugin restores
// just the URL print on listen, keeping warnings quiet.
const printUrls = () => ({
  name: 'print-dev-urls',
  configureServer(server) {
    const announce = () => {
      // Prefer Vite's resolved URLs; fall back to the bound socket address so a
      // URL always prints even when resolvedUrls isn't populated yet.
      const local = server.resolvedUrls?.local?.[0];
      let url = local;
      if (!url) {
        const addr = server.httpServer?.address();
        const port = addr && typeof addr === 'object' ? addr.port : server.config.server.port;
        if (port) url = `http://localhost:${port}/`;
      }
      if (url) console.log(`\n  ➜  Vite dev server ready: ${url}\n`); // eslint-disable-line no-console
    };
    const httpServer = server.httpServer;
    if (httpServer) {
      if (httpServer.listening) setTimeout(announce, 0);
      else httpServer.once('listening', () => setTimeout(announce, 0));
    }
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// H-1 BUILD-TIME GUARD — a PRODUCTION/RELEASE build must NEVER resolve DEMO=true.
//
// DEMO mode caches the vault password in plaintext localStorage (see
// src/lib/biometricUnlock.js demo branch + src/api/demoClient.js). That is an
// accepted, clearly-labelled simulation cost in a demo build, but catastrophic
// if it ever shipped in a real store release.
//
// "Release" is signalled EXPLICITLY by VITE_RELEASE=1 (set by the `build:release`
// / `mobile:build:release` scripts — the canonical store-build path). We can't
// key off Vite's production MODE/PROD: the legitimate demo build is itself a
// `vite build` (MODE=production, PROD=true), so PROD cannot distinguish a demo
// build from a store build. A positive, explicit release marker can.
//
// "Demo" is signalled by VITE_DEMO_MODE=1 (set by `mobile:build:demo`).
//
// The contradiction RELEASE + DEMO must be unbuildable, not merely warned about —
// so we throw here, before any bundle is emitted. Legitimate paths are untouched:
//   • mobile:build:demo  → DEMO, no RELEASE  → allowed (demo)
//   • build / mobile:build / *:release → RELEASE (or neither), no DEMO → allowed
//   • RELEASE + DEMO     → build FAILS here
// A runtime belt-and-suspenders assertion lives in src/api/demoClient.js.
const RELEASE_BUILD = process.env.VITE_RELEASE === '1';
const DEMO_BUILD = process.env.VITE_DEMO_MODE === '1';

// https://vite.dev/config/
export default defineConfig(({ command }) => {
  if (command === 'build' && RELEASE_BUILD && DEMO_BUILD) {
    throw new Error(
      '\n\n' +
        '╔════════════════════════════════════════════════════════════════════╗\n' +
        '║  REFUSING TO BUILD: VITE_RELEASE=1 and VITE_DEMO_MODE=1 are both set. ║\n' +
        '║                                                                      ║\n' +
        '║  A production/release build must NEVER resolve DEMO=true. DEMO mode   ║\n' +
        '║  caches the vault password in plaintext localStorage (a simulation   ║\n' +
        '║  cost acceptable only in a demo build). Shipping it in a release is   ║\n' +
        '║  catastrophic (SAST H-1).                                             ║\n' +
        '║                                                                      ║\n' +
        '║  Build a DEMO bundle with `npm run mobile:build:demo` (no RELEASE),   ║\n' +
        '║  or a STORE bundle with `npm run mobile:build:release` (no DEMO).     ║\n' +
        '╚════════════════════════════════════════════════════════════════════╝\n',
    );
  }
  return {
    logLevel: 'error', // Suppress warnings, only show errors
    // The '@/...' -> src alias used to be supplied by the @base44/vite-plugin.
    // That plugin was removed (base44 removal, Phase 4), so declare it here
    // explicitly. Mirrors jsconfig.json and vitest.config.js.
    define: {
      'process.env': '{}',
      global: 'globalThis',
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        // CONSOLE-1 (#179): resolve the bare `buffer` specifier to the real
        // `buffer` npm polyfill (already in the tree via @solana/web3.js) instead
        // of Vite's throwing/warning browser-external stub. src/main.jsx imports
        // `buffer` to install a global Buffer; without this alias that import
        // hits the stub and yields `undefined`. See src/main.jsx for the full
        // rationale. Browser-safe; no signer/serializer bytes change.
        buffer: 'buffer',
        // DEV/E2E ONLY: stub @revenuecat/purchases-capacitor so the Vite dev
        // server (and the 18 Playwright specs that boot it) run without the
        // native RevenueCat runtime (F-001). The package IS installed
        // (package.json) and its real JS bridge MUST reach native builds —
        // `mobile:build:*` runs `vite build`, so an unconditional alias here
        // would silently disconnect the native purchases SDK (configure()
        // no-ops, entitlements fail-closed to free) while looking configured.
        // Scoped to `serve` so every `vite build` output keeps the real bridge.
        ...(command === 'serve'
          ? { '@revenuecat/purchases-capacitor': fileURLToPath(new URL('./src/lib/stubs/revenuecat-stub.js', import.meta.url)) }
          : {}),
      },
    },
    plugins: [
      react(),
      printUrls(),
      inject({ Buffer: ['buffer', 'Buffer'], include: ['src/**'] }),
    ],
    // Pre-bundle the wallet-core's crypto deps so Vite doesn't discover them
    // mid-session and trigger an optimize + forced full-reload (which can flash a
    // blank page on first load). hash-wasm inlines its WASM as base64, so no WASM
    // plugin is needed.
    optimizeDeps: {
      include: ['@scure/bip39', '@scure/bip32', '@noble/curves', '@noble/hashes', 'hash-wasm', 'ethers', 'buffer', '@walletconnect/web3wallet', '@walletconnect/utils', '@walletconnect/core'],
      esbuildOptions: {
        target: 'es2020', // Use modern JS for faster bundling
      },
    },
    server: {
      middlewareMode: false,
      // Reduce memory usage and enable persistent cache
      watch: {
        ignored: ['**/.git/**', '**/node_modules/**', '**/dist/**', '**/.claude/**'],
      },
    },
    build: {
      minify: 'esbuild', // Faster than terser, nearly same size
      sourcemap: false, // Disable sourcemaps in production
      esbuild: {
        target: 'es2020', // Use modern JS for smaller bundle + faster minification
        legalComments: 'none', // Strip legal comments
      },
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks(id) {
            // recharts + d3 deps are ~350KB and only needed on chart pages —
            // split them out so the dashboard initial load doesn't pay for them.
            if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-') || id.includes('node_modules/victory-')) {
              return 'charts';
            }
          },
        },
        // The hardware-wallet libs (@ledgerhq/*) are OPTIONAL and not in
        // package.json. Mark them external so a missing dep can't hard-fail the
        // production build (rollup otherwise errors on the unresolved import).
        // HardwareWalletPage.jsx imports them dynamically and guarded, so when
        // they're absent the dynamic import rejects and the page degrades
        // gracefully. Install the deps + remove this entry to bundle Ledger support.
        external: [/^@ledgerhq\//],
      },
    },
  };
});
