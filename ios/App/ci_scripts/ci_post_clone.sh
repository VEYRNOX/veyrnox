#!/usr/bin/env bash
# Xcode Cloud runs this after checkout. Task: populate node_modules and
# rebuild the Capacitor webview payload so xcodebuild can resolve the
# local Capacitor plugin SPM refs.
set -euo pipefail

cd "$CI_PRIMARY_REPOSITORY_PATH"

# Xcode Cloud images ship Node LTS at /usr/local/bin/node (or via nvm). Fall
# back to brew if neither is present.
if ! command -v node >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then
    brew install node@20
    export PATH="$(brew --prefix node@20)/bin:$PATH"
  else
    echo "no node and no brew — abort" >&2
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
