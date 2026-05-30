# Mobile Setup Checklist (Mac) — get M1 running on iOS + Android

> Goal: from a fresh Mac, get the existing Veyrnox app (already Capacitor-wrapped
> in M1) running on the iOS Simulator and Android emulator. One shared codebase,
> two build targets. Follow top to bottom.

## 0. Prerequisites to install (do the big downloads first)
- [ ] **Xcode** (Mac App Store) — large multi-GB download, start it FIRST.
      After install, open it once to accept the license + install components.
- [ ] **Android Studio** (developer.android.com/studio) + let it install the
      Android SDK and create an emulator (AVD).
- [ ] **Node.js** 64-bit, v20+ (nodejs.org) — verify: `node -v` and `node -p "process.arch"` (want x64/arm64, not ia32).
- [ ] **Git** (usually preinstalled on macOS; `git --version` to check).
- [ ] **CocoaPods** (iOS native deps): `sudo gem install cocoapods` (or via Homebrew).
- [ ] **JDK** (Android Studio bundles one; confirm `java -version` works).

## 1. Get the project onto the Mac
```bash
git clone https://github.com/aljobson/veyrnox-secure.git
cd veyrnox-secure
npm install            # installs deps incl. the Capacitor packages already in package.json
```

## 2. Sanity-check the project before mobile
```bash
npm run check:rng      # crypto RNG guard — must pass
npm test               # must be 58/58 green
npm run build          # produces the web build in dist/ (Capacitor's webDir)
```

## 3. Build web + sync into the native shells
```bash
npm run mobile:build   # = vite build && cap sync   (script added in M1)
```
This copies the latest web build into android/ and creates/updates ios/.
NOTE: the `ios/` folder may not exist yet (M1 added android/ on Windows). If
`npx cap sync ios` complains the iOS platform is missing, add it once:
```bash
npm install @capacitor/ios
npx cap add ios
npx cap sync
```

## 4. Run on simulators/emulators
- **iOS:**  `npx cap open ios`  → in Xcode, pick a simulator, press Run (▶).
- **Android:** `npx cap open android` → in Android Studio, pick the emulator, Run.

Expected: the Veyrnox web UI loads inside the native app. The Base44 login wall
will appear (no backend in local) — that's expected; reaching the wallet pages
on-device is part of later mobile auth work, not M1. M1 success = the app
launches and renders the shell on both platforms.

## 5. Accounts / signing (for real devices + submission, not simulators)
- Simulators/emulators need NO account — test freely there first.
- Physical device / TestFlight / submission needs the dev accounts.
- [ ] CONFIRM Apple account is an **ORGANIZATION** account (legal entity +
      D-U-N-S). Apple permits crypto wallets ONLY from org-enrolled developers.
      If it's an Individual account, start org enrollment (has lead time) — you
      can still build/test on simulators meanwhile.
- [ ] Google Play Console ready (non-custodial wallet = exempt from Google's
      crypto licensing, but a proper org listing is still advisable).

## 6. After M1 runs — next is M2 (native secure storage)
Once the shell runs on both platforms, M2 moves key storage from the web
IndexedDB vault to Secure Enclave/Keychain (iOS) + Android Keystore + biometrics
(per docs/Mobile.capacitor.md). M2 is security-critical → review carefully + it
belongs in the audit scope.

## Working across two machines (Windows + Mac)
GitHub is the bridge. Push from whichever machine you worked on; pull on the
other before starting. Don't switch branches with uncommitted work (the M1
tangle lesson). Always `git status` before `git checkout`.

## Hard line (unchanged)
Testnet only. Mainnet stays gated (ALLOW_MAINNET=false) until the independent
audit clears. Build MVP → freeze → audit → fix → THEN mainnet. Never the reverse.
