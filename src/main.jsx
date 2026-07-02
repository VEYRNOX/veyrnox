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
import App from '@/App.jsx'
import '@/index.css'
import { installWebAuthnPolyfill } from '@veyrnox/webauthn-native'

// Install native WebAuthn polyfill on Capacitor
installWebAuthnPolyfill()

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
