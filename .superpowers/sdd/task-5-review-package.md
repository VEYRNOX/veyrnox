# Task 5 Review Package

## Commits
b8c60584 chore: add staging env config and build:staging script

## Stat
 .env.example |  5 +++++
 .env.staging | 11 +++++++++++
 .gitignore   |  3 +++
 package.json |  1 +
 4 files changed, 20 insertions(+)

## Diff
diff --git a/.env.example b/.env.example
index dcd903ff..60758fe0 100644
--- a/.env.example
+++ b/.env.example
@@ -18,20 +18,25 @@ VITE_DEMO_MODE=
 
 # Release build hardening toggle (1 in release builds).
 VITE_RELEASE=
 
 # Banner label shown in non-prod builds, e.g. SIT or UAT.
 VITE_ENV_LABEL=
 
 # Environment name consumed by build scripts, e.g. production | sit | uat.
 VITE_ENV=
 
+# ── Staging ─────────────────────────────────────────────────
+# Staging builds use .env.staging (checked in, no secrets).
+# CI injects VITE_WALLETCONNECT_PROJECT_ID from Actions variables.
+# Supabase is intentionally blanked — staging must not write to prod.
+
 # Vite base public path (only set if hosting under a sub-path).
 VITE_BASE=
 
 # --- RPC / indexer overrides (client-exposed, NOT secret) ---
 # Override the default public endpoints for any chain family. All are UNTRUSTED
 # infrastructure (reads + broadcast only; signing is always local on-device).
 # Set in .env.local, never committed.
 #
 # Solana — replace the flaky public devnet RPC (e.g. Helius / QuickNode free tier):
 VITE_SOL_RPC_URL_DEVNET=
diff --git a/.env.staging b/.env.staging
new file mode 100644
index 00000000..65c0552a
--- /dev/null
+++ b/.env.staging
@@ -0,0 +1,11 @@
+# Staging environment configuration.
+# Used by `npm run build:staging` and the Deploy Preview CI workflow.
+# No secrets here — those are in GitHub Actions secrets.
+
+VITE_ENV_LABEL=Staging
+VITE_ENV=staging
+
+# Staging does NOT connect to production Supabase.
+# Analytics and referral tracking are disabled in staging.
+VITE_SUPABASE_URL=
+VITE_SUPABASE_ANON_KEY=
diff --git a/.gitignore b/.gitignore
index 051362f0..a5346b21 100644
--- a/.gitignore
+++ b/.gitignore
@@ -34,20 +34,23 @@ vitest.worktree.local.mjs
 # Signing keystores. Globs, NOT exact filenames — a named-file rule
 # (e.g. `veyrnox-release.jks`) silently misses any other name, which is how
 # veyrnox-upload-new.jks sat unignored. Note `*.keystore` does NOT match `.jks`.
 *.jks
 *.p12
 *.jceks
 secrets.json
 # ...except the committed template of var NAMES (no values). The negation must
 # come AFTER the .env.* rule above or git keeps ignoring it.
 !.env.example
+# ...and the staging build config (public config only, no secrets — see
+# .env.staging itself and Task 5 of the staging environment CI pipeline plan).
+!.env.staging
 
 # Logs
 *.log
 npm-debug.log*
 
 # Audit harness run artifacts — generated, timestamped output of
 # scripts/audit/eth-wallet-audit.mjs. Regenerated on demand; never commit.
 docs/audit-runs/
 
 # OS / editor cruft
diff --git a/package.json b/package.json
index 86e42799..e4f934f0 100644
--- a/package.json
+++ b/package.json
@@ -65,20 +65,21 @@
     "build:demo": "cross-env VITE_DEMO_MODE=1 npm run build",
     "build:release": "cross-env VITE_RELEASE=1 npm run build",
     "mobile:build:release": "cross-env VITE_RELEASE=1 npm run build && npm run cap:sync",
     "build:beta": "cross-env VITE_RELEASE=1 VITE_ENV_LABEL=\"Testnet Beta\" npm run build",
     "mobile:build:beta": "cross-env VITE_RELEASE=1 VITE_ENV_LABEL=\"Testnet Beta\" npm run build && npm run cap:sync",
     "android:sync": "npm run build && cap sync android",
     "android:open": "cap open android",
     "android:run": "npm run build && cap run android",
     "build:sit": "cross-env VITE_RELEASE=1 VITE_ENV_LABEL=SIT npm run build",
     "build:uat": "cross-env VITE_RELEASE=1 VITE_ENV_LABEL=UAT npm run build",
+    "build:staging": "cross-env VITE_ENV_LABEL=Staging VITE_ENV=staging npm run build",
     "mobile:build:sit": "cross-env VITE_RELEASE=1 VITE_ENV_LABEL=SIT npm run build && npm run cap:sync",
     "mobile:build:uat": "cross-env VITE_RELEASE=1 VITE_ENV_LABEL=UAT npm run build && npm run cap:sync",
     "postinstall": "patch-package"
   },
   "dependencies": {
     "@aparajita/capacitor-biometric-auth": "^10.0.0",
     "@aparajita/capacitor-secure-storage": "^8.0.0",
     "@capacitor-community/speech-recognition": "^7.0.1",
     "@capacitor/android": "^8.4.2",
     "@capacitor/app": "^8.1.1",
