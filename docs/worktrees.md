# Per-branch worktrees

**Why:** a single shared checkout is the root cause of branch-switch races and
accidental cross-branch operations (e.g. a background test run going red because
another session switched branches mid-run, or a `git merge` landing on the wrong
branch). Give each branch / PR its own isolated checkout instead.

`scripts/worktree.ps1` manages these under `.worktrees/` (git-ignored).

## Usage (Windows / PowerShell)

```powershell
# New work off main (creates branch + worktree + installs deps)
.\scripts\worktree.ps1 new feat/my-thing

# Check out an existing local or origin branch (e.g. to review/fix a PR)
.\scripts\worktree.ps1 new fix/pr-123

# Skip dependency install (fast; for docs-only work or quick inspection)
.\scripts\worktree.ps1 new docs/whatever -NoInstall

# List all worktrees
.\scripts\worktree.ps1 list

# Remove a worktree when done (the branch itself is left intact)
.\scripts\worktree.ps1 rm feat/my-thing
```

After `new`, `cd` into the printed path and work there. Each worktree has its own
`node_modules`, so `npm test` / `npm run dev` never collide with another stream.

`feat/foo` maps to the directory `.worktrees/feat+foo` (slashes → `+`).

## Conventions

- **One branch per worktree.** Don't switch branches inside a worktree; make a
  new one. The default checkout (repo root) is just another worktree — prefer
  leaving it on `main` and doing feature work in `.worktrees/`.
- **Don't run background tests in a tree another session might switch.** With a
  worktree per branch this stops happening by construction.
- **Removal is lock-safe.** On Windows, `esbuild` (spawned by vite/vitest) keeps
  a helper process that holds `node_modules` open, so a plain
  `git worktree remove` can fail with *Permission denied*. `worktree.ps1 rm`
  stops that helper and force-removes the directory, then prunes. If it ever
  reports the directory is still present, close any editor/terminal sitting in
  it and re-run.

## Notes / trade-offs

- Each worktree runs its own `npm install` (`--prefer-offline`, so it's fast
  after the first). A shared `node_modules` via a junction is **not** used: it
  breaks Vite's `/@fs` module resolution.
- The script resolves the **main repo root** from any worktree, so `rm` is safe
  to run from anywhere and never deletes the worktree you're standing in.
- Branch lifecycle is unchanged: create PRs and merge as usual; `rm` only removes
  the working copy, not the branch or its history.
