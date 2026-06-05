# SAST-PASS-FULL — Full-build security review

- **Date:** 2026-06-02
- **Branch:** `chore/sast-pass-full` (off `main`, with `fix/biometric-keychain-binding` merged in so the new biometric password-cache is scanned before it lands)
- **Scope:** entire `src/` tree (299 JS/JSX files, ~44k LOC), config, and dependencies. Both automated tooling and targeted manual review against the wallet threat model (seed/keys = total loss on any leak).
- **Baseline:** `vitest` 317/317 pass, `npm run check:rng` pass — both green before and after the one fix in this pass.

## TL;DR

- **No CRITICAL findings. No seed/private-key/password exposure in any production runtime path.** The crown-jewel invariants all hold: the decrypted mnemonic lives only in an in-memory `useRef`, is zeroed on lock, and is never persisted; every at-rest write is Argon2id+AES-GCM ciphertext; there is **no telemetry/analytics anywhere**; no secret is logged or thrown.
- **Automated tooling is clean:** semgrep (5 security rulesets + auto, 301 files) → **0 findings**; eslint → **0 messages**. `npm audit` reports 17 known vulns but **effectively none are reachable** in this app's shipped runtime (breakdown below).
- **Top item for your triage (HIGH):** in **DEMO builds only**, the vault password is cached in plaintext `localStorage` (`biometricUnlock.js:72`). It is well-gated and documented as "not real security," but the consequence (cleartext vault password at rest) warrants a hard build-time guard so a release can never resolve `DEMO=true`.
- **Fixed in this pass (1, trivial):** HTML-escaped the user-controlled strings in the seed-print `document.write` (`WalletSeedQR.jsx`).
- Everything else is flagged below for your decision; no deferred npm work was touched.

---

## 1. Automated tooling

### 1.1 semgrep — CLEAN
Ran `semgrep` with `p/javascript`, `p/react`, `p/secrets`, `p/nodejs`, `p/owasp-top-ten` (plus a separate `--config=auto` run) across `src/`.
- **301 files scanned, 0 skipped, 0 findings, 0 errors.**
- Verified rules actually loaded (a single-file run reported "104 rules run") — the 0 is a genuine clean result, not a silent no-op. This tree has had prior SAST passes and is hardened.

### 1.2 eslint — CLEAN (with a coverage-gap note)
`npx eslint .` → **0 messages.**
- **INFO / coverage gap:** the eslint config has **no security plugin** (only `react`, `react-hooks`, `unused-imports`) and explicitly **excludes `src/lib/**` and `src/components/ui/**`** from linting (`eslint.config.js`). So eslint is not providing meaningful SAST coverage of the security-sensitive `src/lib` modules. Consider adding `eslint-plugin-security` and widening the glob, or rely on semgrep (which does cover the full tree).

### 1.3 npm audit — 17 vulns, reachability analysis (NOT auto-fixed, per instruction)
`npm audit`: **0 critical, 6 high, 11 moderate.** Classified by actual reachability in this app's runtime:

| Package | Sev | Reachable here? | Why |
|---|---|---|---|
| vite, rollup, postcss, picomatch, minimatch, brace-expansion, flatted, ajv | high/mod | **No — dev/build only** | Build toolchain + eslint cache. Not in the shipped runtime bundle. |
| **lodash** | high | **No — declared but unused** | `grep` confirms it is imported **nowhere** in `src/`. Dead dependency. |
| **react-quill → quill@1.3.7** (XSS) | mod | **No — declared but unused** | `react-quill`/`ReactQuill` imported **nowhere** in `src/`. Dead dependency. |
| dompurify@3.3.1 (via jspdf) | mod | **No — code path not exercised** | jspdf is used (PDF export) but **`.html()` is never called**, so jspdf's bundled DOMPurify sanitizer never runs. |
| ws (via ethers) | mod | **No** | ethers uses HTTP `JsonRpcProvider` only; no `WebSocketProvider`/`ws` path. |
| @solana/web3.js → jayson → uuid | mod | **Low** | Solana `Connection` is used; the uuid advisory affects RPC-id generation only — no key/security impact. |

**Net:** of the 17, **0 are meaningfully exploitable** in the shipped app — all are dev-only, declared-but-unused, or unreachable transitive. Per your instruction, **nothing was changed** (no `npm audit fix`). Two of them (lodash, react-quill/quill) would simply vanish if those unused direct deps were removed — flagged below as optional cleanup, not done here because it's a dependency/lockfile change you deferred.

---

## 2. Manual review findings

Listed by severity. The biometric cache and any seed/key exposure lead, per the threat model.

### CRITICAL
**None.**

### HIGH

#### H-1 — DEMO-mode caches the vault password in plaintext `localStorage`
**`src/lib/biometricUnlock.js:72`** (`demoStore` → `localStorage.setItem('veyrnox-bio-unlock-secret', pw)`), read at `:73`, written via `storeUnlockSecret` `:181`, returned by `retrieveUnlockSecret` `:198`.

The vault password — the real key to the encrypted seed — is written **unencrypted** to `localStorage` whenever biometric one-tap is enabled in any build where `DEMO === true`. The simulated demo prompt (`BiometricPrompt`) is pure UI and gates nothing.
- **Native (production) is fine:** the cache lives in hardware-backed secure storage gated by a real OS biometric authenticate at the single `retrieveUnlockSecret()` chokepoint (the merged `fix/biometric-keychain-binding` work — reviewed, see §3). The plaintext path is **demo-only**.
- **Risk is the blast radius of `DEMO`** (`src/api/demoClient.js:21-46`): `DEMO` is true for `?demo=1` (persisted to localStorage), for `VITE_DEMO_MODE=1` builds, and for native **dev** builds (`import.meta.env.DEV && isNativePlatform()`). The gating is correct and well-documented, so a normal release can't accidentally enable it — but a build shipped with `VITE_DEMO_MODE=1`, or `?demo=1` opened on a profile that also holds a real vault, persists the password in cleartext, recoverable by any XSS or local-storage scrape.
- **Recommended fix (your decision — substantive):** (a) add a build-time guard that hard-fails a production bundle if `VITE_DEMO_MODE` is set; and/or (b) in `storeUnlockSecret`, refuse to cache a real vault password when `DEMO` is true (or store a random throwaway token in demo instead of the actual password). Either keeps the demo UX while removing the cleartext-password-at-rest.

### MEDIUM

#### M-1 — Self-XSS / unescaped interpolation in seed-print `document.write` — **FIXED**
**`src/pages/WalletSeedQR.jsx:63,71-75`.** `handlePrint()` interpolated `selectedWallet?.name`, `currency`, `address`, and the typed `seedPhrase` **raw** into `window.open(...).document.write(...)`. Data is self-controlled (the user's own wallet label + their own pasted seed), so it is **self-XSS, not attacker-controllable** — but it is an injection shape in a seed-handling flow, and the page also writes the plaintext seed into a popup. **Fixed this pass:** added an `escapeHtml()` helper and escaped all four user-controlled interpolations (the QR canvas DOM via `printRef.innerHTML` is React-rendered and left as-is). See §4.

#### M-2 — `ConnectWallet` queries MAINNET with the connected address (privacy / testnet-gating bypass)
**`src/pages/ConnectWallet.jsx:42-48,58,70-77`.** POSTs `getBalance` for the connected Phantom address to `https://api.mainnet-beta.solana.com` and `eth_getBalance` to MetaMask/Coinbase. This sends a real **mainnet** address + the user's IP to a third-party public node, **bypassing the app's testnet-by-default gating**. It is the external-wallet-connect surface (not the in-app vault), but for a no-telemetry privacy wallet it's a real address/usage leak. **Decision:** accept as inherent to showing a connected balance, or route via a user-configured RPC / disclose it.

#### M-3 — Send recipient ENS/SNS resolution leaks recipient + send-intent + IP
**`src/pages/SendCrypto.jsx:88,93`.** Typing a `.eth`/`.sol` recipient fetches `https://api.ensideas.com/ens/resolve/<name>` and `https://sns-sdk-proxy.bonfida.workers.dev/resolve/<name>`, revealing the intended recipient and send-intent to those third parties. Inherent to off-chain name resolution; no local/RPC-based resolver is used. **Decision:** accept, disclose, or move to an on-chain resolver.

#### M-4 — Weak `Math.random()` OTP (latent; currently dead code)
**`src/components/security/MFADialog.jsx:77`** and **`src/pages/SendCrypto.jsx:424`**: `String(Math.floor(100000 + Math.random()*900000))` generates a 6-digit OTP with a non-CSPRNG, then compares it **client-side** (`MFADialog.jsx:95`). Both paths are gated behind `if (!EMAIL_AVAILABLE) return;` (`EMAIL_AVAILABLE = BACKEND !== 'local'`), so they **never run in the shipped local/native build**. Flagged because if a backend is ever wired, this is a live weak-OTP issue, and the whole client-side-generate-and-check design is theater regardless. **Decision:** if the email/OTP feature is dead, remove it; if it's planned, use `crypto.getRandomValues` and verify server-side.

#### M-5 — Stale hosted-backend surface rendered OUTSIDE the gate
- **`src/App.jsx:114`** `/landing` (marketing) and **`:232`** `*` → `PageNotFound` render outside `<WalletGate>`. Neither exposes protected wallet data, but `/landing` advertises `/login`/`/register` flows that are now just `<Navigate to="/">` redirects (misleading in a security product), and **`src/lib/PageNotFound.jsx:10-20,43`** still calls `base44.auth.me()` and shows an "Admin Note" when `role === 'admin'` — which is always true for the demo user (`demoClient.js:60-66`). So in any demo build the 404 page shows a leftover hosted-backend admin hint to anyone, on any unknown path, while locked. No wallet data leaks; it's stale base44 residue that should have been removed. **Decision:** remove the `base44.auth.me()` admin note and confirm `/landing` is unreachable in native.

### LOW

- **L-1 — Password inputs lack `autocomplete` hygiene.** Unlock/create/import fields (`WalletEntry.jsx:362-369,446,515`) and reset fields (`WalletAccessReset.jsx:242-277,339-345`) set no `autoComplete`, so browsers/password managers may persist the vault password, partially defeating the on-device-only model. The seed `textarea` correctly uses `autoComplete="off"`; the password fields don't. *(Left unfixed — it's a real UX tradeoff with users who deliberately use a password manager; your call on `off` vs `current-password`/`new-password`.)*
- **L-2 — Seed clipboard + masking.** `WalletEntry.jsx:200-204,460` copies the full mnemonic to the OS clipboard on a single tap with no warning and no timed clear (it can sit in clipboard history indefinitely). `WalletSeedQR.jsx:130-131` masks the seed with `WebkitTextSecurity`, which is unsupported on Firefox (only the brittle `text-transparent` fallback remains). Both are common accepted wallet tradeoffs; consider a timed clipboard clear and not relying on `-webkit-text-security` as a privacy control.
- **L-3 — Mainnet third-party reads on mount (no address sent).** `GasTracker.jsx:17-19` (mempool.space, etherscan gas oracle, solana devnet), and price/news feeds `usePriceAlertNotifier.js:5`, `PriceAlerts.jsx:18`, `Calculator.jsx:18`, `CryptoNewsFeed.jsx:12` (cryptocompare). These leak IP + usage pattern to those hosts but **no wallet address**. The `extraParams=safecryptowallet`/`extraParams=...` is a cryptocompare app-id string, **not** an API key. Benign-ish; note for the no-telemetry posture.
- **L-4 — Entity store holds addresses + tx history in cleartext.** `src/api/localClient.js:73-82` persists all entity rows (wallet addresses, transaction history, approvals, watchlists) unencrypted in the `veyrnox-appdata` IndexedDB. No keys/secrets, but identity-linkable data at rest, not encrypted like the vault. Expected for a local-first store; flagged so it's a conscious choice.
- **L-5 — `DAppConnector` uses `Math.random()` for a WalletConnect `symKey`/`topic`** (`src/pages/DAppConnector.jsx:7-8`). The page is a **mock** (static sessions, the URI is only displayed, never used to establish a real session), so no real key custody today. Must move to `crypto.getRandomValues` if ever made real.
- **L-6 — `dangerouslySetInnerHTML` in `src/components/ui/chart.jsx:61`** injects a `<style>` from developer-supplied chart config (theme colors/CSS keys), no untrusted input reaches it. Standard shadcn component; no XSS vector. Info-level.

### INFO — confirmed solid (no action)

- **Crypto core re-confirmed (prior hardening intact, not undone by refactors):**
  - Argon2id `KDF_PARAMS` = 192 MiB / 3 iters / parallelism 1, `Object.freeze`d (`vault.js:51-56`); legacy 64 MiB floor used only to decrypt old blobs via their own recorded params — no downgrade path. Decoy/chaff KDFs spread the **same** `KDF_PARAMS` (`deniabilityUnlock.js:94-102`, `stealth.js:255`) — no timing tell.
  - Deniability runs a **constant 3 KDFs** on the primary-miss path with no early-return short-circuit (`deniabilityUnlock.js:115-152`); a total miss re-throws the original primary error so work-per-attempt is identical whether or not features are configured. Timing test pins it.
  - Stealth `POOL_SIZE = 256`; real and chaff blobs byte-shape-identical and both advertise current params (computationally indistinguishable); `createHiddenWallet`/`moveWalletToHidden` self-verify and refuse to clobber a different wallet. The only residual (different secret → same slot can overwrite) is a documented, unavoidable design limit, not a regression.
  - RNG: **CSPRNG only** in every key/salt/IV/mnemonic path (`crypto.getRandomValues`, `@scure/bip39`, `@noble`); no `Math.random()` in guarded paths; `scripts/check-crypto-rng.mjs` enforces it as a `pretest` gate.
  - AES-GCM: random 12-byte IV + 16-byte salt per encryption (`vault.js:132-133`); auth tag verified on decrypt, failures collapse to a generic error (no wrong-password vs tamper distinguisher); plaintext buffer zeroed after encrypt.
  - **No key material is ever logged or thrown** (zero `console.*` in `src/wallet-core`; throws carry only addresses/paths/fees/chainIds). All at-rest writes are ciphertext, shape-guarded `{ct,iv,salt}`.
- **Biometric cache clear is complete:** wired into create (`WalletProvider.jsx:423`), import (`:448`), disable (`:621`), change-password re-cache (`:474`), and panic-wipe (`:404`) — no orphaned copy. `retrieveUnlockSecret()` is the sole release chokepoint and is the only caller of the private raw read.
- **Gate is sound:** `isUnlocked` (driven by the in-memory mnemonic ref) is the single source of truth; lock truly unmounts the protected subtree (not CSS-hidden); auto-lock on idle/background/native-pause is wired; the `skipPasskey`/`skipBiometric` escape hatches still require the correct vault password (never weaker than baseline custody). No path exposes a locked vault's protected content.
- **No telemetry/analytics/crash-reporting** anywhere (no sentry/posthog/mixpanel/segment/gtag/firebase, no `sendBeacon`, no external `<script>`). Inherent wallet RPC/explorer reads use **keyless** public endpoints, testnet-gated by default; hidden-wallet balance lookups are deliberately opt-in to avoid auto-correlating hidden addresses.
- **No hardcoded secrets** (the many "secret" grep hits are the `…UnlockSecret` API names and the `bio_unlock_secret` keychain key *name*, not values). Test mnemonics are throwaway fixtures.
- **react-markdown (AI output)** renders with no `rehype-raw` and a custom components map → raw HTML escaped; links get `rel="noopener noreferrer"`. No XSS. (Also gated behind `LLM_AVAILABLE`.)

---

## 3. Biometric password-cache review (the newest security-sensitive code)

The merged `fix/biometric-keychain-binding` was reviewed specifically. Verdict: **the design is sound and the hardening holds.**
- **Single release chokepoint:** `retrieveUnlockSecret()` (`biometricUnlock.js:197-204`) is the only path that returns the plaintext, and on native it performs a real OS biometric `authenticateOrThrow` **before** the private `nativeReadSecret()` (which has no other caller). A cancel/failure throws; the secret is never read. A test pins the single-caller structure.
- **No logging / no error leakage:** the password is never passed to `console.*`, never put in an error message, and `clear`/`store` failures are swallowed (`catch {}`) without surfacing the value.
- **Clear-on-disable/panic/change/reset is complete** (see INFO above) — no orphaned copy across any path.
- **In memory only as long as needed:** retrieved password flows straight into `unlock(password, {skipBiometric:true})` and goes out of scope; not held in state.
- **Demo path:** the one weakness is H-1 (plaintext in demo localStorage). On native the cache is hardware-backed, ThisDeviceOnly, passcode-gated, biometric-gated at release.
- **Honest documented limitation (not a finding):** the native cache is an OS-enforced biometric match gating release *in code*, not a Keychain-bound item — so it lacks `biometryCurrentSet` auto-invalidation (wipe-on-biometric-change). Already disclosed in the file header as a follow-up needing a native shim.

---

## 4. What was fixed in this pass

**1 fix, trivial/unambiguous, zero behavioral downside:**
- **`src/pages/WalletSeedQR.jsx`** — added an `escapeHtml()` helper and applied it to the wallet name, currency, address, and seed phrase interpolated into the seed-print `document.write` (M-1). Escaping is a no-op for normal mnemonic words and labels, so the printed output is unchanged for valid input; it just removes the (self-)injection shape in a seed-handling flow. `eslint` clean, `check:rng` pass, full suite 317/317.

Nothing else was changed. `npm audit` was **not** touched (deferred per instruction).

---

## 5. Needs your decision (substantive — not fixed)

| # | Item | Suggested action |
|---|---|---|
| H-1 | DEMO caches vault password in plaintext localStorage | Build-time guard hard-failing a production bundle with `VITE_DEMO_MODE` set; and/or refuse to cache the real password in demo (store a throwaway token). |
| M-2 | ConnectWallet hits mainnet RPC with the address | Accept as inherent, or route via configured RPC / disclose. |
| M-3 | Send ENS/SNS resolution leaks recipient + IP | Accept/disclose, or use an on-chain/RPC resolver. |
| M-4 | Weak `Math.random()` OTP (dead code) | Remove the dead email/OTP path, or `crypto.getRandomValues` + server-side verify if planned. |
| M-5 | `/landing` + `PageNotFound` base44 admin note outside gate | Remove `base44.auth.me()` admin note; confirm `/landing` unreachable in native. |
| L-1 | Password inputs lack `autocomplete` | Decide `off` vs deliberate `current-password`/`new-password` (UX tradeoff). |
| L-2 | Seed clipboard no auto-clear; masking non-portable | Optional: timed clipboard clear; don't rely on `-webkit-text-security`. |
| — | Unused deps `lodash`, `react-quill`/`quill` (clears 2 audit entries) | Optional removal — deferred npm/dependency work, not done here. |
