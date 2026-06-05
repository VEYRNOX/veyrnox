#requires -Version 5.1
<#
.SYNOPSIS
  Per-branch git worktree helper for Veyrnox (Windows / PowerShell).

.DESCRIPTION
  Gives each branch / work-stream its own isolated checkout under .worktrees/, so
  concurrent work never collides in a single working tree (the root cause of
  branch-switch races and accidental cross-branch operations).

  It encodes the safety lessons learned the hard way:
    * Standard location (.worktrees/, git-ignored).
    * Resolves the MAIN repo root from any worktree, so removal never runs from
      inside the worktree being removed.
    * Verifies a worktree actually materialised before reporting success.
    * Lock-safe removal: on Windows, esbuild (spawned by vite/vitest) leaves a
      long-lived helper process holding node_modules open, which makes
      `git worktree remove` fail with "Permission denied". This stops that
      helper and force-removes the directory.

.PARAMETER Command
  new | rm | list

.PARAMETER Branch
  Branch name (required for new/rm). Slashes are mapped to '+' in the directory
  name, e.g. feat/foo -> .worktrees/feat+foo.

.PARAMETER Base
  Base ref for a brand-new branch (default: origin/main). Ignored when the
  branch already exists locally or on origin.

.PARAMETER NoInstall
  Skip `npm install` in the new worktree.

.PARAMETER Force
  Pass --force to `git worktree remove` (also used by the fallback path).

.EXAMPLE
  .\scripts\worktree.ps1 new feat/my-thing
.EXAMPLE
  .\scripts\worktree.ps1 new fix/pr-123 -NoInstall
.EXAMPLE
  .\scripts\worktree.ps1 list
.EXAMPLE
  .\scripts\worktree.ps1 rm feat/my-thing
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory, Position = 0)][ValidateSet('new', 'rm', 'list')][string]$Command,
  [Parameter(Position = 1)][string]$Branch,
  [string]$Base = 'origin/main',
  [switch]$NoInstall,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'

function Invoke-Git {
  # Run git and throw on non-zero exit (native commands don't honour $ErrorActionPreference).
  $out = & git @args
  if ($LASTEXITCODE -ne 0) { throw "git $($args -join ' ') failed (exit $LASTEXITCODE)" }
  return $out
}

# MAIN repo root = parent of the common git dir. Works from any linked worktree,
# so `rm` never executes from inside the directory it is deleting.
$commonDir = (Invoke-Git rev-parse --path-format=absolute --git-common-dir).Trim()
$RepoRoot = (Resolve-Path (Join-Path $commonDir '..')).Path
$WtRoot = Join-Path $RepoRoot '.worktrees'

function Get-WtDir([string]$b) { Join-Path $WtRoot ($b -replace '[/\\]', '+') }

function Invoke-New {
  if (-not $Branch) { throw "new requires a <branch> argument" }
  $dir = Get-WtDir $Branch
  if (Test-Path $dir) { throw "Worktree directory already exists: $dir" }
  if (-not (Test-Path $WtRoot)) { New-Item -ItemType Directory -Path $WtRoot | Out-Null }

  & git fetch origin --prune | Out-Null

  $hasLocal = [bool](& git -C $RepoRoot branch --list $Branch)
  $hasRemote = [bool](& git -C $RepoRoot ls-remote --heads origin $Branch)

  if ($hasLocal) {
    Write-Host "Checking out existing local branch '$Branch' ->" $dir
    Invoke-Git -C $RepoRoot worktree add $dir $Branch | Out-Null
  }
  elseif ($hasRemote) {
    Write-Host "Tracking origin/$Branch ->" $dir
    Invoke-Git -C $RepoRoot worktree add --track -b $Branch $dir "origin/$Branch" | Out-Null
  }
  else {
    Write-Host "Creating new branch '$Branch' off $Base ->" $dir
    Invoke-Git -C $RepoRoot worktree add -b $Branch $dir $Base | Out-Null
  }

  if (-not (Test-Path (Join-Path $dir 'src'))) {
    throw "Worktree at $dir looks wrong (no src/). Aborting before any further action."
  }

  if (-not $NoInstall) {
    Write-Host "Installing dependencies (npm install) in $dir ..."
    Push-Location $dir
    try { & npm install --prefer-offline --no-audit --no-fund } finally { Pop-Location }
    if ($LASTEXITCODE -ne 0) { Write-Warning "npm install exited $LASTEXITCODE -- install manually before running tests." }
  }

  Write-Host ""
  Write-Host "Ready. cd into it with:" -ForegroundColor Green
  Write-Host "  cd `"$dir`""
}

function Invoke-Rm {
  if (-not $Branch) { throw "rm requires a <branch> argument" }
  $dir = Get-WtDir $Branch
  # Never operate from inside the worktree being removed.
  Set-Location $RepoRoot

  if (-not (Test-Path $dir) -and -not (& git worktree list) -match [regex]::Escape($dir)) {
    Write-Warning "No worktree found at $dir"; return
  }

  $removeArgs = @('-C', $RepoRoot, 'worktree', 'remove', $dir)
  if ($Force) { $removeArgs += '--force' }
  & git @removeArgs
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "git worktree remove failed (likely a locked file). Clearing locks and forcing."
  }

  if (Test-Path $dir) {
    # esbuild's persistent helper holds node_modules open on Windows.
    Get-Process esbuild -ErrorAction SilentlyContinue |
      Where-Object { $_.Path -and $_.Path.StartsWith($dir, [System.StringComparison]::OrdinalIgnoreCase) } |
      Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
    Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction SilentlyContinue
  }

  & git -C $RepoRoot worktree prune
  if (Test-Path $dir) { Write-Warning "Directory still present: $dir (close any process using it, then re-run)." }
  else { Write-Host "Removed: $dir" -ForegroundColor Green }
}

switch ($Command) {
  'new' { Invoke-New }
  'rm' { Invoke-Rm }
  'list' { & git -C $RepoRoot worktree list }
}
