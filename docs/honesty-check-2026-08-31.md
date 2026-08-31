# Honesty check — 2026-08-31

Result: **zero code changes.** Two marketing/product claims were initially flagged
as "not in code", both were wrong. Both features are BUILT and shipping. This
doc exists so the same false negatives don't get re-raised.

## Claim 1 — "Vigil AI advisor reviews Transaction Simulation output"

**Status: BUILT.** Wired end-to-end on the Send review step, and on WalletConnect
per-request approvals.

- `src/pages/SendCrypto.jsx:1204-1236` — `advisorTxContext` packages simulation
  result + TIP threat-intel + presign verdict + risk verdict + policy decision
- `src/pages/SendCrypto.jsx:1238-1241` — `useEffect` publishes context to Vigil
  on every change via `publishAdvisorContext`
- `src/pages/SendCrypto.jsx:1243-1249` — `handleAskAdvisorAboutTx` opens Vigil
  with "Explain this transaction risk…" preloaded (`openAdvisor({autoSend:true})`)
- `src/pages/SendCrypto.jsx:2310-2314` — `<TransactionIntelligencePanel
  onAskAdvisor={handleAskAdvisorAboutTx}>` rendered on review/confirm step
- `src/components/TransactionIntelligencePanel.jsx:188-192` — the button
- `src/components/SecurityAdvisor.jsx:1120` — consumer, listens on
  `ADVISOR_CONTEXT_EVENT`
- `src/lib/advisorBridge.js` — the bridge
- `src/components/walletconnect/RequestApprovalModal.jsx:468` — same panel wired
  for WC per-request approvals

Right greps: `TransactionIntelligencePanel`, `advisorTxContext`, `openAdvisor`,
`handleAskAdvisorAboutTx`, `ADVISOR_CONTEXT_EVENT`.

Wrong greps that miss it: `advisor.*simulation`, `vigil.*sim`, `sim.*advisor`.

## Claim 2 — "Phishing site detection when a link tries to open Veyrnox"

**Status: BUILT.** Domain-based screening on WalletConnect session-proposal dApp
URLs and deep-link → pairing flows.

- `src/risk/knownBadDapps.js` — local seed + `checkDappDomain(url)` →
  `{domain, flagged, reason, source}`
- `src/risk/phishingFeed.js` — live domain feed, IndexedDB-cached, https-only,
  I2/I3/I4-gated (I3 gates confirmed at lines 147, 158, 196, 248, 257 as of
  2026-08-31 — no fetch in decoy/demo, no match in decoy/demo)
- Wired at 3 chokepoints:
  - `src/components/walletconnect/SessionProposalModal.jsx:42` — `dapp.flagged`
    disables Approve at line 201
  - `src/components/walletconnect/RequestApprovalModal.jsx:223` — per-request
  - `src/wallet-core/evm/walletconnect/session.js:221` — core `approveSession`
    (not just UI)
- `src/components/DeepLinkHandler.jsx:21-80` — deep-link → pairing entry,
  I3-gated at line 61
- Shipped PR #477, 2026-06-29 per `featureCatalogue.js:529`

Right greps: `checkDappDomain`, `knownBadDapps`, `phishingFeed`,
`LOCAL_KNOWN_BAD`.

Wrong greps that miss it: only looking at `threatIntelStore` (that's
address-only, not the domain store), only searching `src/lib/`, only searching
`SecurityAdvisorBanner.jsx`.

Two distinct stores exist and must not be conflated:
- `src/lib/threatIntelStore.js` — ADDRESS-keyed only, no domain field; Send
  screening
- `src/risk/knownBadDapps.js` + `phishingFeed.js` — DOMAIN-keyed; dApp origin
  screening

## Lesson

The two false negatives share one cause: greps too narrow, keyed on the words
the claim uses rather than the words the code uses. Before flagging a feature
as missing, cross-check against `featureCatalogue.js` and search for
implementation nouns (`Panel`, `Handler`, `Feed`, `Store`) not marketing verbs
(`reviews`, `detects`).
