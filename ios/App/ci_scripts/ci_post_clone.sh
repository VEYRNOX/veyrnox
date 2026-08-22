#!/usr/bin/env bash
# Xcode Cloud runs this immediately after checkout. Task: rebuild the
# Capacitor webview payload the archive step will package. Without this the
# .ipa ships whatever is in ios/App/App/public — which is gitignored.
set -euo pipefail
cd "$CI_PRIMARY_REPOSITORY_PATH"

# Node via Homebrew (Xcode Cloud image ships brew). Pin to Node 20 LTS.
brew install node@20 || true
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"

npm ci
npm run build
npx cap sync ios
