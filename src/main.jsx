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

// Same class as the Buffer polyfill above. Digital Shield chunk (Keystone SDK
// / bc-ur-registry / uuid transitively) reads bare `process` at runtime. WKWebView
// has no `process` global, so the Send route ErrorBoundary'd on iOS with
// `ReferenceError: Can't find variable: process` on 1.0.1(31) / (32).
// Vite's `define: 'process.env': '{}'` covers property reads only, not
// bare-identifier reads. Install a minimal shim before any lazy chunk can load
// (Send/Receive/Buy chunks are all lazy — this runs before any of them).
if (typeof globalThis.process === 'undefined') {
  globalThis.process = { env: {}, browser: true, versions: {}, platform: 'browser' }
}

import { applyRpcEnvOverrides } from '@/wallet-core/rpcConfig.js'
applyRpcEnvOverrides()

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
// Side-effect init: registers i18next as a singleton and subscribes to
// LOCALE_CHANGED_EVENT. Imported here (not inside App) so the language is
// resolved BEFORE any component's first render — otherwise the initial
// paint would flash English before flipping to the chosen locale.
import '@/i18n'

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
