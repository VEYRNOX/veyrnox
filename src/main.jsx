// CONSOLE-1 (#179): provide a browser-safe global `Buffer` BEFORE any app/crypto
// module loads. @solana/web3.js transitively bundles bn.js, whose module-init
// probes `typeof window.Buffer !== 'undefined' ? window.Buffer : require('buffer').Buffer`.
// Without a global Buffer the `require('buffer')` branch hits Vite's externalized
// stub and logs: 'Module "buffer" has been externalized for browser compatibility.
// Cannot access "buffer.Buffer" in client code.' whenever a SOL path loads.
// Installing the real `buffer` polyfill on globalThis makes bn.js take the
// global-Buffer branch and never touch the stub — the warning disappears. This
// is the genuine browser-safe Buffer (the `buffer` npm package, already in the
// tree via @solana/web3.js), so no signer/serializer byte output changes; web3.js
// already serialized transactions via its own bundled copy of this same polyfill.
import { Buffer as NodeBuffer } from 'buffer'
if (typeof globalThis.Buffer === 'undefined') {
  globalThis.Buffer = NodeBuffer
}

import { applyRpcEnvOverrides } from '@/wallet-core/rpcConfig.js'
applyRpcEnvOverrides()

import React from 'react'
import ReactDOM from 'react-dom/client'
import '@/index.css'

function showBootFailure(err) {
  const root = document.getElementById('root');
  if (!root) return;
  const detail = err && typeof err === 'object' && 'message' in err
    ? String(err.message)
    : String(err || 'Unknown startup failure');
  root.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#050608;color:#f3f7f6;padding:24px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">
      <div style="max-width:720px;width:100%;border:1px solid rgba(74,218,194,0.28);border-radius:20px;padding:24px;background:rgba(7,12,12,0.96);box-shadow:0 24px 80px rgba(0,0,0,0.45);">
        <div style="font-size:20px;font-weight:700;margin-bottom:12px;">Veyrnox startup failed</div>
        <div style="font-size:14px;line-height:1.5;opacity:0.92;">The app loaded the native shell but failed before React finished booting.</div>
        <pre style="margin:16px 0 0;white-space:pre-wrap;word-break:break-word;font-size:13px;line-height:1.45;color:#8df0dc;">${detail}</pre>
      </div>
    </div>
  `;
}

async function bootstrap() {
  try {
    // Side-effect init: registers i18next as a singleton and subscribes to
    // LOCALE_CHANGED_EVENT. Imported here (not inside App) so the language is
    // resolved BEFORE any component's first render — otherwise the initial
    // paint would flash English before flipping to the chosen locale.
    await import('@/i18n');
    const [{ default: App }] = await Promise.all([
      import('@/App.jsx'),
    ]);
    ReactDOM.createRoot(document.getElementById('root')).render(
      <App />
    );
  } catch (err) {
    console.error('[bootstrap] fatal startup error', err);
    showBootFailure(err);
  }
}

bootstrap();
