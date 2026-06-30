# Veyrnox — session context resume (2026-06-24, Mac)

Use this to orient a new session quickly. Read CLAUDE.md and MEMORY.md for full project rules.

---

## Where we are

**Branch:** `main` (unprotected — merge-when-green, no manual sign-off required)
**Last commit:** `d37641630` — `chore(ux): plain-English messaging + restore Argon2id KDF-bypass honesty (#357)`

### Recent work (last ~10 commits)
| Commit | Summary |
|---|---|
| #357 | Plain-English UX pass + Argon2id KDF-bypass honesty restored |
| #356 | Replace all crypto/dev jargon across UI |
| #354 | Voice commands 15-test suite + honesty gap fix in classification note |
| #353 | Hardware KEK, RASP OS probes, network hardening, cold-key signing |
| #351 | `router-human-loop` + `dynamic-spawner` agent types wired into CLAUDE.md auto-dispatch |
| #350 | Remove Payment Links + Desktop Web App pages |
| #349 | Passkey 2FA reactivity fix + PIN floor raised to 8 digits |
| #347 | H-1 passkey-2FA confirmed on Sepolia (on-chain), status kept BUILT |
| #343 | ECC audit: 9 UNAUDITED-PROVISIONAL tags reconciled |
| #340 | ECC independent audit findings resolved (C-1, H-1, H-2, M-3–M-6) |

---

## Gate status

| Gate | State |
|---|---|
| `ALLOW_MAINNET` | **true** (EVM — unlocked 2026-06-17, internal audit sign-off) |
| `ALLOW_BTC_MAINNET` | **true** |
| `ALLOW_SOL_MAINNET` | **true** |
| Independent audit (ECC) | **COMPLETE** — commit `3a63822` / main `6a7970c`; PR #340 merged `8f1dd95` |
| §24 audit gate | **SATISFIED** |

---

## Asset status (all 10 LIVE)

ETH, USDC, USDT, MATIC, ARB, OP, AVAX, BNB, BTC, SOL — all `status: 'live'`. No `receive_only` assets remain. See `src/wallet-core/assets.js` for txid evidence comments.

Notable edge cases:
- **BNB:** BSC-testnet tx `0xaeb3f7…`; minimum gas → use Standard+ fee tier
- **AVAX:** Fuji tx `0x675e75c9…`; Fuji RPC via publicnode (CSP blocks api.avax-test.network)
- **USDT:** Aave faucet stand-in on Sepolia (no official Tether Sepolia deployment)

---

## Test suite

Target: **Node 22** (Node 26 on this box shadows jsdom localStorage → mass false failures; use `nvm use 22`). Run `npm test` for full suite; `npm run typecheck` before pushing (CI runs tsc checkJs).

---

## Open items / known issues

| Item | Status |
|---|---|
| H-1 passkey-only 2FA send | BUILT — needs on-device testnet verification (owner deferred) |
| Decoy PIN routing | OPEN — owner deferred; correct-PIN→$0 decoy, silent-decoy-on-wrong-PIN design intent unclear |
| Panic Wipe residue gap | CONFIRMED CLOSED (ECC audit) |
| Multi-wallet / portfolios (PR #69) | NOT merged — AUDIT-REQUIRED |
| Base44 removal (PRs #60–62) | NOT merged — pending owner decision |
| UX batch 1 (PR #63) | NOT merged |
| Native entry-gate fix (PR #64) | NOT merged |
| Demo build guard (PR #67) | NOT merged |

---

## Working directory state (at session start)

```
 D .claude/scheduled_tasks.lock    ← deleted lock file (safe to ignore)
 M android/capacitor.settings.gradle
 M docs/status-widget.html
 M package-lock.json
 M package.json
?? Veyrnox/                        ← untracked output dir
?? dist-release/                   ← untracked build artifact
?? scripts/simdev.sh               ← untracked sim helper
```

---

## Subagent team (`.claude/agents/`)

- `veyrnox-recon` — read-only mapping + root cause before any change
- `veyrnox-ui` — design-system UI/a11y, preview-verified
- `veyrnox-security-tdd` — wallet-core fixes via strict TDD, never fake security
- `veyrnox-honest-reviewer` — correctness + the honesty bar
- `router-human-loop` — routes + human gate for destructive actions
- `dynamic-spawner` — open-ended discovery / unknown scope

Auto-dispatch rules: destructive → Router+Human Gate; unknown scope → Dynamic Spawner; known+safe → Parallel Execution.

---

## Key files

| Purpose | Path |
|---|---|
| Asset registry + gate flags | `src/wallet-core/assets.js` |
| EVM mainnet gate | `src/wallet-core/evm/networks.js` |
| BTC mainnet gate | `src/wallet-core/btc/networks.js` |
| SOL mainnet gate | `src/wallet-core/sol/networks.js` |
| Internal audit record | `docs/audit-triage/internal-audit-2026-06-17.md` |
| ECC audit record | `docs/audit-triage/ecc-independent-audit-2026-06-23.md` |
| Feature status | `docs/Feature-Status.md` |
| Audit scope | `docs/Audit.scope.md` |
| Dev send override | `src/lib/devSendOverride.js` |

---

## Honesty invariants (never violate)

- **Verify, don't assert.** "Verified" = real explorer-confirmed txid supplied by the user. Tests passing ≠ verified.
- **Status tags.** BUILT / TARGET / PLANNED / HONEST-DISABLED. Code-complete + green = BUILT at most.
- **No fake security.** Never mock a security control to look real.
- **Internal ≠ independent.** Never present the internal audit as independent.
- **I1–I5 invariants.** Keys never leave device; no silent egress; deniability mode = zero backend calls; fail honest/closed; backend untrusted.
