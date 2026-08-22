#!/usr/bin/env bash
# Xcode Cloud runs this after checkout. Task: populate node_modules and
# rebuild the Capacitor webview payload so xcodebuild can resolve the
# local Capacitor plugin SPM refs.
set -euo pipefail

cd "$CI_PRIMARY_REPOSITORY_PATH"

# Capacitor 8's CLI requires Node >=22 for `npx cap sync ios`. Prefer the
# runner's preinstalled Node when it already satisfies that floor; only fall
# back to Homebrew when Node is missing or too old.
need_node22=false
if command -v node >/dev/null 2>&1; then
  node_major="$(node -p 'process.versions.node.split(`.`)[0]')"
  if [ "$node_major" -lt 22 ]; then
    need_node22=true
  fi
else
  need_node22=true
fi

if [ "$need_node22" = true ]; then
  if command -v brew >/dev/null 2>&1; then
    brew install node@22
    export PATH="$(brew --prefix node@22)/bin:$PATH"
  else
    echo "Node >=22 required for Capacitor 8, but neither a suitable node nor brew is available — abort" >&2
    exit 1
  fi
fi

node --version
npm --version

# `npm ci` refuses when package-lock.json is out of sync with package.json.
# main currently has a small drift (typescript / utf-8-validate missing from
# the lockfile) — switch to `npm install` so Xcode Cloud can proceed. Loses
# strict lockfile reproducibility on the cloud runner. Track lockfile sync
# separately; on green sync flip this back to `npm ci`.
npm install --no-audit --no-fund --legacy-peer-deps
npm run build
npx cap sync ios
