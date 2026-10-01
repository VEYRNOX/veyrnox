# Appium bundled-dependency remediation candidate

Status: BUILT candidate, not merged or device-verified. No alert dismissal,
independent audit, store submission, or application-security promotion is implied.

## Root cause

The published `appium-uiautomator2-driver@8.7.0` npm archive includes bundled
dependencies. A normal root override cannot replace those files. Clean installation
confirmed Axios 1.19.0 under the bundled support/base-driver packages, Morgan
1.11.0, and brace-expansion 5.0.9. Merely editing their lockfile versions would
not fix the installed code.

The candidate instead pins the official upstream source for the same release:
`7a54db007aa8a44f5df21cd0b52afc13c0d277ae` (tag `v8.7.0`). That source manifest
does not bundle its dependencies, so the root lock can resolve patched packages.
The Axios override is raised to 1.20.0, matching PR #2793. The blanket AJV 6
override is scoped to AJV 6 consumers: ESLint retains patched 6.15.0, while
Appium can load its required 8.20.0. The blanket override made the local Appium
CLI fail with `Cannot find module 'ajv/dist/compile/codegen'`.

This targets Dependabot alerts #58, #59, #62-#68 (Axios), #48 and #53 (Morgan),
and #56 (brace-expansion). It does not include the independent DOMPurify,
Rubyzip, or stream-json fixes. Alerts close only after merge and GitHub's
dependency-graph refresh confirms the vulnerable versions are absent.

## Installation and maintenance tradeoffs

- The exact Git SHA pins upstream source. This is not a fork or a custom package
  published under a third-party account.
- npm runs upstream's TypeScript preparation during installation. This needs
  network access and build tooling and is slower than installing a registry archive.
- npm may normalize the lock URL to `git+ssh`. npm 11.19's Git fetcher normally
  uses the public HTTPS archive/clone first; do not hand-edit generated lock metadata.
- npm skips Git package integrity verification. The source SHA is fixed, but the
  temporary preparation dependency installation is not controlled by our root
  lock. We do not claim bit-for-bit reproducible compiled output.
- A new upstream release will not automatically replace this SHA. Revisit the pin
  when a published driver carries patched dependencies, then repeat clean-install,
  installed-tree, startup, and Android session checks before returning to npm.

## Merge acceptance

1. Fresh-cache Node 22/npm 11 install with lifecycle scripts enabled succeeds.
2. Installed dependency checks find no vulnerable Axios, Morgan, or brace-expansion,
   including nested copies; a lockfile-only audit is insufficient.
3. The local Appium CLI starts and discovers/imports the pinned driver.
4. Lint and the release build pass.
5. Android CI uses the project-local Appium/driver, not a separate global install.
6. Review actual emulator session results. The existing hardware-dependent suites
   remain nonblocking, so the overall job's green badge alone is not acceptance.

No Android device was attached during initial investigation. Keep this PR draft
until the installation and Android harness evidence has been reviewed. Historical
accepted-residual notes remain history, not evidence that this candidate has merged.
