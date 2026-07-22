#!/usr/bin/env node
// check-spm-paths.mjs — CI guard for Windows-style paths in the iOS SPM manifest.
//
// WHY: `npx cap sync` (and several Capacitor CLI subcommands) regenerate
// ios/App/CapApp-SPM/Package.swift using the HOST path separator. Run on Windows,
// they emit backslash paths:
//
//     .package(name: "CapacitorApp", path: "..\..\..\node_modules\@capacitor\app")
//
// instead of the correct POSIX form:
//
//     .package(name: "CapacitorApp", path: "../../../node_modules/@capacitor/app")
//
// THE RISK THIS GUARDS: backslash is Swift's string ESCAPE character, so the
// corrupted manifest is not merely wrong-for-macOS, it is invalid Swift —
// `\n` in `...\node_modules` is a newline, `\.` is an illegal escape. The iOS
// build breaks at manifest-parse time, and it breaks ONLY on the Mac. A Windows
// contributor sees a clean `git status` diff, green JS tests, and green CI (no
// CI job compiles the SPM manifest), so nothing surfaces the damage until
// someone opens the project on macOS. This repo is developed primarily on
// Windows while the iOS build requires a Mac, which is exactly the split that
// lets this reach main unnoticed.
//
// Observed 2026-07-22: a Capacitor CLI invocation during a dependency bump
// rewrote all 7 paths to backslashes locally. Caught by inspection, not by any
// gate — hence this script.
//
// RUN: anytime; reads the checked-in manifest only, no install or native build.

import { readFileSync, existsSync } from 'node:fs';

// The SPM manifests to police. Add here if the iOS project gains more.
const MANIFESTS = ['ios/App/CapApp-SPM/Package.swift'];

// Matches the `path:` argument of a .package(...) declaration.
const PATH_ARG = /path:\s*"([^"]*)"/g;

let failed = false;

for (const file of MANIFESTS) {
  if (!existsSync(file)) {
    console.error(
      `[check-spm-paths] MISSING: ${file}\n` +
      '  → the iOS SPM manifest is gone or moved. If the project was restructured, ' +
      'update MANIFESTS in scripts/check-spm-paths.mjs.',
    );
    failed = true;
    continue;
  }

  const src = readFileSync(file, 'utf8');
  const lines = src.split(/\r?\n/);
  const offenders = [];

  for (const [, value] of src.matchAll(PATH_ARG)) {
    if (value.includes('\\')) {
      const lineNo = lines.findIndex((l) => l.includes(value)) + 1;
      offenders.push({ value, lineNo });
    }
  }

  if (offenders.length) {
    console.error(`[check-spm-paths] WINDOWS PATHS: ${file}`);
    for (const { value, lineNo } of offenders) {
      console.error(`  line ${lineNo || '?'}: path: "${value}"`);
    }
    console.error(
      '  → these were almost certainly written by running a Capacitor CLI command ' +
      '(e.g. `npx cap sync`) on Windows.\n' +
      '  → backslash is Swift\'s escape character, so this manifest will not parse ' +
      'on macOS and the iOS build fails.\n' +
      '  → fix: replace every \\ with / in the path: arguments (or ' +
      `\`git checkout -- ${file}\`` + ' if the change was unintentional).',
    );
    failed = true;
  } else {
    console.log(`[check-spm-paths] OK: ${file}`);
  }
}

if (failed) {
  console.error('[check-spm-paths] FAILED — iOS SPM manifest contains Windows-style paths.');
  process.exit(1);
}

console.log('[check-spm-paths] PASS: all SPM package paths use POSIX separators.');
