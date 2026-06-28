# Veyrnox — Static Application Security Testing (SAST) Findings

**Date:** 2026-06-01
**Branch:** `chore/sast-pass`
**Scope:** Static analysis + manual logic review of the wallet codebase (`src/`, focus `src/wallet-core/`, `src/lib/`). Testnet-gated, provisional, pre-audit code.
**Nature of this pass:** REVIEW + REPORT ONLY. **No application code was changed.** The only change on this branch is the addition of this document.

> ⚠️ **This is a first-pass internal SAST sweep, not an independent security audit.** It runs the obvious tooling and a focused human read of the crypto-critical files. It does **not** replace the independent third-party audit and on-device verification the code itself repeatedly flags as required before mainnet. See [What this pass does NOT cover](#what-this-pass-does-not-cover).

---

## Severity summary

| Severity | Count | Source |
|----------|-------|--------|
| **Critical** | 0 | — |
| **High** | 0 in first-party code · 8 in dependencies (npm audit, deferred) | tools |
| **Medium** | 3 | manual review |
| **Low** | 6 (4 manual + 1 eslint-security + 1 KDF-tuning) | tools + manual |
| **Informational** | several | tools + manual |

**Headline:**
- **No hardcoded secrets, private keys, or mnemonics were found committed** (gitleaks: 15 hits, **all verified false positives** — public contract addresses and clearly-labelled demo placeholder strings).
- **Semgrep (auto + `p/javascript` + `p/react` + `p/secrets` + `p/owasp-top-ten`) reported 0 findings** across 264 scanned files.
- **eslint-plugin-security:** 1 low-severity heuristic finding worth a glance (ReDoS heuristic on a bounded path regex) + 46 `detect-object-injection` warnings that are **all false positives** (static-keyed registry/typed-array access).
- **npm audit: 21 known vulnerabilities (8 high, 13 moderate, 0 critical)** — the pre-existing, deferred set. None are in the hand-written crypto; all are third-party (build tooling + the ethers/solana RPC stacks + a rich-text editor). **`npm audit fix --force` was NOT run.**
- The most substantive results are **3 Medium manual-review findings in the deniability stack** (stealth/duress/panic) — code that was **written in-house and is therefore reviewed here with extra skepticism** (self-review has blind spots; see each finding).

---

## How to read this report

Findings are split into **(a) tool findings** and **(b) manual-review findings**, as requested. For each: **severity · location · why it matters · suggested fix** (fixes are *suggested*, not implemented).

Files where the reviewer was auditing **their own previously-written code** are marked **🪞 SELF-REVIEW** and held to extra scrutiny — these are the easiest place for a confirmation-biased blind spot, so they get the most detail.

---

# (a) Tool findings

## A1. gitleaks — secret scanning ✅ no real secrets

**Tool:** gitleaks 8.30.1 · `gitleaks detect` over the working tree **and 63 commits of history** (~3.31 MB).
**Result:** 15 hits, **0 true positives.** All are `generic-api-key` heuristic matches on non-secret data:

| Flagged value | Location(s) | Verdict |
|---|---|---|
| `0x1c7d4b196cb0c7b01d743fbc6116a902379c7238` and other `0x…` | `src/api/demoClient.js`, `src/pages/TokenApprovals.jsx` | **Public on-chain contract addresses** (Sepolia USDC, Uniswap router, WETH, DAI, USDT). Not secrets — these are *meant* to be public. |
| `hidden-key-9753`, `move-secret-8642`, `real-pin-2468`, `duress-pin-1357`, `burn-everything-0000` | `src/pages/PanicWipe.jsx`, `src/pages/StealthWallets.jsx`, `src/wallet-core/__tests__/panic.test.js`, `scripts/verify-panic.mjs` | **Demo/test placeholder strings**, explicitly named `DEMO_*` constants used to pre-fill the demo UI and tests. Not live credentials. |

**Why it matters:** Confirms no mnemonic/private-key/API-key material was ever committed (the highest-impact class for a wallet). 
**Suggested fix (hygiene, not security):** add a `.gitleaks.toml` allowlist for the demo constants and the `src/api/demoClient.js` / `TokenApprovals.jsx` address tables so future CI runs are clean and real leaks aren't lost in noise.

---

## A2. semgrep — SAST rulesets ✅ clean

**Tool:** semgrep 1.164.0.
**Configs run:** `--config=auto`, then `--config=p/javascript --config=p/react --config=p/secrets --config=p/owasp-top-ten`.
**Scope:** `src/` (264 files scanned), 0 scan errors.
**Result:** **0 findings.** No injection, no dangerous sinks, no `eval`, no `dangerouslySetInnerHTML` misuse, no obvious secret patterns in first-party code.

**Caveat (honesty):** A clean semgrep run means none of the *registry's pattern signatures* matched. It does **not** mean the code is bug-free — semgrep does not understand the wallet's domain logic (deniability tells, KDF timing, UTXO conservation, collision probability). Those are exactly what the manual review below targets. Crypto/wallet-specific semgrep packs (e.g. a dedicated "web3"/"smart-contract-client" pack) are not part of the free registry and were not available; flagged as a recommended future addition.

---

## A3. eslint-plugin-security — JS security lint ⚠️ 1 low + FP noise

**Tool:** `eslint-plugin-security` (recommended config) run ad-hoc over `src/wallet-core/**`, `src/lib/**`, `src/api/**`. (Not yet wired into the repo's `eslint.config.js` — see suggested fix.)
**Result:** 47 warnings + 3 "errors". The 3 errors are **JSX parse errors only** (the ad-hoc config had no JSX parser for `.jsx` files) — **not security findings.** Real signal:

### A3.1 — `security/detect-unsafe-regex` — **Low (likely false positive)**
- **Location:** `src/wallet-core/sol/slip10.js:77` — `parseSlip10Path`, regex `/^m(\/[0-9]+['h])+$/`.
- **Why it matters:** The heuristic flags potential ReDoS (catastrophic backtracking). In practice the `/` delimiters are unique separators that cannot overlap the `[0-9]+` class, so backtracking is linear, and the input (a derivation-path string) is short and developer-supplied, not attacker-controlled at scale. Real ReDoS risk is **very low**.
- **Suggested fix:** Low priority. If desired, anchor more tightly or pre-bound segment length (`[0-9]{1,10}`) to silence the heuristic and remove any doubt.

### A3.2 — `security/detect-object-injection` ×46 — **False positives**
- **Locations:** `evm|btc|sol/provider.js`, `evm|btc|sol/networks.js`, `evm/tokens.js`, `vault.js:109`.
- **Why it's a FP:** Every flagged bracket access is either (i) a lookup into a **frozen, in-repo registry object by a known string key** (`NETWORKS[key]`, `_cache[networkKey]`, `getToken`) — the key space is closed and validated (`getNetwork` throws on unknown keys), or (ii) **typed-array index assignment** (`u8[i] = …` in `vault.js`'s base64 helper). No user-controlled key reaches a prototype-polluting sink.
- **Suggested fix:** None required. If wiring this plugin into CI, disable `detect-object-injection` (high FP rate on registry-style code) or add targeted `// eslint-disable` comments.

### A3.3 — Recommended addition
`eslint-plugin-security` is **not currently in `eslint.config.js`.** Recommend adding it (with `detect-object-injection` off) as a standing CI check alongside the existing `scripts/check-crypto-rng.mjs` RNG tripwire.

---

## A4. npm audit — dependency vulnerabilities ⚠️ 21 known (deferred)

**Tool:** `npm audit` (`npm audit fix --force` deliberately **NOT** run).
**Totals:** **21 vulnerabilities — 0 critical, 8 high, 13 moderate.** Dependency tree: 482 prod / 391 dev / 66 optional.

> npm's machine `dev` flag reports `false` for all 21 (each has at least one path through the production dependency graph as declared in `package.json`). That over-counts "runtime risk," because several are build-time-only tools that merely happen to be declared as `dependencies`. Below they are categorized by **actual function** — what an attacker would need to reach them — which is the security-relevant view. This is a judgement overlay on npm's flag, stated explicitly.

### HIGH (8)

| Package | Direct? | Function | Vuln | Runtime-reachable in the shipped wallet? |
|---|---|---|---|---|
| `lodash` | **direct** | utility | Code injection via `_.template` | Only if `_.template` is called on attacker input — **grep for usage**; likely build/tooling only. |
| `vite` | **direct** | **build/dev server** | Path traversal / dev-server file read | **Dev-only.** Exploit needs the dev server exposed; not in a production build. |
| `rollup` | transitive (via vite) | **build** | Arbitrary file write via path traversal | **Build-only.** |
| `axios` | transitive | HTTP client | NO_PROXY normalization → SSRF | Reachable only if shipped code makes axios requests to attacker-influenced hosts. |
| `flatted` | transitive | serialization | Unbounded-recursion DoS in `parse()` | Low impact (DoS) and likely tooling-side. |
| `minimatch` | transitive | glob | ReDoS | **Build/tooling.** |
| `picomatch` | transitive | glob | Method injection in POSIX classes | **Build/tooling.** |
| `socket.io-parser` | transitive | websocket framing | Unbounded binary attachments | Pulled via the Solana RPC websocket stack; reachable only with a ws RPC. |

### MODERATE (13)

| Package | Direct? | Function | Vuln |
|---|---|---|---|
| `@solana/web3.js` | **direct** | **runtime — used by SOL send/derivation** | depends on vulnerable `jayson` → `uuid` (missing buffer bounds check) |
| `ethers` | **direct** | **runtime — used by all EVM signing/sends** | depends on vulnerable `ws` |
| `ws` | transitive (ethers, solana) | **runtime websocket** | uninitialized memory disclosure |
| `engine.io-client` / `jayson` / `uuid` | transitive | runtime (solana RPC) | ws / bounds-check chain |
| `react-quill` · `quill` · `dompurify` | direct/transitive | **runtime — rich-text editor, renders in-browser** | **XSS** (quill XSS; DOMPurify XSS bypass) |
| `postcss` | **direct** | **build** | XSS via unescaped `</style>` in stringify output |
| `ajv` | transitive | schema validation | ReDoS via `$data` |
| `brace-expansion` | transitive | glob | process-hang / memory exhaustion |
| `follow-redirects` | transitive | HTTP | leaks auth headers on cross-domain redirect |

**Why it matters / prioritization for a wallet:**
- **Highest concern (runtime, in-browser, wallet context): `react-quill`/`quill`/`dompurify` XSS.** XSS inside an unlocked wallet page is the worst case — a script in the page can read the live in-memory mnemonic / DOM / IndexedDB. **Action:** confirm whether `react-quill` is actually rendered anywhere in the shipped app and, if so, whether it ever renders untrusted content; if unused, **remove the dependency entirely** (best fix — shrinks attack surface and clears 3 advisories). If used, ensure output is sanitized and pin to patched versions.
- **`ethers` / `@solana/web3.js` / `ws`** are unavoidable runtime deps actually used by the send paths. The app uses **HTTP `JsonRpcProvider`**, not websocket providers, so the `ws` memory-disclosure path is largely not exercised — but the transitive vulns still ship. Track upstream patched releases.
- **`lodash` code-injection (high, direct):** grep the codebase for `_.template`; if unused, this is inert. Worth confirming, not force-fixing.
- The build-tooling vulns (`vite`/`rollup`/`postcss`/`minimatch`/`picomatch`) do not run on user devices; they matter for the build host's integrity, not the shipped wallet.

**Suggested fix (do NOT force):** Triage individually. Safe non-breaking `npm audit fix` (no `--force`) addresses `vite` per the audit; everything else needs a deliberate, tested upgrade (several `--force` paths downgrade `@solana/web3.js`/`ethers` to ancient majors and **would break the wallet** — explicitly avoid). Prefer **removing `react-quill`** if it's not needed.

---

# (b) Manual-review findings (crypto-/security-critical files)

Files read in full: `vault.js`, `evm/vaultStore.js`, `signing.js`, `keystore/{keyStore,web,native}.js`, `derivation.js`, `mnemonic.js`, `evm/{send,token-send,calldata,approvals,poison,spam,provider,networks}.js`, `btc/{derivation,send,coinselect}.js`, `sol/{derivation,slip10,send}.js`, and `lib/WalletProvider.jsx`.

### What is solid (verified, not just asserted)

These were checked against the actual code, not taken on faith from the comments:
- **CSPRNG everywhere.** Mnemonics via `@scure/bip39` (platform CSPRNG); salt/iv via `crypto.getRandomValues`. The `scripts/check-crypto-rng.mjs` tripwire bans `Math.random()`/`Date.now()%` recursively under `src/wallet-core` and `WalletProvider.jsx`, wired as a `pretest` hook. No CSPRNG violations found.
- **Authenticated encryption, fresh nonces.** `vault.js` = Argon2id → AES-256-GCM with a **fresh random salt+iv per encryption**; decrypt failure is collapsed to one generic error (no wrong-password-vs-tamper oracle). Non-extractable WebCrypto key; derived raw key zeroed after import.
- **Only ciphertext at rest.** `vaultStore.saveVault` refuses to persist anything lacking `{ct,iv,salt}`; duress/stealth/panic mirror that guard. No plaintext seed is written anywhere.
- **Wrong-chain / replay protection.** Every EVM send/revoke (`evm/send.js`, `token-send.js`, `approvals.js`) re-fetches `provider.getNetwork()` and aborts on a chainId mismatch.
- **Key-controls-address checks.** BTC and SOL sends recompute the address from the supplied key and refuse if it ≠ `fromAddress` (`btc/send.js`, `sol/send.js`).
- **Anti-fund-burn invariant.** `btc/coinselect.js` enforces `sum(inputs) === sum(outputs) + fee` (BigInt sats) and `btc/send.js` re-checks it against the *actual signed bytes*. SOL's `planSolTransfer` blocks both rent-exemption fund-strand traps and the send path handles blockhash expiry with bounded refetch/retry.
- **Mainnet consistently gated** across EVM/BTC/SOL (`enabled:false` + a master `ALLOW_*_MAINNET=false`, enforced in `getNetwork`/`getProvider`, not just at the UI).
- **Approvals are revoke-only.** `approvals.js` hardcodes `approve(spender, 0n)` and self-decodes via `calldata.js` before signing; there is no general `approve(spender, amount)` broadcast in wallet-core.

The findings below are where the manual read diverges from, or adds nuance to, the code's own security comments.

---

## M1 — Stealth hidden-wallet slot collisions are materially more likely than the comments imply; a collision **silently destroys** another hidden wallet 🪞 SELF-REVIEW

- **Severity:** **Medium** (irreversible local fund loss; bounded to users who create multiple hidden wallets).
- **Location:** `src/wallet-core/stealth.js` — `slotForSecret` (`POOL_SIZE = 12`), `createHiddenWallet` (lines ~281–313).
- **What the code says:** *"POOL_SIZE is chosen so collisions are unlikely for a handful of wallets."*
- **What the math actually says:** Slots are `SHA-256(secret) mod 12` — a uniform draw over **12 buckets**. By the birthday bound, the probability that *some* pair of hidden wallets collides is roughly:
  - 2 hidden wallets: ~**8.3%**
  - 3 hidden wallets: ~**24%**
  - 4 hidden wallets: ~**42%**
  
  "Unlikely for a handful" understates this — at 3–4 hidden wallets a collision is a coin-flip-ish event, not a rare one.
- **Why it matters:** `createHiddenWallet` only calls `tryRevealHidden(secret)` for the **same** secret before writing. It **cannot** detect that a *different* secret's real wallet already occupies the target slot (by design there's no enumerable index — that's a genuine deniability requirement). So when a second hidden wallet's secret hashes to an occupied slot, `putKey(db, slot, blob)` **overwrites the first wallet's ciphertext**. The first wallet becomes unrecoverable from the app — indistinguishable from chaff without its secret. That's silent, irreversible loss of funds the user believed were stored.
  - Note the asymmetry: `moveWalletToHidden` *does* guard (`existing != null && existing !== mnemonic` → refuse), but the primary `createHiddenWallet` path does **not**.
- **Self-review caveat:** This is my own code and the original comment reflects optimism I did not pressure-test with the birthday math. Flagging it against my own prior reasoning.
- **Suggested fix (not implemented):** (a) raise `POOL_SIZE` substantially (e.g. 64–256) — it only affects seeding cost, never reveal cost (still one KDF); (b) on create, detect an occupied-but-not-mine slot by checking whether the slot currently holds chaff vs a real blob *that this secret can't open* — but since real/chaff are indistinguishable without the secret, the robust answer is (c) **probe-and-relocate**: derive a small deterministic sequence of candidate slots from the secret (e.g. `H(secret‖0), H(secret‖1), …`) and place/reveal along it, so a single collision doesn't clobber; and (d) correct the header comment to state the real collision probabilities. Any fix must preserve the constant one-KDF reveal and the no-enumerable-index property.

---

## M2 — Combined deniability stack leaks feature presence/count via **KDF-count timing**; partially undercuts the per-module "indistinguishable timing" claims 🪞 SELF-REVIEW

- **Severity:** **Medium** (deniability weakening — the threat these features exist to counter is a coercer/forensic examiner; uncertainty noted below).
- **Location:** `src/lib/WalletProvider.jsx` `unlock()` (lines ~333–393), interacting with `panic.js` `tryPanicUnlock`, `duress.js` `tryDuressUnlock`, `stealth.js` `tryRevealHidden`/`ensureStealthPool`.
- **The issue:** Each module's header analyzes its *own* timing in isolation (e.g. `duress.js`: "a failed guess does 2 KDF runs… indistinguishable"). But the **combined** failed-unlock path runs a *variable* number of Argon2id KDFs depending on which features are configured:

  | Configured features | KDFs on a **wrong** password |
  |---|---|
  | none | 2 — primary(miss) + stealth(always, pool seeded) |
  | duress only | 3 — primary + duress + stealth |
  | panic only | 3 — primary + panic + stealth |
  | panic + duress | 4 — primary + panic + duress + stealth |

  Each KDF is Argon2id at **64 MiB / t=3** — on the order of ~100 ms+, **well above** JS scheduling/network noise. So an attacker who holds the device and times a few wrong guesses can infer **how many deniability features are configured** — i.e. *that* a duress and/or panic and/or hidden setup exists, which is precisely what the features are supposed to hide.
  - Sharper sub-case: a **successful duress unlock short-circuits before stealth** (returns at the duress branch), so it runs *one fewer* KDF than a wrong guess with the same config. That's a timing distinguisher between "duress password" and "random wrong password," contrary to the duress design goal of runtime indistinguishability.
  - Root cause: `ensureStealthPool` makes the stealth KDF **always-on** for any device with a wallet, which shifted the baseline that `duress.js`/`panic.js` were reasoning against when they were written separately.
- **Why it matters:** The whole point of duress/stealth is that a coercer *cannot tell* a hidden/decoy wallet exists. A timing oracle that reveals the *count of configured deniability features* degrades that guarantee. It does not reveal secrets or contents, and exploiting it requires repeated local timing under noise — hence Medium, not High, and with honest uncertainty about real-world measurability.
- **Self-review caveat:** I wrote each module's timing analysis independently and each is locally correct; the gap is the **interaction**, which no single file's comments own. Classic self-review blind spot — the per-file reasoning looks airtight in isolation.
- **Suggested fix (not implemented):** Make the post-primary-miss path run a **constant number of KDFs regardless of configuration** — e.g. always evaluate all of {panic, duress, stealth} on every miss (seed real AES-GCM markers for the *absent* features too, so there's always a blob to attempt), and avoid early-return short-circuits that change the KDF count between success and failure. Equalize work, then branch on the boolean results. This needs careful design + a timing-harness verification and is exactly the kind of thing the independent audit should own.

> **Subsequently addressed (2026-06-27, architecture):** The constant-3-KDF design in
> `src/wallet-core/deniabilityUnlock.js` (merged as part of the H2 multi-seed container
> work, `commit b4871b1`) implements the constant-KDF architecture described above.
> Every post-primary-miss call now runs exactly 3 KDFs via `constantPanic` /
> `constantDuress` / `tryRevealHidden`, regardless of which deniability features are
> configured. The variable-KDF distinguisher this finding describes is architecturally
> resolved at the code level.
>
> **Status: BUILT-UNVALIDATED.** Wall-clock equalization still requires an on-device
> timing harness on the lowest-spec target device (see `docs/audit-triage/audit-2026-06-27-unvalidated-claims.md`
> M-A). The code structure is correct; the claim that 2500 ms sleep covers the real-device
> 3-KDF wall-clock time has not been measured under noise. Do not treat this as VERIFIED
> without a timing harness run. An independent audit should own the final verification.

---

## M3 — Argon2id KDF parameters are at the low end for a single-factor at-rest seed vault

- **Severity:** **Medium** (defense-in-depth; on web the password is the *sole* factor protecting the seed).
- **Location:** `src/wallet-core/vault.js` — `KDF_PARAMS` (`parallelism:1, iterations:3, memorySize:65536 KiB (64 MiB), hashLength:32`).
- **Why it matters:** 64 MiB / t=3 clears the OWASP *interactive-login* floor, but this KDF isn't gating a login — it's the **only** thing standing between an exfiltrated ciphertext blob and a user's seed on the **web** path (no hardware key-wrap; `web.js` `isSecureHardwareAvailable()` returns `false`). For an at-rest, offline-crackable, high-value secret, attackers can throw GPU/ASIC time at weak passwords. The parameters are reasonable but not conservative for this threat, and the file's own header already concedes "password strength bounds everything."
- **Note:** the native path (`native.js`, M2b) adds a biometric/passcode gate and hardware-backed at-rest storage, which materially strengthens this — but it's "PROVISIONAL — NOT AUDITED-SECURE" by its own header and uses an app-layer gate, not an OS-bound biometric ACL. So the strong factor is not yet dependable.
- **Suggested fix (not implemented):** Consider raising memory (e.g. 256 MiB where the device allows, tuned by device class as the comment anticipates) and/or iterations; **enforce a real password-strength floor** (zxcvbn-style meter + minimum) at vault creation; prioritize the hardware-key-wrap upgrade so the password stops being the sole web factor. Changing KDF params requires a vault-version bump + migration (the blob records its own `kdf`, so decryption of old blobs still works — good).

---

## L1 — Chaff word-count distribution differs from real hidden wallets (weak ciphertext-length distinguisher) 🪞 SELF-REVIEW

- **Severity:** **Low** (statistical, partial; does not directly reveal which slots are real).
- **Location:** `src/wallet-core/stealth.js` — `makeChaff` (strength ≈ 50/50 between 128 and 256 bits) vs `createHiddenWallet` (default `strength = 128`).
- **Why it matters:** Chaff sizes its fake ciphertext from a freshly generated mnemonic that is **~50% 12-word, ~50% 24-word**. Real hidden wallets are created with the **default 12-word** strength. AES-GCM ciphertext length ≈ plaintext length + 16, so a forensic examiner comparing slot `ct` lengths sees real-wallet slots cluster at 12-word lengths while ~half the chaff slots are noticeably longer (24-word). A slot with a 24-word-length blob is therefore *more likely chaff* — a weak prior that erodes (does not break) the "can't tell real from chaff" claim. The module's header concedes length/statistical attacks are out of scope, but this particular mismatch is self-inflicted and easy to remove.
- **Suggested fix (not implemented):** Make chaff's word-count distribution **match the real create path's** (default 12 words, or sample from the same distribution the UI actually offers), so real and chaff slot lengths are drawn from one distribution.

---

## L2 — In-memory "zeroization" of the mnemonic is largely ineffective (JS string immutability)

- **Severity:** **Low** (acknowledged platform limitation; the line implies more protection than it provides).
- **Location:** `src/lib/WalletProvider.jsx` `lock()` (line ~157): `mnemonicRef.current = ' '.repeat(mnemonicRef.current.length)`. Also `vault.js`: the `password` string and decoded plaintext bytes aren't all scrubbed.
- **Why it matters:** JS strings are **immutable** — assigning a new all-zeros string does **not** overwrite the original mnemonic's backing memory; the real secret lingers in the heap until GC (and may be copied by GC). The surrounding comments are honest that JS can't guarantee zeroization, but the `.repeat()` line reads like an effective scrub and isn't one. `vault.js` does correctly zero the *Uint8Array* plaintext/key buffers (those are mutable), which is the right pattern — strings are the gap.
- **Suggested fix (not implemented):** Where feasible, hold live secrets as `Uint8Array` (mutable, scrub-able) rather than strings, and `.fill(0)` them — matching what `vault.js` already does for buffers. At minimum, downgrade the comment so no one over-trusts the string overwrite. Full memory hygiene on web remains best-effort; the hardware-backed native path is the real mitigation.

---

## L3 — 4-character minimum for duress/stealth reveal secrets (these *are* the seed-encryption password)

- **Severity:** **Low** (user-chosen; consistent with documented tradeoffs).
- **Location:** `duress.js` (no explicit min beyond caller), `stealth.js` `createHiddenWallet`/`moveWalletToHidden` (`secret.length < 4` → throw). (Panic uses a higher floor of 6 — `MIN_PANIC_LEN`.)
- **Why it matters:** A reveal/duress secret is fed **directly** to `encryptVault` as the Argon2id password for a *real, independently-encrypted wallet* that can hold funds. A 4-character secret is brute-forceable offline once the blob is exfiltrated, especially given the KDF parameters noted in M3. The Argon2id cost raises the bar but doesn't rescue a 4-char secret.
- **Suggested fix (not implemented):** Raise the floor for any secret that encrypts a fundable wallet (align with or exceed the panic floor of 6, ideally enforce a strength meter), and surface the offline-crack risk in the UI for these secrets specifically.

---

## L4 — Panic wipe is logical deletion, not cryptographic media erasure (residual, documented)

- **Severity:** **Low** (clearly disclosed in-code; restated so the audit owns it).
- **Location:** `src/wallet-core/panic.js` — `panicWipeLocal` (`clearVaultStore` + best-effort `deleteVaultDatabase` + localStorage residue clear).
- **Why it matters:** IndexedDB `clear()`/`deleteDatabase()` removes logical records but **cannot guarantee** the underlying flash is sanitized (wear-levelling, COW, snapshots, swap). A forensic examiner with raw media access may recover the (still Argon2id+AES-GCM-encrypted) blob. The header is admirably explicit about this and about the "seed backup elsewhere still recovers" and "on-chain state remains" limits — so this is a *restatement for the audit*, not a discovered gap. The mitigating control (data was only ever ciphertext) is real and correct.
- **Suggested fix (not implemented):** None at the JS layer can fully close this. On native, prefer destroying a hardware-wrapped key (rendering the at-rest blob undecryptable) over best-effort record deletion — an item for the native hardening track.

---

## Informational (manual)

- **I1 — Calldata decode is advisory, enforcement lives in the UI.** `evm/calldata.js` `describeErc20Call` returns `{kind:'unknown'}` for any non-ERC20/unrecognized calldata. The anti-blind-signing guarantee therefore depends on the **confirm-screen UI actually refusing/warning** on `unknown`. Worth a UI-layer check (out of scope for these files) that `unknown` cannot be silently signed.
- **I2 — Address-poisoning screen is EVM-only.** `evm/poison.js` returns `null` (unscreened) for BTC/SOL recipients. Reasonable for an EVM-focused module, but BTC/SOL sends get no look-alike protection today; note for roadmap.
- **I3 — `signing.js` partially superseded.** `signing.js` (`sendNativeTransfer`) overlaps with `evm/send.js`; the former does **not** enforce the mainnet gate (it takes a raw `rpcUrl`), while `evm/send.js` does via `getNetwork`/`getProvider`. Confirm `signing.js` isn't a path that bypasses the gate; prefer routing all sends through the gated provider stack.
- **I4 — Unblocked, non-confirmed panic at unlock.** By design the panic PIN at the unlock prompt wipes with **no confirmation** (a dialog would be a duress liability). The misfire mitigations (≥6 chars, exact GCM decrypt, checked only after primary fails) are sound, but this remains a deliberately sharp edge — correctly documented, re-flagged for audit sign-off.

---

# What this pass does NOT cover

This is a static + manual-read pass. It explicitly does **not** cover, and these still require the independent audit / dedicated work:

1. **Dynamic / runtime behavior** — no execution-time analysis, no fuzzing, no actual timing measurement of the M2 KDF side-channel (the timing claim is from code reading + KDF-cost reasoning, not a bench harness), no DAST against a running instance.
2. **The independent third-party cryptographic audit** the code itself repeatedly flags as a precondition for mainnet — derivation correctness beyond the in-repo vectors, the duress/stealth/panic deniability model under a real adversary, and the M2b native key-handling design.
3. **Mobile/native security testing (MAST)** — iOS Keychain/Secure Enclave + Android Keystore/StrongBox behavior, the app-layer-vs-OS-bound biometric ACL gap `native.js` flags, jailbreak/root posture, backgrounding/screenshot leakage, deep-link/IPC surface, Capacitor bridge. `native.js` is "PROVISIONAL — NOT AUDITED-SECURE" by its own header and was read, not exercised.
4. **On-device / on-chain verification** — interop checks that derived BTC/SOL/EVM addresses match reference wallets on real devices; real testnet broadcast/confirm behavior; RPC-provider trust failures.
5. **Dependency reachability proof** — npm audit lists advisories; this pass did not prove exploitability of each (e.g. whether `react-quill`/`lodash._template`/`ws`-provider paths are actually reached in the shipped bundle). Those need a usage trace.
6. **Supply-chain integrity** — no lockfile-tamper / typosquat / install-script audit beyond `npm audit`'s advisory feed.
7. **Business-logic & UI-layer flows** — the React pages, demo client, balance/UX code, and the confirm-screen enforcement of calldata warnings (I1) were not exhaustively reviewed; focus was the crypto/security core.
8. **Backend / sync** — out of scope for this slice (and largely absent by design — only ciphertext would ever sync).

---

## Tooling appendix (reproducibility)

```
semgrep 1.164.0   → semgrep scan --config=auto src/
                    semgrep scan --config=p/javascript --config=p/react \
                                 --config=p/secrets --config=p/owasp-top-ten src/
gitleaks 8.30.1   → gitleaks detect  (working tree + 63 commits of history)
npm audit         → npm audit --json   (NOT npm audit fix --force)
eslint-plugin-security (recommended)   ad-hoc over src/wallet-core, src/lib, src/api
```
Raw tool outputs were captured to `/tmp` during the run (`semgrep-auto.json`, `semgrep-packs.json`, `gitleaks.json`, `npm-audit.json`) and are not committed.
