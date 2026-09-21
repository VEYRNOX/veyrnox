// Buffer/process polyfills MUST be the first import in this file -- see
// globalPolyfills.js for why (ES import hoisting means anything written as
// inline statements here, even above other imports in source order, actually
// runs AFTER every import below has already been evaluated).
import '@/lib/globalPolyfills.js'

import { applyRpcEnvOverrides } from '@/wallet-core/rpcConfig.js'
applyRpcEnvOverrides()

// Hydrate the native-secure-storage cache (iOS Keychain / Android Keystore)
// before render so sync accessors (getSessionToken) see the persisted value on
// the very first read. Fire-and-forget: fail-open (a missed hydrate degrades
// to "no cached secret" and callers regenerate — see secureStore.js).
import { hydrateSecureStore } from '@/lib/secureStore.js'
hydrateSecureStore()

// Sentry init — NO-OP unless VITE_SENTRY_DSN is set AND consent granted AND
// not in a demo/deniability session. Runs before React renders so global
// error handlers are installed early. See src/lib/sentry.js for guards.
import { initSentry } from '@/lib/sentry'
initSentry()

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import RootErrorBoundary from '@/components/RootErrorBoundary.jsx'
import '@/index.css'
// Side-effect init: registers i18next as a singleton and subscribes to
// LOCALE_CHANGED_EVENT. Imported here (not inside App) so the language is
// resolved BEFORE any component's first render — otherwise the initial
// paint would flash English before flipping to the chosen locale.
import '@/i18n'
import { startOtaUpdate } from '@/lib/otaUpdate.js'

// OTA readiness signal. As a sibling of <App/> inside the error boundary, its
// effect only runs if the app committed a first render — so a bundle that throws
// on boot never reports ready, and native rolls it back on the next cold start.
// The update check itself then runs pre-unlock, the same in every session type.
function OtaBootSignal() {
  React.useEffect(() => { startOtaUpdate() }, [])
  return null
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <RootErrorBoundary>
    <App />
    <OtaBootSignal />
  </RootErrorBoundary>
)
