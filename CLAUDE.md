# Veyrnox — project guide for Claude Code

Veyrnox is a self-custody, coercion-resistant crypto wallet (Vite + React + Capacitor;
ethers v6; @noble / @scure). Web + mobile (iOS/Android via Capacitor). The seed is the
identity; the app never holds keys server-side.

**This file is kept short on purpose. It is loaded into every turn.** The full history
(incident write-ups, PR-by-PR audit record, dated evidence) lives in
`docs/CLAUDE-audit-archive.md`. The last full version of this file is the snapshot at the
end of that archive (2026-09-22). Read it when you need the why behind a rule. Add new
incident narrative there, not here. Put only rules and current state in this file.

## Model cost rule

Default to Haiku/Sonnet for subagents and routine work. Use Opus only for multi-file
architecture or security-critical code (wallet-core, signing, KEK, RASP).

## Hard rules (do not violate)

- **Supabase projects: enumerate from the API and match on the REF, never the name.**
  As of 2026-09-20 there are four. The wallet ones are `jwstkrtslotnjyerzzsi` (prod,
  eu-central-1) and `nszlbcmcysftwyudthjz` (staging, eu-central-1). The others are
  `yrqzwqywxfesmbvhzjgj` (veyrnox.ai staging, us-east-2; "staging" in the name, NOT the
  wallet) and `xdxdzmsztyzbnzeforxx` (veyrnox-ai-production-eu). Wallet DDL, grants,
  secrets and migrations go to the two wallet refs only. "Migration DONE" means applied to
  prod AND staging; verify both.
- **Prod DDL waits for the PR carrying that SQL to merge.** Staging first is fine.
- **DO NOT TOUCH the core infra wiring (locked 2026-08-11)** without an explicit user
  request naming the change. Before touching any of it, read the `docs/Feature-Status.md`
  2026-08-11 entry, then quote the exact line to the user and confirm:
  - TIP Worker (`veyrnox-tip` repo): `wrangler.toml` prod block (`workers_dev = true`),
    D1 `chat_cap_counters`, `api_keys`, the `src/lib/auth.ts` HMAC scheme, and the CF WAF
    rule "Challenge /chat requests from unknown origins".
  - Edge Function `tip-chat`: signing helpers, header set, `TIP_CHAT_BASE_URL` override,
    `MAX_SYSTEM_CONTENT = 32768`, `DEFAULT_ALLOWED_ORIGINS`, `verify_jwt: false`, and the
    `STATUS: BUILT, WIRED` header, which a test pins. **Redeploy only verbatim from
    `supabase/functions/tip-chat/index.ts`, staging first, then read the deployed body
    back with `get_edge_function` and diff it.** A repo header cannot tell you what is
    live. Prod has been entitlement-gated since 2026-09-20 (`ai_security_protection`,
    RevenueCat v2 lookup, `REVENUECAT_PROJECT_ID` required). A 403 for unentitled users
    is the paywall working, not an outage (#2659, #2662).
  - Edge Function `tip-screen`: `/api/v1/screen` only; the `action:'chat'` branch stays
    removed.
  - Supabase secrets on both projects (`TIP_*`, `SUPABASE_SERVICE_ROLE_KEY`,
    `REVENUECAT_*`). Rotate only when asked. A rotation without the matching Worker D1
    update kills prod chat. `REVENUECAT_V1_SECRET_KEY` is a v2-generation key: it gets
    403 on v1 endpoints, and `first-referral-bonus` has not been checked for that.
  - Cloudflare Pages `SUPABASE_ANON_KEY` must stay the publishable key. Pages secret
    changes apply only on the next deploy.
  - **Transak / Buy is owner-only.** Do not change the Buy flow, the relay
    (`transak-relay.veyrnox.com`, static IP `34.56.200.9`), secrets, or the Transak
    declaration. Report issues, never fix them or arm auto-merge. Prod runs PRODUCTION;
    staging stays on STAGING (`TRANSAK_ENVIRONMENT` unset). Do not collapse them.
    `TRANSAK_API_KEY` is public by design; the secret is the sensitive half. Changing how
    the widget opens or where the backend runs requires resubmitting Transak's security
    checklist. Runbook: `docs/transak-relay.md`.
  - RevenueCat offer IDs (`APPLE_OFFER_IDS`, Play tags), entitlement `safety_plus`, and
    the `rc-webhook` shared secret. The attribute key `veyrnox_referral_code` must match
    at both ends.
  - Client `SecurityAdvisor.jsx`: `TIP_CHAT_URL` = `${VITE_SUPABASE_URL}/functions/v1/tip-chat`,
    the `VITE_TIP_CONFIGURED` gate, and no client-side signing.
- **Once `SUPABASE_SERVICE_ROLE_KEY` is readable by a Pages Function, `ALLOWED_RPCS` in
  `functions/api/rpc/[fn].js` is the only boundary.** Never add a table proxy, a
  passthrough or a wildcard there.
- **Mainnet unlocked 2026-06-17** (ETH, BTC, SOL; all 10 assets live). The internal audit
  is complete. "Internal" is never presented as "independent" (I4). The independent
  third-party audit of the full stack remains outstanding.
- **Verify, don't assert.** "Verified" means a real on-chain tx confirmed with a txid the
  user supplies. Green tests are BUILT at most.
- **Status tags:** BUILT / TARGET / PLANNED / HONEST-DISABLED.
- **Audit gate (§24):** RASP, hardware KEK, attestation, network hardening and cloud
  recovery need real-device verification plus the audit. Personal Backup (2-of-3 Shamir)
  may be implemented ahead of the audit (owner override, 2026-08-08; see AGENTS.md).
- **No fake security.** Never mock a control to look real. Honest-disable instead
  (I4: fail honest, fail closed).
- **Sim: never enter a PIN or broadcast with real funds.** Verify via simulation/preview.

## Current state (pointers; re-derive before relying on any number)

- **Both stores are LIVE.** App Store 1.0.1 build 59 is `READY_FOR_SALE`, and Play is
  published. The 1.0.2 train is in TestFlight/Internal. Read versionCode from
  `android/app/build.gradle`; never write the current value here.
  **"Submitted" has an outcome: record it in the session that learns it.**
- **Real users exist:** thousands of telemetry devices, 500+ active subscribers, and one
  real full-price production purchase. No promotional offer has ever been exercised by a
  real purchase. Telemetry is consent-gated in `api/trackEvent.js` (egress) and
  `lib/consent.js` (writes), and suppressed in deniability/demo (I3).
- Hardware KEK is device-verified on iOS and Android, and RASP F-09 is device-verified on
  both (INTERNAL). Vault: AES-256-GCM, Argon2id 96 MiB/t=6 for new vaults, 192 MiB/t=3
  for older ones (the v2 migration flag stays OFF until Gate 1 of #2101).
- Open residuals: EVM key unzeroable (ethers v6), #1111 (vault AAD v:3), #2275 (17 inert
  e2e security assertions), and the independent audit.
- Detail and evidence: `docs/Feature-Status.md` and the archive.

## Pre-submission checklist (BOTH stores, every build incl. 1.0.2)

1. `npm run build && npx cap sync ios` immediately before any iOS archive
   (`ios/App/App/public` is gitignored and not rebuilt by xcodebuild).
2. The `.ipa` check must print nothing:
   `unzip -p App.ipa 'Payload/App.app/public/assets/index-*.js' | grep -oE 'VITE_(BYPASS_RASP|DEV_UNGATE_SEND|DEMO_MODE):"1"'`
3. The owner does a golden-path walkthrough on a stock device never touched by a debug
   build: Create Wallet, Import Seed, Send/Receive. This is now the sole Play gate; the
   Pre-launch report and FTL Robo are waived and advisory only.
4. `bash scripts/asc-crashes.sh` (exits 2 on error). Only `CLEAN` is a pass;
   `EMPTY`/`UNAVAILABLE` mean unmeasured. **Read the tester feedback comments.**
5. `scripts/play-vitals.sh` (`PLAY_VITALS_ACCOUNT` = the testlab SA). An empty result
   is NOT a pass.
6. Testers must have diagnostics sharing ON, or their crashes are invisible.

## Merging

- Required contexts (union of ruleset `17946638` and classic protection):
  `verify`, `unit-tests`, `Release-cert guard rejects wrong fingerprints`,
  `mainnet-flag-gate`, `staging-gate`. Re-derive with `gh api` before relying on this.
  There is no code-scanning gate. `strict` is false.
- **Needing `--admin` means the config regressed.** Diagnose it, don't habituate.
  Green but not merging? Check `mergeStateStatus`.
- **Codex arms `--auto --merge` (merge commit) on every open PR when asked.** Merge
  explicitly: `gh pr merge <n> --squash --match-head-commit <sha>`, and re-read
  `autoMergeRequest.mergeMethod` in any watch loop.
- Amendments to an open PR get a new PR from main. Never push onto an open PR's branch.

## Security invariants

- I1 — keys never leave the device
- I2 — no silent data egress
- I3 — deniability mode makes zero backend calls
- I4 — fail honest, fail closed
- I5 — backend untrusted by design
- I6 — Hardware Binding: KEK = HKDF(H ‖ C), an ordered concat, NOT XOR
  (`kek.js: combineKek`, domain `veyrnox/kek/v1/combine(H||C)`)

## Security coding rules (OWASP-aligned)

- **Input:** validate length/type/range/allowlist at every boundary. No
  `dangerouslySetInnerHTML`/`innerHTML`/`eval`/`Function()`/`document.write`. No shell
  interpolation; use `execFile`/array `spawn`. Allowlist deep-link, WalletConnect and
  `?demo=` params. Treat chain/WC metadata as untrusted.
- **Crypto:** AES-256-GCM plus Argon2id only. Key derivation via @noble/@scure (never
  Web Crypto). No custom primitives. CSPRNG only, never `Math.random`.
- **Secrets:** `.env.local` or platform secure storage only. The anon key is the only
  client key. Never log seeds, keys, mnemonics, PINs or KEK material; truncate or hash
  identifiers.
- **Access:** deny by default. Every signing request goes through `presignGateOrReject`;
  session approval uses the same gate shape. A missing or errored gate result = BLOCK.
- **Errors:** security-check errors deny. Crypto `catch` re-throws or denies. No stack
  traces, paths or DB errors to the user. Offer paths throw `OFFER_UNAVAILABLE`.
- **Deps:** pin crypto/security packages exactly. Run `npm audit` on any `package.json`
  change. New deps need justification.
- **Auth:** PIN ≥12 chars on mainnet builds. Biometrics backed by hardware keys.
  Step-up re-auth for signing, spend-limit changes and WC approval.
- **Supabase:** RLS on every table. All writes via rate-limited SECURITY DEFINER RPCs
  with a pinned `search_path`. Parameterised SQL only. No `SELECT *` in RPCs.
  Server-side timestamps and dedup tables. Every new RPC needs a rate limit, a payload
  cap and idempotency. DROP/TRUNCATE needs owner approval and a backup check.
- **API:** no sensitive data in URLs. CORS restricted to own domains. Generic error
  envelopes. Breaking RPC signatures need a coexistence window.
- **Network:** no fetching arbitrary user URLs server-side; block private IP ranges.
- **Tests must never write to production backends** (`vitest.config.js` blanks the
  Supabase env).

## Dev traps

- **Demo mode** persists via `veyrnox-demo=1` in localStorage. Clear with `/?demo=0`
  before any real verification. `/nft`, `/nft-multichain` and the suspicious-assets page
  render "This page isn't available right now." in demo/decoy. That is deliberate, not a bug.
- **`VITE_DEV_UNGATE_SEND=1`** goes in `.env.local`. It flips the gate decision only,
  never asset status.
- **`VITE_BYPASS_RASP=1` can't be built into a bundle** (it hard-fails at init, which
  shows as "Veyrnox couldn't start"). Remove it from `.env.local` for simulator builds.
- **iOS simulator builds must be signed** (`DEVELOPMENT_TEAM=R54268MWFV`, no
  `CODE_SIGNING_ALLOWED=NO`). Otherwise Keychain returns -34018 and wallet setup "fails
  securely". Check with `otool -s __TEXT __entitlements`.
- A simulator cannot exercise a decoy session; use a physical device.
- Staging builds use `--mode staging` with `.env.staging.local`. Never rename `.env.local`.
- Wallet model: one HD seed. EVM shares m/44'/60'. BTC is m/84' PSBT. SOL is
  ed25519/SLIP-0010. BNB testnet needs Standard+ fee. USDT testnet is an Aave faucet
  stand-in. WC test PINs are ≥12 chars.
- macOS/zsh. Windows paths, `%TEMP%` and `MSYS_NO_PATHCONV` anywhere in the repo are
  drift. Use `git commit -F - <<'EOF'` for multi-line messages. Brace `${SHA}:path` in zsh.
- `npm ci` works without `--legacy-peer-deps`. Regenerate the lockfile with
  `npm install --package-lock-only`.

## Working pattern

- Recon before changes; report the root cause before fixing. Pure helpers plus unit
  tests. One moving part at a time.
- `git fetch origin main && git log origin/main --oneline -15` before diagnosing.
  Cite SHAs; claims about other PRs are perishable. Check main before implementing a
  filed issue (other sessions and Codex fix them fast).
- **Verification traps.** Each of these gave a confident wrong answer at least once:
  - `grep` without `-F` on `$ { } ( ) [ ]` patterns silently returns 0. Confirm any
    grep that would close a finding against something that is not a grep.
  - An absence check matches the comment that documents the removal. Scope it to code,
    or for docs assert an expected count.
  - Logs the harness writes contain your own commands. Anchor to the log line prefix.
    `pgrep -f` matches itself; use the pid you were given.
  - SQLite writes land in `-wal`, so time the whole `db`/`db-wal`/`db-shm` family.
  - A dev server on a shared port may belong to another worktree (Playwright reuses it).
    Use your own port, or curl for a branch-only marker.
  - ASC "newest build": use `sort=-uploadedDate`, not `-version`. Build numbers restart
    per train.
  - An absence assertion can't tell dormant from dead. Prove a fail-closed control fires
    under an induced failure.
  - CI rollup: an absent context or `conclusion: ""` is pending, not green. Read the
    FTL `OUTCOME` table, not the run status.
- **Mutation-check every new test pin**: reintroduce the defect, see it go red, restore.
  Watch for prefix matches, pins matching their own comments, and fixed windows spilling
  into the next function.
- Run the full suite (and `npm run typecheck`) before calling a branch green. A shrinking
  test count is a red flag. Run lint after resolving conflicts in test files.
- "Align tests with the new flow" is a review smell. So is a disabled flag making tests
  pass vacuously.
- Deleting a component orphans its storage keys. Cross-check them against
  `ALL_RESIDUE_KEYS`. A key's presence is the tell.
- A search list is a floor, not a ceiling. Search implementation nouns, check
  `featureCatalogue.js` before writing "not implemented", and widen scan lists in the same
  session when a finding comes from an unmatched file.
- If a hold or lock is lifted, amend it here in the same session.

## The primary checkout is SHARED — never work in it

`/Users/aljobson/Documents/GitHub/veyrnox` is shared by scheduled tasks, other Claude
sessions and Codex. Never checkout/switch/rebase/stash, edit, or `npm install` there.
Read from refs (`git show origin/main:<path>`, and sanity-check with `git cat-file -s`),
not from its working tree.

```bash
git fetch origin main && git worktree prune
git branch --no-track <branch> origin/main   # --no-track REQUIRED: else bare push targets main
git worktree add .claude/worktrees/<name> <branch>   # in-repo; /tmp + symlinked node_modules breaks Vite
```

Each worktree needs its own `npm ci`. Remove it once the PR is open. Never
`git gc --prune`/`git prune`. Never bare `git stash`.

## Codex and other agents

- `codex review --base main` is an INTERNAL second review, never the independent audit
  (`docs/codex-review-runbook.md`).
- **Codex writes to this repo.** The ChatGPT app's agent shares the same git and `gh`
  identity. It works in the primary checkout, creates `codex/*` worktrees, force-pushes
  `claude/*` branches, and merges PRs. A mirror automation fleet in `~/.codex/automations/`
  duplicates the scheduled tasks. Before blaming a Claude session, check
  `grep -rlF '<branch>' ~/.codex/sessions`. State the head SHA when describing a PR.
- Subagents in `.claude/agents/`: `veyrnox-recon`, `veyrnox-ui`, `veyrnox-security-tdd`,
  `veyrnox-honest-reviewer`. Fan them out in one message.
- Scheduled-task runbooks: `.claude/scheduled-tasks/<task>/SKILL.md` is the copy that
  runs. Never add a mirror copy. Registry: `docs/scheduled-loops.md`.

## Design system

Calm near-black surfaces (#050608 → #1D222B), one teal accent (#4ADAC2 = verified),
Schibsted Grotesk for prose, IBM Plex Mono (`.mono-value`) for verifiable values.
Deniability by default (never show wallet count/list). Plain-language risk before signing.

## Key docs (read on demand)

- `docs/CLAUDE-audit-archive.md` — full history plus the pre-slim snapshot of this file
- `docs/Feature-Status.md` — per-feature status and evidence
- `docs/Audit.scope.md`, `docs/audit-triage/internal-audit-2026-06-17.md`
- `docs/branch-protection-config.md` — merge gates and restore payloads
- `docs/transak-relay.md`, `docs/rpc-service-role-migration.md`
- `docs/hardware-kek-phase-plan.md`, `docs/audit-2026-07-01-kek-internal.md`
