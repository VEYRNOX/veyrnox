# Mainnet Flag Change Gate — design rationale

## The problem this solves

Mainnet is already live (unlocked 2026-06-17, see `docs/MAINNET_ACTIVATION.md`).
A "gate" that checks whether `ALLOW_MAINNET === true` and fails CI when it's true
would fail on every single PR from now on — that ship has sailed, correctly.

What still matters, permanently, is: **if a future PR changes one of these flags,
a human needs to notice and explicitly sign off — because the blast radius of a
silent, un-reviewed flag flip is "real user funds move on the wrong network" or
"a chain that was deliberately disabled becomes reachable again."**

So the gate is **diff-based, not state-based**: it doesn't care what the flags
currently equal. It cares whether the CURRENT PR's diff touches them at all.

## Protected flags

- `ALLOW_MAINNET` — `src/wallet-core/evm/networks.js`
- `ALLOW_BTC_MAINNET` — `src/wallet-core/btc/networks.js`
- `ALLOW_SOL_MAINNET` — `src/wallet-core/sol/networks.js`
- `enabled: true/false` on any per-chain entry in the three `networks.js` files
  above (and `src/wallet-core/assets.js`, watched for consistency even though it
  doesn't currently carry `enabled`/`isTestnet` itself)
- `isTestnet: true/false` on any per-chain entry in the same files

These four files are an explicit allowlist, not "any file matching `enabled:`
anywhere in the tree" — scoping it this way keeps the gate from firing on
unrelated `enabled`/`isTestnet`-named fields in tests, mocks, or unrelated
config, which would erode trust in the signal fast.

## How detection works

`scripts/detect-mainnet-flag-changes.js`:

1. Computes a diff between the PR's `HEAD` and its base (`main` by default,
   or an explicit `--base <ref>`; also accepts a diff on stdin via `--stdin`
   for local testing without touching git state).
2. Parses the unified diff into per-file hunks of removed/added lines with
   accurate line numbers.
3. For each of the three network-registry files (+ `assets.js`), regex-matches
   the master-flag assignment pattern (`FLAG = true|false`) and the
   object-literal key pattern (`enabled: true|false`, `isTestnet: true|false`).
4. Where an old value and new value differ on the same logical diff position,
   it records a change: `{ flag, file, oldValue, newValue, lineNumber }`. For
   per-chain `enabled`/`isTestnet` changes, it also resolves the nearest
   enclosing `key: '...'` (e.g. `polygon`, `devnet`) so the label reads
   `enabled (polygon)` rather than a bare `enabled`.
5. Emits one JSON object on stdout: `{ hasMainnetChanges, changes }`.

The script always exits `0` on a successful run (whether or not it found
changes) — detection succeeding is not the same as "changes are bad". It exits
`1` only if the diff itself could not be computed (e.g. `git` failure), so a
silent no-signal state is never mistaken for "definitely no changes" by a
calling script.

## What CI does with the signal

The `mainnet-flag-gate` job in `.github/workflows/ci.yml`:

- Runs only on `pull_request` events (not `push`/`workflow_dispatch`), since the
  action taken (label + comment) is PR-scoped.
- Runs the detector against the PR's actual base branch.
- If `hasMainnetChanges` is true: adds the `mainnet-gate-required` label to the
  PR and posts a comment listing every changed flag, file, line, and old/new
  value.
- Does **not** fail the job, and is **not** a required check on `verify` or
  `android-release` — it runs independently.

## Why this is procedural, not an automatic block

This gate deliberately does **not** hard-fail CI or use branch protection to
physically block the merge button. Two reasons:

1. **Mainnet activation flag changes are sometimes legitimate and urgent** — e.g.
   disabling a single chain during an incident, or re-enabling it once resolved.
   An automatic hard block would either (a) require a bypass mechanism anyway
   (which defeats the point), or (b) block an emergency response.
2. **The actual security property wanted here is "a human looked", not "CI
   computed a boolean".** A regex-based flag detector is necessarily approximate
   (it can miss a cleverly obfuscated change, or a change to the *logic* around
   a flag rather than the flag's literal value). Treating its output as an
   unbypassable gate would create false confidence — "CI didn't flag it, so it
   must be fine" — which is worse than an honest, visible, human-in-the-loop
   label + comment that everyone understands is a nudge, not a proof.

Enforcement of "a flagged PR needs owner sign-off before merge" is therefore a
**people/process** control (documented in `docs/MAINNET_ACTIVATION.md`), backed
by a **visibility** mechanism (the label + comment), not a cryptographic or
CI-hard-block mechanism. This mirrors the project's honesty principle (I4: fail
honest) — the gate says what it actually is and does not pretend to be more.

## Known limitations (by design, not oversights)

- **Regex-based, not an AST parse.** A change that moves a flag's value via
  indirection (e.g. importing it from another module, or computing it from an
  expression instead of a literal `true`/`false`) will not be caught. This is an
  accepted tradeoff for a lightweight, dependency-free script; if such a pattern
  ever appears in the registry files it should be treated as itself suspicious
  (why would a security gate flag need indirection?) and caught in normal review.
- **`-U0` diff granularity.** Zero-context diffing gives exact line numbers but
  no surrounding context, so the per-chain entry label (`enabled (polygon)`)
  falls back to reading the CURRENT file on disk near the changed line if the
  diff hunk itself has no `key:` line to anchor to. This label is
  informational only — file + line number is the authoritative locator.
- **Advisory exit code.** The script never returns a "changes = bad" exit code;
  callers must inspect the JSON. This is intentional (see above).

## Files

- `scripts/detect-mainnet-flag-changes.js` — the detector.
- `.github/workflows/ci.yml` — `mainnet-flag-gate` job.
- `docs/MAINNET_ACTIVATION.md` — the process this gate supports.
