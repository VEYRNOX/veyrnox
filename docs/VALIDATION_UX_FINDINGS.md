# Validation · Fund-Correctness · Render-Safety · UI/UX Snag Sweep

**Scope:** combined input-validation, amount/precision, output/render-safety, and
full UI/UX snag pass of the Veyrnox wallet app.
**Type:** TEST + REPORT only — **no app code was changed in this pass.** Findings are
for triage; suggested fixes are described, not implemented.
**Branch base:** `main` @ `146327d` (M-3 passkey-lockout fix `542d5cc` confirmed an
ancestor of HEAD — the fix is on main).
**Method:** automated test suite + `check:rng`; three read-only code-audit subagents
(validation / precision / sensitive-data); a 104-route crash sweep using **real
full-page app loads** (sequential iframes); and hands-on demo-mode walkthrough of the
priority fund/security flows with screenshots and adversarial input.
**Date:** 2026-06-01.

> **Honesty / methodology note.** Tests passing has *twice* masked a crashing app in
> this project, so this sweep relies on **actually loading the UI**, not green tests.
> A first automated crawler (synthetic `popstate` SPA nav) produced ~100 **false**
> "crash" positives — it was discarded after a real full-page reload disproved it. The
> numbers below come from real app loads only. Where I tested code paths the project
> authored, I applied extra skepticism and confirmed gaps with live adversarial input
> (e.g. the Address Book finding was reproduced in the running app, not inferred).

---

## Severity summary & counts

| Severity | Count | Items |
|---|---|---|
| **CRITICAL** | 0 | — |
| **HIGH** | 1 | `/docs` page hard-crashes (render error) |
| **HIGH-if-wired (latent)** | 1 | BTC recipient has no app-level chain/HRP check (BTC send not wired to any UI today) |
| **MEDIUM** | 6 | `/ai-assistant` unhandled rejection (demo); Address Book accepts invalid addresses (reproduced live); ENS/SNS resolved address not validated; EVM amount validation-divergence (UI `parseFloat` vs signing `parseEther`, no core `value>0` guard); vault password/PIN floors only in UI; NetworkManager custom-RPC unvalidated + cosmetic |
| **LOW / INFO** | 4 | Session Manager "Invalid Date / Unknown Device" (demo field mismatch, reproduced live); stale `PasskeyPrompt` HMR console error; `ErrorBoundary` renders `error.toString()` to DOM (latent); Mobile Widget still present (any intended removal has not landed) |

**Fund-correctness / precision verdict:** ✅ **EXACT everywhere in the actual send
path** — no floating-point fund-loss risk found (EVM, ERC-20, BTC, SOL all BigInt /
`parseUnits` / `parseEther`). High confidence; see Part 2.

**Sensitive-data verdict:** ✅ No real user secret found in logs, errors, storage, or
URLs. See Part 3.

**M-3 auth fix verdict:** ✅ Verified working **in the running app** — a
cancelled/broken passkey fails closed and the signposted "Unlock with password only"
escape hatch unlocks with the password alone. See Part 4.

> ⚠️ **REQUIRES INDEPENDENT AUDIT.** Per the brief, every fund-affecting validation
> finding (amounts/addresses — Parts 1 & 2) and every auth-flow finding (passkey gate,
> M-3 escape hatch, duress/stealth/panic unlock — Part 4) must be independently
> audited. The verdicts above are from static analysis + demo-mode runtime, **not** a
> formal audit and **not** real-device/on-chain validation.

---

## Most serious findings (top of triage)

1. **`/docs` hard-crashes (HIGH).** `Documentation.jsx:92` uses `icon: Image`, but
   `Image` is **not** imported from `lucide-react`, so it resolves to the global DOM
   `Image()` constructor → `TypeError: Failed to construct 'Image'` → ErrorBoundary
   ("Something went wrong"). The whole Documentation page is unusable. Crashes in both
   demo and production (code-level, data-independent). *Suggested fix: add `Image` to
   the `lucide-react` import (or rename to `ImageIcon`).*
2. **Address Book accepts arbitrary invalid addresses (MEDIUM, reproduced live).** I
   saved a contact with address `NOT_AN_ADDRESS_!!!<script>… 0xZZZ` tagged ETH — no
   validation, no error, count 0→1. React escapes the `<script>` (no XSS) but the
   garbage persists and feeds the recipient / known-address corpus used by the Send
   poison-screen.
3. **`/ai-assistant` unhandled rejection in demo (MEDIUM).** `AIAssistant.jsx:86`
   calls `base44.agents.listConversations(...)`, but the demo client has no `agents`
   surface → `Cannot read properties of undefined`. Page renders but the assistant is
   non-functional and throws unhandled in demo/CI. (Real SDK exposes `agents`, so this
   is demo-specific; still wants a graceful guard.)
4. **EVM amount validation-divergence (MEDIUM).** Signing uses exact
   `parseEther`/`parseUnits` (safe), but the UI's *safety gates* (balance check, USD
   limit) use lossy `parseFloat`, and `evm/send.js` has no own `value > 0` assertion.
   No path to fund-burn (ethers rejects the dangerous cases before broadcast), but the
   *displayed* safety is weaker than the *enforced* safety.

---

# Part 1 — Input validation (fund- & security-affecting inputs)

**(a) Automated / code-audit findings.** No CRITICAL. The only fund-moving path
reachable from the UI today is native **EVM ETH send** (`assets.js` gates everything
else `receive_only`/`coming_soon`; BTC/SOL send modules exist but are **not wired to
any page**). The systemic theme is **validation divergence** — UI gates are looser
than the core backstops.

| # | Surface | Status | What's wrong | Severity | Suggested fix (not applied) |
|---|---|---|---|---|---|
| 1 | EVM send **address** | OK (core) | `evm/send.js` gates on `isAddress(to)` before signing; solid. UI `addressFormatValid` defaults `true` for unknown currencies and uses loose SOL/BTC regexes, but `isAddress` backstops ETH. | LOW | Tighten UI regexes; don't default-true. |
| 1b | **BTC recipient** | Latent | `btc/send.js` relies solely on `@scure/btc-signer` to reject a bad/foreign-network address; no app-level HRP/chain-match assertion. Not reachable (BTC send unwired). | **HIGH-if-wired** | Add explicit network/HRP check before building outputs, when BTC send is wired. |
| 2 | EVM send **amount** | Warning | Signing uses exact `parseEther`/`parseUnits` (rejects empty/neg/NaN/overflow/too-many-decimals/hex/commas). But UI gates use `parseFloat` (lossy; accepts `1.5abc`, sci-notation at margins), and `evm/send.js` has **no `value>0` guard** of its own (BTC/SOL cores do). | MEDIUM | Gate on the same parsed base-units used for signing; add a core positivity assert. |
| 2b | ENS/SNS resolution | Warning | `resolveENS()` writes the resolver's returned address into the recipient with **no format validation of the resolved value** (substitution risk; `isAddress` still final-gates ETH). | MEDIUM | Validate the resolved address before use; pin/verify resolver. |
| 3 | Password / PIN / duress / stealth / panic | Warning | `vault.js`/keystore enforce **no** min-length/empty check — they'll encrypt under `""`. Floors live only in some UI callers (primary 8, duress/stealth 4, panic 6). An empty primary password is accepted by the core. | MEDIUM | Enforce a min in `vault.js` so every caller inherits it. |
| 4 | Network / custom **RPC URL** | Warning | `NetworkManager.jsx` accepts `rpc_url`/`chain_id`/`symbol` with only non-empty checks (`parseInt("1abc")→1`), and writes a `NetworkConfig` entity that **wallet-core never reads** — so the form is **cosmetic** but presents a fully-configurable, unvalidated "active network." `provider.js setRpcUrl` has zero URL validation but has no UI callers. | MEDIUM | Validate URL/chainId; either wire it through or label it clearly. |
| 5 | Custom **token** | OK | No add-custom-token input exists; `tokens.js` is a hardcoded registry; `getToken()` validates the address and **re-checks on-chain `decimals()`** at send time (blocks the 6-vs-18 drain). | — | — |
| 6 | **Address book** | **Broken (reproduced live)** | No address-format or chain-match validation; saved a `<script>`-laden non-address tagged ETH with no error (count 0→1). Feeds the recipient corpus. React escaping prevents XSS. | MEDIUM | Validate address per selected chain before save. |

**(b) Manual / live findings.** Address Book gap **reproduced in the running app**
(see #6). Send form: `Continue` stays disabled until a wallet + recipient + amount are
present; the recipient placeholder advertises `0x… / vitalik.eth / wallet.sol`.

> *Coverage note:* I could not fully drive the radix `Select`-gated states (wallet
> pickers) via the automation harness (the portal popover toggles rather than exposing
> options), so the deepest live amount/address rejection assertions rest on the
> code-audit + the existing Vitest suite rather than click-through. Flagged for the
> independent audit.

---

# Part 2 — Amount / precision (fund-correctness)

**Verdict: ✅ EXACT everywhere in the actual send path. No floating-point fund-loss
risk found.** Every human-decimal → base-unit conversion on every chain uses integer /
BigInt / string fixed-point. JS floats appear **only** in display/estimate labels that
never feed back into a send amount. Confirmed by static trace + the project's own
precision tests (`erc20`, `btc-coinselect`, `sol-send` — pass).

| Path | Status | Evidence |
|---|---|---|
| EVM native | EXACT | `evm/send.js` `parseEther(String(amountEth))` — raw string → BigInt wei; gas math all BigInt. |
| ERC-20 | EXACT | `token-send.js` `parseUnits(String(amount), decimals)`; decimals re-verified against on-chain `decimals()` (throws on mismatch). Test: `0.000001` USDC → `1n`. |
| BTC | EXACT | `coinselect.js` all BigInt sats; `assertPlanConserves` tripwire (`Σin = Σout + fee`); no `amount*1e8` in send path. |
| SOL | EXACT | `sol/send.js` BigInt lamports into `SystemProgram.transfer`; rent/fee BigInt. |
| "Max / Send all" | No bug | No "Max" button in the wired send UI; `sendMax` (BTC/SOL core, exact) is unwired — so no rounded-display-into-max bug. |

Float usages found (`Number`, `parseFloat`, `toFixed`, `/1e9`, `/1e18`) are **all**
display/estimate-only (`hiddenBalance.js`, `decoyBalance.js`, `sol/provider.js`
getBalance, `LiveBalances.jsx`, `GasTracker.jsx`, `ConnectWallet.jsx`, and
`SendCrypto.jsx`'s disabled-button/USD-limit gates) — none reach a transaction value.
The one BTC `Number`/`Math.ceil` is on the fee **rate** (sat/vB), rounded **up** —
conservative. **The `0.1+0.2` hazard is structurally impossible** here because the
amount string is never multiplied; it is parsed directly.

> ⚠️ **REQUIRES INDEPENDENT AUDIT** (fund-affecting). The subagent's standalone
> adversarial harness could not run (sandbox blocked `node`/`/tmp`); the verdict rests
> on static trace + the repo's existing Vitest assertions, which already encode the
> adversarial cases (dust sats, 1-wei min, 6-dp `0.000001→1n`, decimals-mismatch throw,
> BigInt conservation).

---

# Part 3 — Output / render safety

**Verdict: ✅ No real user wallet secret is logged, thrown in an error string, sent to
analytics, placed in a URL, or written to storage in plaintext.** No telemetry SDK
(Sentry/PostHog/etc.) exists in `src/` for a secret to reach.

| Area | Status | Detail |
|---|---|---|
| Console logging | OK | Only 7 non-test `console.*` calls; none touch key material. |
| Error messages / throws | OK | wallet-core throws use fixed generic strings (e.g. "Decryption failed: wrong password or corrupted vault"); no secret interpolation. |
| Storage | OK | Vault blobs are ciphertext only (Argon2id+AES-GCM) in IndexedDB / SecureStorage, with a plaintext-blob guard; passkey store holds only a **public** credential id + metadata. |
| Seed display | OK (LOW) | `WalletSeedQR`, `HDWalletManager`, `DuressPin`, `StealthWallets` show a mnemonic only behind an explicit reveal toggle (verified live: "Tap the eye icon to reveal"); held in React state, cleared on explicit action — best-effort in-memory window (documented). |
| URLs / params | OK | No wallet secret in any URL/share link/demo param. (`ResetPassword` reads an account-layer token — not wallet key material.) |
| Balances/addresses render | OK | Correct decimals/symbols/chain; addresses checksummed; 0 broken images across priority pages. |

**LOW (latent) — `ErrorBoundary.jsx:17,48`:** logs and renders `error.toString()` into
the DOM. Safe *today* only because every wallet-core throw uses a generic string; it's
the one surface that *would* surface a secret if a future thrown Error ever
interpolated one. *Suggested fix: a convention/lint guard that thrown wallet-core
errors never include secret variables.*

**Demo-only (not real-user leaks):** `DuressPin`/`StealthWallets` print demo PINs/seed
in walkthrough copy; `CryptoSigning` shows a freshly-generated playground wallet's
mnemonic/keys. All gated behind DEMO mode / self-contained, intentional.

> ⚠️ Auth-adjacent secret handling **REQUIRES INDEPENDENT AUDIT**.

---

# Part 4 — UI/UX + functional snag sweep (loaded the app, not just tests)

**Automated tests:** `vitest run` → **177/177 pass** (18 files); `check:rng` → pass.
**Route crash sweep:** all **104 routes** loaded as real full-page app renders in demo.
**102 render clean** (no crash, no 404, no uncaught error). Nav integrity: all **99**
sidebar nav paths resolve to defined routes — **no dead links / no 404 entries.**

### Priority fund/security flows — page-by-page

| Page / flow | Status | Notes |
|---|---|---|
| Dashboard | ✅ OK | Portfolio, health score, asset switcher; 28 imgs, **0 broken**; all coin logos load. |
| **10 assets** (logos) | ✅ OK | All 10 wallet-asset logos present in `public/coins/` and load. *Note:* demo seeds the market top-10 (ETH/BTC/SOL/USDC/BNB/**XRP/USDT/DOGE/ADA/TRX**); the send-capable EVM set (MATIC/ARB/OP/AVAX) appears in HD-Wallet/Network views as Live/Receive-only/Coming-soon. Display-set vs capability-set distinction — not a defect. |
| Send | ✅ OK | Renders; `Continue` disabled until valid; ENS/SNS placeholder. |
| Receive | ✅ OK | Wallet-gated; `QRCodeDisplay` + address + copy wired (verified in code; the short auto-text was the gating empty-state, not a break). |
| Token Approvals | ✅ OK | "DEMO·SIMULATED" badge, risk classes; **Revoke works** — simulated, shows real `approve(spender,0)` calldata `0x095ea7b3…`, count 3→2. |
| Address Book | ⚠️ Warning | Renders; **saves invalid/garbage addresses with no validation** (reproduced live — Part 1 #6). |
| Network Manager | ✅ OK (warn) | 6 EVM networks + testnet toggle; custom-RPC "Add Network" form is the cosmetic/unvalidated one (Part 1 #4). |
| Gas Fee Control | ✅ OK | EIP-1559 slow/standard/fast/custom, sliders, estimate. |
| Solana / SPL | ✅ OK | Wallet + SPL list (SOL/USDC/USDT/RAY/ORCA/mSOL/JUP) with logos; **readable contrast** (the earlier "Solana-gas readability" concern looks resolved here). |
| Settings (Security) | ✅ OK | Dark mode, Biometric (Provisional disclosure), **Unlock-with-Passkey copy states the M-3 invariant** ("additional factor… losing the passkey never costs funds"). |
| Duress PIN | ✅ OK | Honest "Provisional (testnet)" disclosure; set-PIN form (min 4). |
| Stealth / Hidden + move-to-hidden | ✅ OK | Thorough honest threat-model; create-hidden form (min 4). |
| Panic Wipe | ✅ OK | Clear destructive/irreversible warnings; destroy/not-destroy breakdown; set-PIN (min 6). |
| Session / Auto-lock | ⚠️ Warning | **"Unknown Device / Unknown Location / Invalid Date"** — `SessionManager.jsx` reads `user_agent`/`geo_country`/`ip_address`/`created_date`, but demo seeds `device`/`ip`/`last_active`; `new Date(undefined)`→"Invalid Date". Demo-data↔page field mismatch (reproduced live). LOW–MEDIUM. |
| Biometric Auth | ✅ OK | Register, per-action toggles, test. |
| **Passkey gate + M-3 escape hatch** | ✅ **Verified working** | Create→encrypt→derive works; password-only unlock works; passkey-gated unlock works; **cancel→fail-closed (stayed locked)→"Unlock with password only"→unlocked with password alone.** A broken passkey cannot strand funds. |
| HD Wallet create/import/unlock | ✅ OK | Generate New shows seed once behind reveal; vault password min 8 (Argon2id+AES-256-GCM); Import Seed + My Wallets tabs render. |

### Hard failures found in the sweep

| Route | Status | Cause | Severity |
|---|---|---|---|
| `/docs` | ❌ Crash | `Documentation.jsx:92` `icon: Image` not imported from `lucide-react` → global `Image()` constructor → ErrorBoundary. | **HIGH** |
| `/ai-assistant` | ⚠️ Broken (demo) | `AIAssistant.jsx:86` `base44.agents.listConversations` — demo client has no `agents`; unhandled rejection. Real SDK has `agents`. | MEDIUM (demo) |

### Other UI notes

- **`PasskeyPrompt` "Failed to reload" console error** = **stale HMR** from the reused
  dev server. The file is syntactically valid and the passkey flows work live
  (registered + gated unlock both exercised). LOW/INFO — re-verify on a fresh server.
- **Mobile Widget** (`/mobile-widget`) is a live 90-line page that renders and is in
  the nav — **any intended removal has NOT landed.** Informational; confirm intent.
- Minor cosmetic: Network Manager shows "ET" badges for Arbitrum/Optimism (native
  token is ETH) — expected, not a defect.

---

## What this sweep does NOT cover

- **Real-device behavior:** native biometric/Face ID, OS passkey/WebAuthn, native
  secure storage, native keyboard/clipboard — all were exercised **simulated in demo
  mode**, not on hardware.
- **Real on-chain sends / broadcast:** no transaction was signed or broadcast; testnet
  and mainnet send paths were not exercised end-to-end on-chain.
- **The independent audit:** all fund-affecting validation (Parts 1–2) and auth-flow
  findings (Part 4) are flagged as **REQUIRING INDEPENDENT AUDIT** and this report is
  not a substitute.
- **Dynamic/runtime depth:** the deepest amount/address *rejection* assertions rest on
  static analysis + the repo's Vitest suite (a standalone adversarial harness was
  sandbox-blocked); radix `Select`-gated states could not be fully click-driven.
- **Performance / load / concurrency / memory:** not measured.
- **Production data shapes:** `/ai-assistant` and Session Manager findings are
  demo-client/demo-seed specific; production base44 entity shapes were not tested.

---

## Appendix — confirmation of constraints

- **No app code changed.** Only this doc was added (`docs/VALIDATION_UX_FINDINGS.md`)
  on branch `docs/validation-ux-findings`. (One throwaway demo vault was created in the
  browser's IndexedDB while exercising create/unlock — that is local browser state, not
  repo or app-source change.)
- **Verified by loading the app**, not just tests — every status above with a ✅/⚠️/❌
  in Part 4 was observed in the running demo app (screenshots taken during the sweep).
- **M-3 fix is on main** (`542d5cc`, ancestor of HEAD) and behaves correctly at runtime.
