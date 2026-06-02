import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

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

// https://vite.dev/config/
export default defineConfig({
  logLevel: 'error', // Suppress warnings, only show errors
  // The '@/...' -> src alias used to be supplied by the @base44/vite-plugin.
  // That plugin was removed (base44 removal, Phase 4), so declare it here
  // explicitly. Mirrors jsconfig.json and vitest.config.js.
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    react(),
    printUrls(),
  ],
  // Pre-bundle the wallet-core's crypto deps so Vite doesn't discover them
  // mid-session and trigger an optimize + forced full-reload (which can flash a
  // blank page on first load). hash-wasm inlines its WASM as base64, so no WASM
  // plugin is needed.
  optimizeDeps: {
    include: ['@scure/bip39', '@scure/bip32', '@noble/curves', '@noble/hashes', 'hash-wasm', 'ethers'],
  },
});