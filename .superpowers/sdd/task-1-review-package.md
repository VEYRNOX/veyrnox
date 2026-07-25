# Task 1 Review Package

## Commits
baa7b367 chore: add Cloudflare Pages config and security headers

## Stat
 .gitignore      | 3 +++
 public/_headers | 6 ++++++
 wrangler.toml   | 6 ++++++
 3 files changed, 15 insertions(+)

## Diff
diff --git a/.gitignore b/.gitignore
index 670f1078..051362f0 100644
--- a/.gitignore
+++ b/.gitignore
@@ -119,10 +119,13 @@ test-results/
 playwright-report/
 .auth/
 playwright/.auth/
 .claude/scheduled_tasks.lock
 .impeccable/
 .github/hooks/impeccable.json
 
 # Local Android signing credentials (NEVER commit)
 keystore.properties
 android/keystore.properties
+
+# Wrangler (Cloudflare Pages CLI)
+.wrangler/
diff --git a/public/_headers b/public/_headers
new file mode 100644
index 00000000..9268e992
--- /dev/null
+++ b/public/_headers
@@ -0,0 +1,6 @@
+/*
+  X-Frame-Options: DENY
+  X-Content-Type-Options: nosniff
+  Referrer-Policy: no-referrer
+  Permissions-Policy: camera=(), microphone=(), geolocation=()
+  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://*.walletconnect.com wss://*.walletconnect.com https://*.walletconnect.org wss://*.walletconnect.org; font-src 'self' data:; frame-ancestors 'none'
diff --git a/wrangler.toml b/wrangler.toml
new file mode 100644
index 00000000..45225ecf
--- /dev/null
+++ b/wrangler.toml
@@ -0,0 +1,6 @@
+# Cloudflare Pages deployment config.
+# Project must be created first: `npx wrangler pages project create veyrnox-staging`
+name = "veyrnox-staging"
+
+[pages]
+build_output_dir = "dist"
