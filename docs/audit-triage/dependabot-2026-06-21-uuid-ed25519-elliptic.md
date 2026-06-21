# Dependency advisory triage — Dependabot alerts #1–#3 (2026-06-21)

> Honest reachability triage of the three open GitHub Dependabot alerts on the
> default branch (2 moderate, 1 low). One is **fixed** by a surgical override; two
> have **no upstream patch** and are recorded as accepted exceptions with the exact
> condition that would make each live again. This continues the open thread left in
> `ethers-ws-advisory.md` ("the SOL `jayson → uuid` finding needs its own
> reachability pass before SOL's gate").

| # | Package | Resolved (before) | Vuln range | Patched upstream | Severity | Disposition |
|---|---------|-------------------|-----------|------------------|----------|-------------|
| 3 | `uuid` | 9.0.1 + jayson 8.3.2 | `< 11.1.1` | **11.1.1** | moderate | **FIXED** (override → 11.1.1) |
| 2 | `@stablelib/ed25519` | 1.0.3 | `<= 2.0.2` | none | moderate | Accepted exception |
| 1 | `elliptic` | 6.6.1 | `<= 6.6.1` | none | low | Accepted exception |

---

## #3 — `uuid` (GHSA-w5hq-g745-h8pq, moderate) — FIXED

**Finding.** `uuid` versions `< 11.1.1` miss a buffer bounds check in the
`v3`/`v5`/`v6` functions *when the optional `buf` output argument is supplied*.
Two resolutions were in range:

- `node_modules/uuid@9.0.1` — required by `@ledgerhq/client-ids` (`^9.0.0`)
- `node_modules/jayson/node_modules/uuid@8.3.2` — required by `jayson` (`^8.3.2`),
  pulled in via `@solana/web3.js`

(`rpc-websockets@uuid 14.0.0` was already past the patch and is **not** touched.)

**Fix applied.** Surgical `overrides` in `package.json`, scoped to the two
vulnerable consumers only:

```jsonc
"overrides": {
  "@ledgerhq/client-ids": { "uuid": "^11.1.1" },
  "jayson":               { "uuid": "^11.1.1" }
}
```

`uuid@11` is chosen deliberately over `@latest` (14): the 11.x line still ships a
CommonJS build, which `jayson` (CJS, `require('uuid')`) needs; uuid 14 is
ESM-first. After `npm install` every runtime `uuid` resolves to `11.1.1`
(jayson's nested copy is deduped away) while `rpc-websockets` keeps `14.0.0`. The
remaining `< 11.1.1` entry in the lockfile is `@types/uuid@10.0.0` — a
types-only dev package with no runtime code; not flagged by Dependabot, not a
runtime concern.

**Reachability (why the scope is correct).** The vulnerable path is `v3/v5/v6`
with a caller-supplied `buf`. Neither consumer is in a wallet seed/key path —
`@ledgerhq/client-ids` mints client identifiers, `jayson` is JSON-RPC plumbing
under the `receive_only` SOL stack — but because a real patched version exists,
the honest action is to take it rather than reason about exploitability. Done.

---

## #2 — `@stablelib/ed25519` (GHSA-x3ff-w252-2g7j, moderate) — accepted exception

**Finding.** Ed25519 signature malleability: the verifier omits the `S < L`
check, so a third party can maul a valid signature into a second distinct-but-
valid signature for the same message. Vulnerable range `<= 2.0.2`; **no patched
version exists** (the latest release, 2.0.2, is still in range). Resolved version
here is `1.0.3`.

**Reachability.** Only dependent in the tree is `@walletconnect/relay-auth`
(via `@walletconnect/core`, `@walletconnect/sign-client`, `@walletconnect/web3wallet`):

```
@walletconnect/{core,sign-client,web3wallet} > @walletconnect/relay-auth > @stablelib/ed25519@1.0.3
```

- It is **not** in any wallet seed/key path. Veyrnox's own signing is `@noble` /
  `@scure` (ed25519 for SOL is `@noble/curves` via SLIP-0010, per `CLAUDE.md` and
  `src/wallet-core/`). `@stablelib/ed25519` is used solely inside WalletConnect's
  *relay authentication* (signing/verifying the JWT used to talk to the relay).
- Malleability matters when code treats a signature as a unique identifier or a
  uniqueness/replay guard. WalletConnect relay-auth uses it to authenticate to the
  relay, not as a uniqueness key in this app; a malleated relay-auth signature does
  not move funds, sign a transaction, or expose key material (I1 holds).
- WalletConnect (PhaseD) handling is itself gate-scoped — see `docs/PhaseD.walletconnect.md`.

**Disposition: accepted exception.** No fix to apply (no patched version). Do not
bump `1.0.3 → 2.0.2`: still vulnerable, and a `1.x → 2.x` major could break
`relay-auth` (declares `^1.0.2`). **Re-triage trigger:** (a) StableLib ships a
release adding the `S < L` check → override to it and drop this exception; or
(b) any first-party code starts using `@stablelib/ed25519` to verify signatures,
or relies on relay-auth signature uniqueness → becomes LIVE, remediate then.

---

## #1 — `elliptic` (GHSA-848j-6mx2-7j84, low) — accepted exception

**Finding.** "Uses a cryptographic primitive with a risky implementation"
(ECDSA/EdDSA edge-case handling). Vulnerable range `<= 6.6.1`; **no patched
version exists** — `6.6.1` is the current latest, and the project already pins it
via `overrides.elliptic = "^6.6.1"`.

**Reachability.** Transitive only, across several consumers:

```
@ethersproject/signing-key      > elliptic   (ethers v5 legacy pkg, not ethers v6 core)
@walletconnect/utils            > elliptic
tiny-secp256k1                  > elliptic   (BTC path helper)
browserify-sign / create-ecdh   > elliptic   (polyfill toolchain)
```

- Veyrnox's first-party EVM signing is **ethers v6**, which uses `@noble/secp256k1`,
  **not** `elliptic`. The `@ethersproject/*` v5 packages are transitive (Ledger /
  WalletConnect / polyfills), not the wallet's signing core.
- Severity is **low** and there is nothing to upgrade to — already at latest.

**Disposition: accepted exception.** Pin already at the latest `^6.6.1`. **Re-triage
trigger:** `elliptic` publishes a fixed release → move the override to it; or any
first-party module imports `elliptic` directly for signing → becomes LIVE.

---

## Verification

- **Override correctness:** after `npm install`, lockfile audited programmatically —
  every runtime `uuid` resolves `>= 11.1.1` (only `@types/uuid` types pkg remains
  lower, by design); `rpc-websockets@uuid` stays `14.0.0`.
- **Production build:** `npm run build` (vite) — **PASS**, full chunked `dist/`
  emitted (the `jayson`/SOL path bundles cleanly under forced `uuid@11`, confirming
  no broken `require('uuid/v4')` deep-import).
- **Test suite:** `npm test` — **PASS**: `pretest` crypto-RNG check passed,
  `typecheck:core` (tsc) clean, vitest **150 files / 1339 passed, 2 expected-fail
  (1341), exit 0**. No regression from the forced `uuid@11` across the Ledger /
  jayson / SOL paths.
- **Not exploitability claims:** #2 and #3 above are reachability *accepted
  exceptions*, not "verified safe." Per project rules, nothing here is marked
  `verified`; these are honest dispositions with explicit re-triage triggers.

## What is NOT done here (honest boundaries)

- The two no-patch advisories (#1, #2) remain **open** in Dependabot by design.
  They can be dismissed with reason ("no patch available / not reachable", linking
  this doc) — that is an outward-facing Security-tab action and is left to the
  repo owner, not auto-applied.
- This triage is a code/lockfile + reachability analysis. It is **not** the
  independent third-party audit (still RECOMMENDED per `CLAUDE.md`).
