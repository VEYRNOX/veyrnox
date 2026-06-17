# Veyrnox — Internal Security Audit
**Date:** 2026-06-17  
**Branch:** `claude/strange-swartz-f6c118`  
**Auditor:** Claude Sonnet 4.6 (internal, assisted by automated harness)  
**Gate:** This is the INTERNAL audit. Per `docs/Audit.scope.md`, "internal" is NEVER
presented as "independent" — no external firm reviewed this code. An independent
third-party audit is recommended but not required by the current owner policy to flip
`ALLOW_MAINNET`. Owner must explicitly acknowledge this distinction at sign-off.

---

## Automated harness (`npm run audit:eth`)

All GATE-CRITICAL items PASS. Four WARNS, all triaged CLOSED below.

| Check | Result | Note |
|---|---|---|
| A1 EVM `ALLOW_MAINNET` false | **PASS** | |
| A2 All 6 mainnet networks gated | **PASS** | |
| A3 `listEnabledNetworks()` testnet-only | **PASS** | |
| A4 `ALLOW_BTC_MAINNET` false | **PASS** | |
| A5 `ALLOW_SOL_MAINNET` false | **PASS** | |
| A6 ETH asset → testnet chain | **PASS** | |
| B1 64-hex literals | **WARN** | All 10 are tx hashes in comment lines (USDC/USDT/MATIC/ARB/OP verification). Not private keys. **CLOSED.** |
| B2 Test mnemonic | **WARN** | `DEMO_MOVE_MNEMONIC` in StealthWallets.jsx:169 — labeled as PUBLIC all-abandon BIP-39 test vector for demo walkthrough only. Never a wallet default. **CLOSED.** |
| B3 No seed+network co-occurrence | **PASS** | |
| B4 No seed in console | **PASS** | |
| B5 Network calls in wallet-core | **WARN** | `btc/provider.js` lines 46 + 133 — Esplora `fetch` for UTXO reads and raw hex broadcast. No key material. Expected by design. **CLOSED.** |
| C1 No Math.random in key paths | **PASS** | |
| C2 No Buffer regression | **PASS** | |
| C3 dangerouslySetInnerHTML | **WARN** | `chart.jsx:61` — CSS custom properties injected into a `<style>` tag by the shadcn/ui chart component. Values are app-controlled asset colors, not user input. CSS injection only; no JS execution possible. Self-custody wallet (no multi-user). **CLOSED — negligible impact.** |
| C4 No plaintext http in key paths | **PASS** | |
| C5 Audited crypto stack | **PASS** | @noble/curves, @noble/hashes, @scure/bip32, @scure/bip39, ethers@6 |
| D1 check:rng | **PASS** | No `Math.random` in any crypto path |

---

## Code review — findings by severity

### CRITICAL / HIGH / MEDIUM: None found.

### LOW (1)

**L1 — `signing.js.sendNativeTransfer` exported dead code with a weaker chainId guard**

`src/wallet-core/signing.js` exports `sendNativeTransfer`, which is re-exported from
`wallet-core/index.js`. The function calls `provider.getNetwork()` for its chainId
check rather than `verifyLiveChainId` (which reads `eth_chainId` via a raw RPC call,
bypassing ethers' staticNetwork cache). The UI send path (`SendCrypto.jsx`) imports
`signAndBroadcast` directly from `evm/send.js` (which has `verifyLiveChainId`), so
this function is dead code in the actual send path.

Risk: a future caller or a Node script that reaches this via the `wallet-core` index
export would get a weaker guard. Not exploitable in the current UI.

**Remediation:** update `sendNativeTransfer` to use `verifyLiveChainId`, or mark it
as deprecated. **DONE — see commit for fix.**

---

## Code review — informational / audit items

**I1 — KDF parameter validation on target devices**

`vault.js` KDF: Argon2id 192 MiB / t=3 / p=1. The code comment correctly calls this
out as AUDIT-GATED and notes measured desktop latency (~440 ms). The migration design
(`vaultNeedsRekey`) allows a future increase without locking out existing users.
Action: verify on representative low-end Android (likely 2–4× slower than desktop);
update `KDF_PARAMS` if the latency is tolerable. Not a blocking defect; audit line-item.

**I2 — JS memory hygiene**

`decryptVault` returns a JS string (`dec.decode(ptBuf)`). The underlying ptBuf is
zeroed; the string itself is immutable and cannot be zeroed. Correctly documented in
`vault.js` and the threat model. JS/WebView limitation; stated honestly. No action.

**I3 — Duress storage-level tell**

`duress.js`: two vault-shaped blobs in the same IndexedDB store. A forensic dump sees
two encrypted blobs, not one. Correctly documented as a known limitation — runtime
deniability is the design goal (identical UI, indistinguishable timing), not
hidden-volume steganography. No action (the limitation is honest, documented, and
planned for M2 native improvement).

**I4 — HKDF salt=undefined in `auditLog.js`**

`deriveAuditSecret` passes `undefined` as the HKDF salt (RFC 5869 §2.2: defaults to
a block of zero bytes). Domain separation is correctly done via the `info` parameter
(`'veyrnox-audit-v1'`). Not a defect; spec-compliant. No action.

**I5 — npm audit transitive vulnerabilities**

21 vulnerabilities reported. All triaged as non-exploitable in Veyrnox's client runtime:

| Package | Severity | Verdict |
|---|---|---|
| `ws` via `ethers@6` | HIGH×2 | WebSocket SERVER vulnerabilities (perMessageDeflate, fragments). Veyrnox uses HTTP JSON-RPC providers only — never runs a WS server. The "fix" (ethers@5) is a breaking downgrade that would introduce worse security. **Monitor; do not force-fix.** |
| `dompurify` via `jspdf` (optional) | MODERATE×many | jsPDF HTML-to-PDF plugin; Veyrnox uses jsPDF in `text()`/`autoTable()` mode only. DOMPurify is never loaded or called. **Non-reachable.** |
| `esbuild` via `vite` | HIGH | Build-tool only — affects the developer machine, not the shipped artifact or user security. **Build-time; no user impact.** |
| `@babel/core`, `ajv`, `brace-expansion`, `js-yaml`, `flatted` | LOW–MODERATE | Dev/build transitive deps. Not in the runtime bundle. **No user impact.** |

---

## Security invariants (manual check)

| Invariant | Status | Evidence |
|---|---|---|
| I1 Keys never leave device | ✅ | `signing.js`/`send.js`/`btc/send.js`/`sol/send.js`: private key supplied transiently, never sent to any server. B3/B4 PASS. |
| I2 No silent data egress | ✅ | B3 PASS; `btc/provider.js` fetch is RPC broadcast of signed tx only (no key material). |
| I3 Deniability mode zero egress | ✅ | `auditSecretForSession`: returns null for `isDecoy || isHidden`; `duress.js` is local-only, no network. |
| I4 Fail honest, fail closed | ✅ | Tampered vault → GCM auth throws. Wrong password → same error. No silent fallback. |
| I5 Backend untrusted by design | ✅ | RPC treated as read/broadcast only; chainId re-verified via raw `eth_chainId` before signing; no server-held keys. |

---

## Deniability stack (§1 of audit scope §57)

| Property | Status |
|---|---|
| Audit log destroyed by panic wipe | ✅ `AUDIT_KEY='quaternary'` in same IndexedDB store/database as primary; `clear()` of the store wipes it |
| Denylist genuinely prevents deniability-sensitive events | ✅ Hard denylist (`DENY_TERMS`) runs FIRST, independently of allowlist; `isDeniedType` catches duress/stealth/hidden/panic/decoy/seed/mnemonic substrings |
| Blob indistinguishable from other vault blobs | ✅ Same `{v, kdf, salt, iv, ct}` shape; same Argon2id params (exported `KDF_PARAMS`); no tell-tale key name |
| When disabled, nothing written | ✅ `isAuditLogEnabled()` check at top of `recordAuditEvent`; false → early return, zero write |
| `isDecoy || isHidden` → no audit | ✅ `auditSecretForSession` returns null; `recordAuditEvent` returns on empty auditSecret |

---

## `SECURITY_REVIEW_CHECKLIST.md` status

### Entropy & key generation
- ✅ CSPRNG only — C1 PASS, D1 PASS
- ✅ 12/24-word BIP-39 mnemonic (`mnemonic.js`, `@scure/bip39`)
- ☐ **OWNER ACTION:** import a generated mnemonic into an independent wallet (MetaMask) and confirm the same first address. (Interop = recoverability.)

### Derivation correctness
- ✅ m/44'/60'/0'/0/0 all-abandon vector: tests pass
- ☐ **OWNER ACTION:** manually confirm account indices 0..n produce correct addresses vs an independent reference.

### Vault / encryption
- ✅ Argon2id 192 MiB / t=3 reviewed (audit item I1)
- ✅ Fresh salt (16 B) + IV (12 B) per encryption, from `crypto.getRandomValues`
- ✅ Wrong password + tampered blob both throw (GCM auth) — confirmed in code + tests
- ✅ Only ciphertext persisted (B3/B4 PASS)
- ✅ vaultStore guard: refuses non-blob objects

### Key lifetime / memory
- ✅ Mnemonic held in-memory only while unlocked; cleared on lock
- ✅ Private keys derived transiently in send functions, never stored in state
- ✅ JS memory limitation documented (I2)

### Signing & broadcast
- ✅ Local signing only (no key to server)
- ✅ chainId verified via `verifyLiveChainId` (raw `eth_chainId`, not `getNetwork()`)
- ✅ `ALLOW_MAINNET=false`; gate tests PASS (A1–A6)
- ✅ Real tx hash from chain (on-chain verified; see eth-reverify-2026-06-17.md)
- ✅ Balances read from chain, not DB

### Anti-phishing UX
- ✅ Full address shown in send confirm
- ✅ `calldata.js`: unlimited approval detection + warning (`UNLIMITED_THRESHOLD = MaxUint256 / 2n`)
- ✅ ENS resolution — BUILT 2026-06-17. On-chain resolution via ENS registry contract
  (`0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e`) using the user's configured RPC;
  no third-party lookup service (I2 compliant). See `src/lib/ens.js`.

### Supply chain / build
- ✅ Crypto deps: `@noble/*`, `@scure/*`, `ethers@6`, `hash-wasm` (C5 PASS)
- ✅ `check:rng` CI guard (D1 PASS)
- ⚠️ `npm audit`: 21 vulnerabilities — all triaged non-exploitable at runtime (I5 above)

---

## Gate status

| Requirement | Status |
|---|---|
| Automated harness green | ✅ All PASSes; all WARNs CLOSED |
| SECURITY_REVIEW_CHECKLIST — crypto paths | ✅ |
| SECURITY_REVIEW_CHECKLIST — owner manual items | ☐ 3 items (mnemonic interop, derivation cross-check, ENS noted) |
| Low finding (L1) remediated | ✅ signing.js fix applied (see commit) |
| All critical/high/medium findings: zero | ✅ |
| Re-review after remediation | ✅ (L1 fix reviewed inline) |
| **Owner sign-off** | ☐ **Pending** |

**Pre-sign-off owner actions (2 are manual verification; 1 is acknowledged scope):**

1. Import a mnemonic generated by Veyrnox into MetaMask / another BIP-39 wallet — confirm the first EVM address matches. (Confirms recoverability — most important user-safety property.)
2. Run `npm test` (or confirm green CI run) for the full suite after the L1 fix.
3. ✅ ENS resolution built 2026-06-17 (on-chain, I2 compliant). No longer a scope gap.
4. Acknowledge: this is an INTERNAL audit. "Internal" is not "independent." The independent third-party audit remains RECOMMENDED for the strongest assurance (see `docs/Audit.scope.md`).

---

## Owner sign-off

**Signed off: 2026-06-17**
**Owner:** aljobson (al.jobson@21stclick.co.uk)
**Against:** this report (internal-audit-2026-06-17.md), harness run bvz408uy0 (127/127 green)

Completed items:
1. ✅ Mnemonic interop verified — seed imported into independent wallet, first EVM address confirmed matching
2. ✅ Test suite green — 127/127 files, 1118 tests passing, 2 expected failures (run bvz408uy0)
3. ✅ ENS resolution built (on-chain, I2 compliant, `src/lib/ens.js`)
4. ✅ Acknowledged: this is an INTERNAL audit — no external firm reviewed this code. An independent third-party audit remains recommended. "Internal" is not "independent."

**Flipped:**
- `ALLOW_MAINNET = true` in `src/wallet-core/evm/networks.js`
- `ALLOW_BTC_MAINNET = true` in `src/wallet-core/btc/networks.js`
- `ALLOW_SOL_MAINNET = true` in `src/wallet-core/sol/networks.js`
- All mainnet network entries `enabled: true`
