# Wallet-Core Security Audit — QA Findings

Scope: keystore/kek.js, vault.js, mnemonic.js, duress.js, deniabilityUnlock.js,
deniabilitySession.js, evm/send.js, btc/send.js, sol/send.js, ring boundary
(npm run lint:rings), stray console.log sweep. Static, read-only review; no source changes made.

## Argon2id KDF Parameters
Source: src/wallet-core/vault.js:49-54 (KDF_PARAMS, current/live).
- m (memorySize): 196608 KiB == 192 MiB -- PASS (threshold 65536 KiB / 64 MiB)
- t (iterations): 3 -- PASS (threshold 3)
- p (parallelism): 1 -- PASS (threshold 1)
- Output length: 32 bytes (hashLength) -- PASS (threshold 32)

Note: LEGACY_KDF_PARAMS (vault.js:60-65) is 64 MiB / t=3 / p=1 / 32B -- this is the floor used only
to decrypt pre-M3 vaults with their own recorded params (paramsFromVault, vault.js:239-249); new
vaults are never encrypted with it. Legitimate backward-compat floor, not a live weakening, and it
still meets the 64 MiB threshold -- no finding.

Import-path DoS guard: assertSaneKdfParams (vault.js:90-106) bounds attacker-controlled params from
an imported blob to [MIN_KDF_PARAMS, MAX_KDF_PARAMS] before any argon2id call -- correctly prevents
a pre-auth OOM/DoS from a malicious backup file. No finding.

## AES-GCM Nonce Handling
Source: src/wallet-core/vault.js (encryptVault L276-290, encryptVaultWithDek L327-334) and
src/wallet-core/keystore/kek.js (wrapDek L269-278).
- Fresh nonce per encrypt: yes -- randomBytes(12) called inside every encrypt function, never
  reused across calls, never hardcoded.
- Source: crypto.getRandomValues (vault.js:111-115, kek.js:162-166) -- CSPRNG, not Math.random.
- Length: 12 bytes (96-bit GCM nonce) -- correct.
- Auth tag checked: yes -- crypto.subtle.decrypt throws on tag mismatch; caught and re-thrown as a
  generic "wrong password or corrupted vault" (vault.js:306-312) / KEK_UNWRAP_FAILED
  (kek.js:306-321), correctly not distinguishing wrong-key from tampered-ciphertext (deniability-
  safe oracle design).
- Nonce stored with ciphertext: yes (iv field alongside ct/salt in the returned blob).

No findings here -- nonce handling is correct.

## Mnemonic Entropy
Source: src/wallet-core/mnemonic.js.
- Source: crypto.getRandomValues (via @scure/bip39's internal CSPRNG, mnemonic.js:14-17,39-41) --
  not Math.random. The module's own header (L7-12) documents the prior Math.random()-based
  generator as the defect this file replaces.
- Size: 128 or 256 bits selectable (generateMnemonic(strength), mnemonic.js:35-42); 12-word default
  is 128 bits -- meets the floor.
- BIP-39 checksum on import: yes -- mnemonicToSeed calls validateMnemonic (wordlist + checksum)
  before deriving anything (mnemonic.js:62-67), and validateMnemonic is exported for callers to
  gate imports.
- Buffer clearing: mnemonic.js itself returns plaintext strings (a JS string cannot be zeroized)
  but is explicit that callers must treat the return as live secret material and hand it to
  vault.js immediately (L22-25) -- an accepted JS-platform limitation, not a code defect.

No findings here.

## Deniability / Duress
Source: src/wallet-core/duress.js, src/wallet-core/deniabilityUnlock.js,
src/wallet-core/deniabilitySession.js, cross-checked against src/lib/WalletProvider.jsx.
- Timing-equivalent: yes for the post-primary-miss resolution path -- resolveDeniabilityUnlock
  (deniabilityUnlock.js:190-217) unconditionally runs exactly 3 KDFs (panic slot, duress slot,
  stealth slot) with no early-return short-circuit, using dummyKdf/chaffBlob (L133-151) to pad any
  unconfigured feature to the same cost as a configured one. The primary-success fast path is
  padded separately by PRIMARY_UNLOCK_EQUALIZER_MS in src/lib/WalletProvider.jsx:211,1491.
- Errors identical: tryDuressUnlock (duress.js:160-168) never throws on a wrong password -- it
  returns null, and the caller re-throws the original primary-unlock error, so wrong-password and
  wrong-duress-password are indistinguishable at the message level. Documented as an INTENTIONAL,
  owner-approved deviation from the old no-oracle design (deniabilityUnlock.js:16-24): a wrong PIN
  now surfaces an explicit "Incorrect PIN" error distinct from "vault unlocked", which the module's
  own comments (L26-30, L71-96) call out as an accepted residual oracle, mitigated by a 10-attempt
  panic wipe rather than eliminated. This is honestly disclosed, not silently swallowed -- no
  finding, but flagging for visibility since the checklist calls out "identical error messages" and
  this is a knowing exception.
- No distinguishing storage keys: yes -- decoy vault is stored under a neutral key "secondary"
  (duress.js:69-71) in the SAME IndexedDB store as the primary vault, explicitly to avoid a
  storage-level tell. The module is honest that this is runtime deniability only, not
  VeraCrypt-style hidden-volume steganography (duress.js:40-46) -- a forensic attacker who dumps
  raw storage can see two blobs exist. Disclosed as a known/accepted limitation, not a hidden gap.
- No distinguishing console output: confirmed via the stray-console.log sweep below -- no console
  output found in any of these three files' non-test code.
- MINOR -- stale comment value. src/wallet-core/deniabilityUnlock.js:78 states
  "PRIMARY_UNLOCK_EQUALIZER_MS (1500 ms) is implemented in WalletProvider.jsx", but the actual
  exported constant in src/lib/WalletProvider.jsx:211 is 2000. The comment predates the Task 2
  VU-06 fix (which raised the equalizer to 2000ms) and was not updated. The code itself is
  coherent -- the constant is used consistently at WalletProvider.jsx:1491 and asserted by both
  src/wallet-core/__tests__/deniability-timing.test.js:178-185 and
  src/lib/__tests__/primaryUnlockEqualizer.test.js:25-36 (>= one KDF, <= 4x one KDF) -- the tests
  do not hardcode 1500 so they still pass. This is a doc/comment drift issue only, not a
  functional defect.

## Send Flow Validation
- EVM address validated pre-sign: yes -- isAddress(to) checked at the very top of
  signAndBroadcast before any provider/wallet construction (src/wallet-core/evm/send.js:29).
- BTC address validated pre-sign: yes -- assertValidBtcAddress(toAddress, net.params) is called
  before any UTXO/fee fetch in both estimateBtcSend (src/wallet-core/btc/send.js:104) and
  signAndBroadcastBtc (src/wallet-core/btc/send.js:152).
- SOL address validated pre-sign: yes -- assertSolRecipient(toAddress) is called before any
  balance/plan work in buildUnsignedSolTx (src/wallet-core/sol/send.js:204), estimateSolSend
  (src/wallet-core/sol/send.js:291), and signAndBroadcastSol (src/wallet-core/sol/send.js:343).
- Amount > 0 pre-sign: yes across all three families --
  - EVM: assertDecimalAmount(amountEth, 18) (src/wallet-core/evm/send.js:42) rejects
    zero/negative via the /[1-9]/ positivity check (src/wallet-core/amount.js:31-33).
  - BTC: selectCoins (src/wallet-core/btc/coinselect.js:137) explicitly throws
    "Send amount must be positive" for amountSats <= 0n, and line 138 additionally rejects
    amounts at/below the dust threshold, before any input selection; buildAndSignTx re-verifies
    fee conservation post-sign (src/wallet-core/btc/send.js:58-60).
  - SOL: planSolTransfer explicitly throws "Send amount must be positive." for amount <= 0n
    (src/wallet-core/sol/send.js:114).
- Gas/fee estimation failure handled: EVM's applyEstimatedGasLimit and BTC's getFeeRate are
  awaited and any rejection propagates as a thrown error (no silent fallback to an unvalidated
  default observed in the reviewed code); SOL fetches fee/rent/balance via Promise.all and any
  rejection likewise propagates.
- Signed tx not logged: confirmed -- no console.log (or other console.*) calls in
  src/wallet-core/evm/send.js, src/wallet-core/btc/send.js, or src/wallet-core/sol/send.js
  outside test files (see stray console.log sweep below). Private keys are documented as
  transient/never persisted/never logged in each file's header comments.

## Ring Boundary
- npm run lint:rings (eslint src --quiet): PASS -- no output, exit clean. No ring/import-boundary
  violations detected.

## Stray console.log
grep -rn "console.log" src/wallet-core/ --include="*.js" | grep -v "__tests__" returned zero
matches.
- Count: 0

(The initial file-name grep for duress/deniability/send matched console.log call sites only
inside __tests__/*.test.js files, which are excluded by the checklist's scope -- test-only
console output is not a production leak.)

## Findings Table
| ID | Severity | Description | File:line | Recommendation |
|---|---|---|---|---|
| WC-01 | LOW | Stale doc comment: cites PRIMARY_UNLOCK_EQUALIZER_MS as 1500ms; live value is 2000ms (post Task-2/VU-06 fix). Comment-only drift, no functional impact -- tests assert bounds, not the literal value. | src/wallet-core/deniabilityUnlock.js:78 | Update the comment to reference the current 2000ms value or drop the literal and point to WalletProvider.jsx as the single source of truth. |
| WC-02 | LOW (disclosure, informational) | The v2 deniability model intentionally reintroduces a wrong-PIN error oracle (distinguishable from a successful decoy/hidden unlock), mitigated only by a 10-attempt local panic wipe rather than eliminated. This is honestly and extensively documented in-file as an owner-approved, accepted residual risk -- flagged here purely so it is visible in this audit's findings table, not as an undisclosed defect. | src/wallet-core/deniabilityUnlock.js:16-30,71-96 | No action required beyond what's already documented; consider linking this residual explicitly from docs/Security.roadmap.md if not already done (file references it but was not verified in this pass). |
| WC-03 | HIGH (deniability tell) — OWNER-ACCEPTED, retained by decision | A `toast.success("Decoy mode active", { duration: 2000 })` fires on decoy/duress unlock at two sites, gated on `isDecoy && isUnlocked`. In a coercion scenario an over-the-shoulder observer sees both that a decoy/duress system exists and that it was just used, which contradicts the no-observable-decoy-branch intent documented in `src/wallet-core/duress.js:19-20`. **The wallet owner has explicitly decided to retain this 2-second toast** (2026-07-11) — it is therefore an accepted, deliberate UX trade-off, NOT a defect to remediate. Logged for audit visibility and threat-model transparency only. | src/components/WalletEntry.jsx:418, src/components/WalletEntry.jsx:628 | No action — retained by owner decision. If deniability against a co-present observer later becomes a hard requirement, reconsider; until then this is documented accepted behavior. |

## Summary
- Total findings: 3
- CRITICAL: 0 | HIGH: 1 (WC-03 — owner-accepted, retained by decision, no fix) | MEDIUM: 0 | LOW: 2
- Note: WC-03 is an accepted design trade-off per explicit owner decision, not an open defect. No inline fix applied per owner instruction.
