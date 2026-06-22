# Veyrnox — project guide for Claude Code

Veyrnox is a self-custody, coercion-resistant crypto wallet (Vite + React + Capacitor;
ethers v6; @noble / @scure). Web + mobile (iOS/Android via Capacitor). The seed is the
identity; the app never holds keys server-side.

## Hard rules (do not violate)

- **Mainnet unlocked 2026-06-17.** Internal security audit complete; owner sign-off
  recorded in `docs/audit-triage/internal-audit-2026-06-17.md`. `ALLOW_MAINNET = true`,
  `ALLOW_BTC_MAINNET = true`, `ALLOW_SOL_MAINNET = true`. An independent third-party
  audit is still RECOMMENDED for the strongest assurance but was not required under the
  owner's gate policy. "Internal" is never to be presented as "independent" (I4 honesty).
  (See `docs/Audit.scope.md`.)
- **Verify, don't assert.** An asset/feature is "verified" ONLY after a real on-chain
  testnet transaction confirms on a block explorer with a txid the user supplies. Passing
  tests, clean review, or a green suite are NOT verification. Never flip an asset `status`
  to `live` or write "verified" without a real explorer-confirmed txid.
- **Status tags.** Every control/feature is BUILT (in code, testnet/provisional), TARGET
  (designed, audit-gated, not confirmed in shipped code), PLANNED (roadmap), or
  HONEST-DISABLED (present but off on principle). Code-complete + tests green = BUILT at
  most, never "verified".
- **Audit gate (§24).** The **internal audit** is the hard gate: it reviews the
  architecture BEFORE any backend or seed-touching build, and is the pass that opens
  mainnet. (An independent audit is also performed for depth, but does not gate.) RASP,
  hardware KEK, device attestation, network hardening, cloud recovery, and inheritance are
  TARGET/PLANNED — do not build them blind; they need real-device verification and the audit.
- **No fake security.** Never mock a security control to look real. If something can't be
  delivered honestly, honest-disable it (I4: fail honest, fail closed).

## Security invariants

- I1 — keys never leave the device. I2 — no silent data egress. I3 — deniability mode
  makes zero backend calls. I4 — fail honest, fail closed. I5 — backend untrusted by design.

## Demo mode (known trap)

Demo mode triggers on `?demo=1`, `VITE_DEMO_MODE=1`, native dev, OR a persisted
`veyrnox-demo=1` in localStorage (persists silently across reloads). Demo shows fake
seeded balances and fake sends. Before any real verification: clear demo (visit `/?demo=0`),
confirm a fresh real wallet shows 0.0 on-chain and no demo simulation box.

## Dev send ungate (testnet verification)

To send `receive_only` assets in dev for verification: set `VITE_DEV_UNGATE_SEND=1` via a
`.env.local` file (git-ignored) — NOT an inline shell var (fails on Windows/PowerShell).
This flips the gate decision only, never asset status, and is dead-code-eliminated from
production builds. The DEV UNGATE banner shows only on a receive_only asset, never on ETH.

## Wallet model

One HD seed derives per-chain accounts (Model B): a "wallet" is a seed; the Send screen's
asset selector chooses which asset/chain to send. EVM assets (ETH, MATIC, ARB, OP, AVAX,
BNB) share one secp256k1 m/44'/60' address; ERC-20s (USDC/USDT) are contract calls on it;
BTC (m/84'/UTXO/PSBT) and SOL (ed25519/SLIP-0010) have their own addresses and are fully
wired — both are LIVE with verified testnet txids (see `src/wallet-core/assets.js`).
AVAX and BNB share the EVM address and are now LIVE as well — both sent via the full
in-app UI path on testnet (AVAX Fuji `0x3697e0d…`, re-confirmed on-chain 2026-06-22;
BNB BSC-testnet `0x1a6ee75…`, per session record + owner confirmation, not yet
independently re-confirmed on-chain). All 10 assets are LIVE — see `src/wallet-core/assets.js`.

## Per-chain gotchas

- BNB testnet: enforces a minimum gas price; the "Slow" fee tier can underprice and get
  rejected — use Standard+.
- USDT: no official Tether Sepolia; uses an Aave faucet stand-in.

## Environment

- Windows (Git Bash / MINGW64). iOS native build is NOT possible here (needs a Mac).
- Use `.env.local` for env flags, not inline shell vars.

## Design system

UI follows the Veyrnox design system (see the design-system skill): calm near-black
surfaces (#050608 → #1D222B), one teal accent (#4ADAC2 = verified), Schibsted Grotesk for
prose / IBM Plex Mono for verifiable values (addresses, amounts, fees), deniability by
default (never show wallet count/list), plain-language risk before signing.

## Working pattern

- Reconnaissance before changes; report root cause before fixing.
- Pure helpers + unit tests where logic can be extracted (the codebase pattern).
- One moving part at a time. Don't mark anything verified without the user's on-chain txid.

## Multi-agent working pattern (the "team")

Treat substantial work as a team of specialists, dispatched in parallel where the work is
independent. The team is committed to the repo, so every session has it:

- **Subagents** (`.claude/agents/`): `veyrnox-recon` (read-only mapping + root cause),
  `veyrnox-ui` (design-system UI/a11y, preview-verified), `veyrnox-security-tdd` (wallet-core
  fixes via strict TDD, never fake security), and `veyrnox-honest-reviewer` (correctness +
  the honesty bar). Dispatch via the Agent tool; fan several out in ONE message to run them
  concurrently. Give each agent only its own files — never let two parallel agents edit the
  same file.
- **Command** (`.claude/commands/parallel-fix.md`): `/parallel-fix <area>` — recon → fan out
  one implementer per independent item → honest review → integrate & verify.
- **Workflow** (`.claude/workflows/branch-review.js`): run the `branch-review` workflow to
  review the current branch vs main across correctness / security-honesty / design-system /
  a11y, with each finding adversarially verified before it is reported.

Rules that still bind every agent: reconnaissance before changes; one moving part at a time;
security-sensitive files (seed/keys/signing/auth) are off-limits to cosmetic work; and nothing
is "verified" without the user's real on-chain txid.
