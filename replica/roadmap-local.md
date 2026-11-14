# Veyrnox local-only agent roadmap

Status tags: all items are TARGET. Nothing here is built. Inputs: `replica/recon.md`, `replica/features.csv`. Pattern source: Era's scoped/expiring/revocable agent access, adapted so no key, balance or intent leaves the user's machine unless the user starts it.

## Design rules (non-negotiable)

- **I1** agents never see keys; they never sign. They can only submit an unsigned intent.
- **I2/I5** no Veyrnox backend in the path. The MCP server runs on the user's device (or a user-run companion on localhost). No hosted relay.
- **I3** the whole surface is absent in deniability/decoy: no listener, no pairing UI, no log of its existence.
- **I4** unknown scope, expired credential, locked wallet or gate error = deny.
- Infra lock: no new Supabase edge functions, no changes to tip-*, Transak or RevenueCat IDs. Entitlement gating in Phase 5 reads the existing `ai_security_protection` entitlement only.
- **Host decision (owner, 2026-10-31): QR-paired companion.** A small companion program on the user's computer serves the MCP on 127.0.0.1 and is a thin bridge only. The phone holds all wallet data, credentials and the signing gate. The companion stores no wallet data and no wallet or signing keys (it does keep a transport identity key and the pinned phone key, which are not wallet keys); it forwards each tool call to the phone and returns the phone's answer.

### Companion architecture (Phase 0 spec inputs)

- **Pairing (bootstrap order, review R1):** the companion generates its transport identity key first and displays a QR (in its own window) with {its public key fingerprint, LAN address:port, one-time secret, expiry <= 2 min}. The phone scans it, generates its own transport key, and runs a narrow initial-pairing handshake that is accepted only with the one-time secret, once, before expiry; both sides then pin each other's keys and the listener accepts only pinned keys. The one-time secret is never reusable and the pairing window closes on first success or expiry. Transport keys are permitted; wallet and signing keys are never on the companion. No server in the path (I5).
- **Channel:** direct phone <-> computer over the local network, end-to-end encrypted and mutually authenticated (X25519 + AEAD via @noble/@scure; no Web Crypto, no custom primitives). Reject anything not from the paired key. WebRTC is out unless signalling can be done with no server, because standard signalling is a backend.
- **Channel freshness (review R5):** Phase 0 selects an established authenticated channel protocol (not a hand-rolled one) with fresh per-session keys, directional nonce uniqueness, authenticated session identifiers and replay rejection. Duplicate-frame, reconnect-replay and restart/nonce-reuse tests are prerequisites for Phase 1.
- **Resource limits (review R6):** independent of paid-tier quotas, Phase 1 enforces on the phone (authoritative) request rate, concurrency, queued work and activity-log retention/size, and on the companion connection count. Rejected-request logging is bounded (sampled or aggregated) so the log cannot be used to exhaust storage, and storage exhaustion fails closed (deny reads) rather than dropping audit entries silently.
- **Credentials:** minted on the phone, shown once, hash-only at rest on the phone, scopes fixed at creation, mandatory expiry, revocable. The agent presents the credential to the companion; the phone verifies it on every call (the companion is not trusted to enforce scope).
- **Pull model:** the phone answers each read on demand and only while unlocked and the app is foregrounded or an explicit "agent session" is on. Locked, backgrounded or unreachable = deny with a generic error (I4).
- **Intents:** a `wallet:propose` call lands in the phone's inbox. Approval and signing happen only on the phone, through the existing gate. The companion never sees a signature request payload beyond the intent it forwarded.
- **Companion hardening:** the MCP endpoint binds loopback only (127.0.0.1) and is never exposed to the LAN. The phone link is a separate paired, encrypted transport: the companion listens for the phone on the LAN for that link only and accepts nothing but the paired key. Origin/Host checks (DNS rebinding), random port, no persistent log of wallet data, shows paired-phone status, one-click unpair. Distribution as a signed release; reproducible build target.
- **Known costs:** iOS backgrounding makes sessions foreground-only; local-network permission prompts; works only when phone and computer are on the same network; one more artifact to sign, ship and audit. Deniability: pairing UI and listener are absent in decoy mode, and the companion learns nothing about whether a decoy exists.
- **Still open for Phase 0 (the host itself is decided):** companion language/runtime (Node vs Rust single binary), how a phone-side listener is reached on iOS/Android (Capacitor plugin vs the phone dialling out to the companion, which is simpler: the companion listens on the LAN and the phone connects, so the phone never listens).

## Phase 0: design and threat model (S, ~1 week)

1. Choose host: desktop/web localhost MCP vs QR-paired companion. Write the threat model (prompt injection via chain metadata, malicious MCP client, localhost port abuse, DNS rebinding, clipboard/address swap).
2. Define scopes: `wallet:read` (balances, holdings, history), `wallet:propose` (submit unsigned intent). No `sign` scope exists.
3. Spec the tool schema (typed, bounded outputs, payload caps) and the credential format: random, hash-only at rest, scopes fixed at creation, mandatory expiry (default 24h, max 7d), revocable.
4. Treat all chain/token/NFT metadata returned to agents as untrusted data; strip or fence it.
- Done when: a reviewed spec exists and the `veyrnox-security-tdd` agent has written failing tests for deny paths.

## Phase 1: read-only local surface (M, 3-4 weeks)

1. Local Streamable-HTTP MCP bound to 127.0.0.1 only, random port, Origin/Host checks, per-session pairing code shown on the device.
2. Credential store: create, list, revoke, expiry. Revoke closes live sessions at once.
3. Read tools: balances, holdings, transaction history, fee estimates. Watch-only data, derived from state already on device.
4. Consent screen listing scopes in plain language; show connected agents and last activity.
5. Activity log (on-device only): every read and every write, with agent label and timestamp. No seeds/keys/PINs in it. Stored in primary-vault-protected storage, not plain localStorage (review R4).
6. Deniability/decoy (review R4): surface fully disabled. Adding keys to `ALL_RESIDUE_KEYS` is necessary but not sufficient: it only covers the panic wipe of localStorage, and decoy/hidden entry is an in-memory switch that does not run that wipe. So: (a) inventory every persistence backend the feature touches (localStorage, IndexedDB, native secure store, scheduled notifications) and add an erase-and-inspect test for each; (b) access-gate agent records in both hidden and decoy sessions; (c) session transitions cancel pending responses and writes so stale work cannot expose or recreate records.
- Done when: tests prove deny on missing/expired/revoked credential, non-loopback origin, locked wallet, and decoy mode; a real MCP client (Claude Desktop/Code) reads balances on a testnet wallet.

## Phase 2: propose-only intents (M, 4-6 weeks)

1. `wallet:propose` tool: agent submits {chain, to, asset, amount, memo}. Result is a pending intent, never a signed tx. On receipt the phone binds the intent to an immutable source wallet/address, explicit network, canonical asset and amount, and a session generation (review R2). The active wallet can be switched without re-auth, so approval is invalidated on any wallet, network, session or payload change, the bindings are shown at approval, and they are rechecked at signing.
2. Intent inbox on device. Each intent runs Transaction Simulation and the existing risk checks and shows plain-language risk before any signing.
3. Human approval required per intent: step-up re-auth, then the **complete** normal send authorization pipeline (review R3): `presignGateOrReject` is private to WalletConnectProvider and covers only RASP and transaction risk, while the Send flow separately applies `evaluateSendGate` (second factors, theft protection, wallet limits, asset eligibility). Intents must pass all of it, extracting a shared authorization service if needed; new per-agent limits (Phase 3) are additive to existing controls, never a replacement. A missing or errored gate = BLOCK.
4. Agent cannot approve, edit after approval, or resubmit around a rejection (idempotency key, rate limit).
5. Verify with simulation/preview only. Never enter a PIN or broadcast with real funds in the sim; mainnet confirmation needs a txid you supply.
- Done when: an agent-proposed testnet transfer goes through intent -> simulation -> approval -> sign on a physical device, and the same flow is provably blocked when the gate is forced to error.

## Phase 3: safety rails (S-M, 2-3 weeks)

1. Per-agent spend limits per period and per-intent caps; changing them needs step-up (matches existing spend-limit rules).
2. Address allowlist for proposals; new addresses need a cooling-off.
3. Kill switch: one tap revokes all agents and stops the listener.
4. Anomaly stop: N rejected intents in a window suspends that agent.
- Done when: limit/allowlist bypass attempts are covered by mutation-checked tests.

## Phase 4: alerts and watch rules (S, 2 weeks)

1. Local rules (balance below X, incoming from unknown address, approval requested). Output is a notification only. No rule can sign or propose.
2. Preview before enabling a rule.

## Phase 5: packaging and audit (S + external)

1. Gate behind the existing entitlement; tier tool-call quotas.
2. Documentation page for supported clients (any MCP client).
3. Include the agent surface in the independent audit scope. Anything in §24 (RASP, hardware KEK, attestation) interacting with it needs real-device verification first.

## Out of scope

Hosted/remote MCP, shared agent memory, any signing by an agent, bank aggregation, brokerage. Revisit a hosted option only as a separate, explicitly requested design with a new threat model.

## Next step

The host is decided (QR-paired companion). Phase 0 is tracked in #2923 and Phase 1 in #2924 (blocked on the Phase 0 spec). Phases 2-5 have no issues yet; file them when Phase 1 is underway, checking `main` first in case another session has started.
